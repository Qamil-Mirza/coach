import {
  createDeliveryAttempt,
  getDueCheckins,
  insertConversationMessage,
  markCheckinFailed,
  markCheckinSent
} from "@coach/db";
import { captureDeliveryLog, discordSendMessage, telegramSendMessage } from "@coach/integrations";
import { createRunId } from "@coach/observability";
import { jsonError, jsonOk } from "@/lib/http";

function internalAuthorized(request: Request): boolean {
  const key = request.headers.get("x-internal-key");
  return Boolean(key && key === process.env.INTERNAL_CRON_KEY);
}

export async function POST(request: Request) {
  if (!internalAuthorized(request)) {
    return jsonError("Unauthorized", 401);
  }

  const runId = createRunId("dispatch");
  const checkins = await getDueCheckins(new Date().toISOString());
  let sent = 0;
  let failed = 0;

  for (const checkin of checkins) {
    const text = checkin.payload?.text ?? "Quick check-in: what's your next 10-minute step?";

    if (checkin.channel === "telegram") {
      const result = await telegramSendMessage({
        botToken: process.env.TELEGRAM_BOT_TOKEN ?? "",
        chatId: checkin.config.chat_id ?? "",
        text
      });

      await createDeliveryAttempt({
        checkinId: checkin.id,
        provider: "telegram",
        request: { text },
        response: (result.raw as Record<string, unknown>) ?? {},
        status: result.ok ? "success" : "retryable_error"
      });

      captureDeliveryLog({
        provider: "telegram",
        checkinId: checkin.id,
        runId,
        ok: result.ok,
        response: result.raw
      });

      if (result.ok) {
        await markCheckinSent(checkin.id, result.id ?? null);
        await insertConversationMessage({
          userId: checkin.user_id,
          checkinId: checkin.id,
          direction: "outbound",
          channel: "telegram",
          content: text,
          providerMessageId: result.id,
          raw: (result.raw as Record<string, unknown>) ?? {}
        });
        sent += 1;
      } else {
        await markCheckinFailed(checkin.id);
        failed += 1;
      }
      continue;
    }

    if (checkin.channel === "discord") {
      const result = await discordSendMessage({
        botToken: process.env.DISCORD_BOT_TOKEN ?? "",
        channelId: checkin.config.channel_id ?? "",
        content: text
      });

      await createDeliveryAttempt({
        checkinId: checkin.id,
        provider: "discord",
        request: { text },
        response: (result.raw as Record<string, unknown>) ?? {},
        status: result.ok ? "success" : "retryable_error"
      });

      captureDeliveryLog({
        provider: "discord",
        checkinId: checkin.id,
        runId,
        ok: result.ok,
        response: result.raw
      });

      if (result.ok) {
        await markCheckinSent(checkin.id, result.id ?? null);
        await insertConversationMessage({
          userId: checkin.user_id,
          checkinId: checkin.id,
          direction: "outbound",
          channel: "discord",
          content: text,
          providerMessageId: result.id,
          raw: (result.raw as Record<string, unknown>) ?? {}
        });
        sent += 1;
      } else {
        await markCheckinFailed(checkin.id);
        failed += 1;
      }
      continue;
    }
  }

  return jsonOk({ runId, sent, failed, total: checkins.length });
}
