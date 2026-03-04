import { extractActionsFromReply } from "@coach/ai";
import { insertConversationMessage, linkDiscordByCode, withClient } from "@coach/db";
import { getAiExtractionConfig } from "@/lib/ai";
import { jsonOk } from "@/lib/http";

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => ({}))) as {
    content?: string;
    channel_id?: string;
    id?: string;
  };

  const content = payload.content ?? "";
  const channelId = payload.channel_id ?? "";
  const maybeLink = content.trim().match(/^\/link\s+([A-Za-z0-9]{6,10})$/);
  if (maybeLink && channelId) {
    await linkDiscordByCode(maybeLink[1], channelId);
    return jsonOk({ ok: true, linked: true });
  }

  const userResult = await withClient((db) =>
    db.query(`select user_id from integrations where type = 'discord' and config->>'channel_id' = $1 limit 1`, [channelId])
  );
  const userId = userResult.rows[0]?.user_id as string | undefined;

  if (!userId || !content) {
    return jsonOk({ ok: true, ignored: true });
  }

  await insertConversationMessage({
    userId,
    direction: "inbound",
    channel: "discord",
    content,
    providerMessageId: payload.id,
    raw: payload as Record<string, unknown>
  });

  const extraction = await extractActionsFromReply({ userReply: content, ...getAiExtractionConfig() });
  return jsonOk({ ok: true, parsed: extraction.parsed, source: extraction.source });
}
