/**
 * POST /api/avatars/upload
 *   body: { source_path: string }
 *
 * Copies + processes a user-picked image (from /api/system/pick-file) into
 * `app/public/avatars/custom/<uuid>.png` as a square 256×256 PNG. macOS
 * native `sips` does the resize + center-crop — no npm dependency required.
 *
 * Path safety: the destination is ALWAYS computed from `PATHS.appRoot` and
 * a freshly generated UUID. `source_path` is never used to derive the
 * destination, so it cannot escape `public/avatars/custom/`.
 */
import path from "node:path";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";

import { PATHS } from "@/server/db.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 10 * 1024 * 1024;

const ALLOWED_EXTS = new Set([
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "heic",
  "bmp",
]);

type SpawnResult = { ok: boolean; stdout: string; stderr: string };

function runCommand(cmd: string, args: string[]): Promise<SpawnResult> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args);
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => {
      stdout += String(d);
    });
    child.stderr.on("data", (d) => {
      stderr += String(d);
    });
    child.on("error", (err) => {
      resolve({ ok: false, stdout, stderr: stderr || String(err) });
    });
    child.on("close", (code) => {
      resolve({ ok: code === 0, stdout, stderr });
    });
  });
}

/**
 * Sniff the magic bytes to confirm the file really is the image format the
 * extension claims. Catches both "renamed .txt → .png" and accidental
 * non-images. Returns null when the bytes don't match any known format we
 * accept.
 */
function detectImageFormat(buf: Buffer): string | null {
  if (buf.length < 12) return null;
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a
  ) {
    return "png";
  }
  // JPEG: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return "jpeg";
  }
  // GIF: 47 49 46 38 (GIF8)
  if (
    buf[0] === 0x47 &&
    buf[1] === 0x49 &&
    buf[2] === 0x46 &&
    buf[3] === 0x38
  ) {
    return "gif";
  }
  // WebP: RIFF....WEBP
  if (
    buf[0] === 0x52 &&
    buf[1] === 0x49 &&
    buf[2] === 0x46 &&
    buf[3] === 0x46 &&
    buf[8] === 0x57 &&
    buf[9] === 0x45 &&
    buf[10] === 0x42 &&
    buf[11] === 0x50
  ) {
    return "webp";
  }
  // BMP: 42 4D
  if (buf[0] === 0x42 && buf[1] === 0x4d) {
    return "bmp";
  }
  // HEIC: ....ftyp(heic|heix|hevc|hevx|mif1|msf1)
  if (
    buf[4] === 0x66 &&
    buf[5] === 0x74 &&
    buf[6] === 0x79 &&
    buf[7] === 0x70
  ) {
    const brand = buf.slice(8, 12).toString("ascii");
    if (["heic", "heix", "hevc", "hevx", "mif1", "msf1"].includes(brand)) {
      return "heic";
    }
  }
  return null;
}

function extMatchesFormat(ext: string, fmt: string): boolean {
  if (ext === fmt) return true;
  if (ext === "jpg" && fmt === "jpeg") return true;
  return false;
}

type Body = { source_path?: unknown };

export async function POST(request: Request): Promise<Response> {
  let body: Body = {};
  try {
    body = (await request.json().catch(() => ({}))) as Body;
  } catch {
    // empty body OK
  }

  const sourcePath =
    typeof body.source_path === "string" ? body.source_path.trim() : "";
  if (!sourcePath) {
    return Response.json(
      { error: "missing 'source_path'" },
      { status: 400 },
    );
  }

  // 1. File must exist.
  let stat: fs.Stats;
  try {
    stat = fs.statSync(sourcePath);
  } catch {
    return Response.json(
      { error: `source file not found: ${sourcePath}` },
      { status: 400 },
    );
  }
  if (!stat.isFile()) {
    return Response.json(
      { error: "source is not a file" },
      { status: 400 },
    );
  }

  // 3. Size cap (≤ 10 MB).
  if (stat.size > MAX_BYTES) {
    return Response.json(
      { error: `file too large (${stat.size} bytes; max ${MAX_BYTES})` },
      { status: 413 },
    );
  }

  // 2. Extension check.
  const dot = sourcePath.lastIndexOf(".");
  const ext = dot >= 0 ? sourcePath.slice(dot + 1).toLowerCase() : "";
  if (!ALLOWED_EXTS.has(ext)) {
    return Response.json(
      { error: `unsupported extension '.${ext}'` },
      { status: 400 },
    );
  }

  // 2b. Magic-byte sanity check — read just the header.
  let header: Buffer;
  try {
    const fd = fs.openSync(sourcePath, "r");
    try {
      const buf = Buffer.alloc(16);
      const read = fs.readSync(fd, buf, 0, 16, 0);
      header = buf.subarray(0, read);
    } finally {
      fs.closeSync(fd);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json(
      { error: `failed to read source: ${msg}` },
      { status: 500 },
    );
  }
  const detected = detectImageFormat(header);
  if (!detected) {
    return Response.json(
      { error: "file does not look like a supported image" },
      { status: 400 },
    );
  }
  if (!extMatchesFormat(ext, detected)) {
    return Response.json(
      {
        error: `extension '.${ext}' does not match detected format '${detected}'`,
      },
      { status: 400 },
    );
  }

  // 4. Generate id + compute destination strictly inside the allowed dir.
  const id = randomUUID();
  const customDir = path.join(PATHS.appRoot, "public", "avatars", "custom");
  const dest = path.join(customDir, `${id}.png`);

  // Defensive: the destination MUST be inside customDir. If someone ever
  // changes id generation to be user-controlled this check still catches it.
  const customDirResolved = path.resolve(customDir) + path.sep;
  const destResolved = path.resolve(dest);
  if (!destResolved.startsWith(customDirResolved)) {
    return Response.json(
      { error: "destination outside allowed directory" },
      { status: 500 },
    );
  }

  try {
    await fsp.mkdir(customDir, { recursive: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json(
      { error: `failed to create destination: ${msg}` },
      { status: 500 },
    );
  }

  // 5. Process via macOS `sips`:
  //    a) resize so the longest edge is 512 (preserve aspect — gives sips
  //       enough resolution to crop from without losing fidelity).
  //    b) center-crop to 256×256.
  // Use unique tmp files so concurrent uploads don't collide.
  const tmpRoot = await fsp.mkdtemp(path.join(os.tmpdir(), "gaia-avatar-"));
  const tmpResized = path.join(tmpRoot, "resized.png");
  try {
    const resize = await runCommand("/usr/bin/sips", [
      "-s",
      "format",
      "png",
      "-Z",
      "512",
      sourcePath,
      "--out",
      tmpResized,
    ]);
    if (!resize.ok) {
      return Response.json(
        { error: `sips resize failed: ${resize.stderr || resize.stdout}` },
        { status: 500 },
      );
    }
    const crop = await runCommand("/usr/bin/sips", [
      "-c",
      "256",
      "256",
      tmpResized,
      "--out",
      dest,
    ]);
    if (!crop.ok) {
      return Response.json(
        { error: `sips crop failed: ${crop.stderr || crop.stdout}` },
        { status: 500 },
      );
    }
  } finally {
    // Best-effort cleanup of the tmp dir.
    try {
      await fsp.rm(tmpRoot, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }

  return Response.json(
    {
      id: `custom:${id}`,
      src: `/avatars/custom/${id}.png`,
    },
    { status: 201 },
  );
}
