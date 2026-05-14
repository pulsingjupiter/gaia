/**
 * POST /api/settings/telegram/test
 *
 * Tests the Telegram bot token.
 * Can be called with a token in the query string to test before saving.
 */
import { getTelegramConfig } from "@/server/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const tokenOverride = url.searchParams.get("token");
  const dbConfig = getTelegramConfig();
  const token = tokenOverride || dbConfig.token;

  if (!token) {
    return Response.json(
      { ok: false, error: "No token provided" },
      { status: 400 },
    );
  }

  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/getMe`);
    const data = await response.json();

    if (!response.ok || !data.ok) {
      return Response.json({
        ok: false,
        error: `Telegram API error: ${data.description || "Unknown error"}`,
      });
    }

    return Response.json({
      ok: true,
      bot: {
        id: data.result.id,
        username: data.result.username,
        first_name: data.result.first_name,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ ok: false, error: `Network error: ${message}` });
  }
}
