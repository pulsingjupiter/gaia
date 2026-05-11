/**
 * GET /api/avatars/custom
 *   → { avatars: Array<{ id, src, uploaded_at }> }
 *
 * Lists user-uploaded custom avatars by scanning
 * `app/public/avatars/custom/`. Sorted by upload time, newest first. Used
 * by the IconPicker to show the "Your uploads" section.
 */
import path from "node:path";
import fs from "node:fs/promises";

import { PATHS } from "@/server/db.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export type CustomAvatarEntry = {
  id: string;
  src: string;
  uploaded_at: number;
};

const FILENAME_RE = /^([0-9a-f-]{36})\.png$/i;

export async function GET(): Promise<Response> {
  const customDir = path.join(PATHS.appRoot, "public", "avatars", "custom");

  let dirents: import("node:fs").Dirent[];
  try {
    dirents = await fs.readdir(customDir, { withFileTypes: true });
  } catch (err) {
    const code = (err as NodeJS.ErrnoException)?.code;
    if (code === "ENOENT") {
      return Response.json({ avatars: [] });
    }
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json({ error: msg }, { status: 500 });
  }

  const avatars: CustomAvatarEntry[] = [];
  for (const d of dirents) {
    if (!d.isFile()) continue;
    const m = FILENAME_RE.exec(d.name);
    if (!m) continue;
    const uuid = m[1]!;
    const full = path.join(customDir, d.name);
    let stat: import("node:fs").Stats;
    try {
      stat = await fs.stat(full);
    } catch {
      continue;
    }
    avatars.push({
      id: `custom:${uuid}`,
      src: `/avatars/custom/${uuid}.png`,
      uploaded_at: stat.mtimeMs,
    });
  }

  avatars.sort((a, b) => b.uploaded_at - a.uploaded_at);
  return Response.json({ avatars });
}
