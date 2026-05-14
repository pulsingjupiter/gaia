/**
 * GET   /api/settings/telegram → { token_set: boolean, token_masked: string | null, allowed_chat_ids: string }
 * PATCH /api/settings/telegram body: { token?: string | null, allowed_chat_ids?: string }
 */
import { getTelegramConfig, setTelegramConfig } from "@/server/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function badRequest(msg: string): Response {
  return Response.json({ error: msg }, { status: 400 });
}

export async function GET(): Promise<Response> {
  const config = getTelegramConfig();
  const token_masked = config.token ? `••••${config.token.slice(-4)}` : null;
  return Response.json({
    token_set: !!config.token,
    token_masked,
    allowed_chat_ids: config.allowed_chat_ids,
  });
}

export async function PATCH(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badRequest("invalid JSON body");
  }
  if (!body || typeof body !== "object") {
    return badRequest("body must be object");
  }

  const { token, allowed_chat_ids } = body as {
    token?: string | null;
    allowed_chat_ids?: string;
  };

  const patch: Partial<import("@/server/db").TelegramConfig> = {};

  if (token !== undefined) {
    patch.token = (token || "").trim();
  }

  if (allowed_chat_ids !== undefined) {
    const trimmed = allowed_chat_ids.trim();
    if (trimmed) {
      const ids = trimmed.split(",").map((s) => s.trim());
      for (const id of ids) {
        if (!/^\d+$/.test(id)) {
          return badRequest("Invalid chat IDs: must be comma-separated numbers.");
        }
      }
    }
    patch.allowed_chat_ids = trimmed;
  }

  if (Object.keys(patch).length > 0) {
    setTelegramConfig(patch);
  }

  return GET();
}
