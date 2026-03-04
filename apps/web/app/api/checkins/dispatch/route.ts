import {
  createDeliveryAttempt,
  getCalendarTokens,
  getDueCheckins,
  insertConversationMessage,
  listTodos,
  markCheckinFailed,
  markCheckinSent
} from "@coach/db";
import { generateDailyMotivationMessage } from "@coach/ai";
import { captureDeliveryLog, discordSendMessage, telegramSendMessage } from "@coach/integrations";
import { createRunId } from "@coach/observability";
import { getAiExtractionConfig } from "@/lib/ai";
import { jsonError, jsonOk } from "@/lib/http";

function internalAuthorized(request: Request): boolean {
  const key = request.headers.get("x-internal-key");
  return Boolean(key && key === process.env.INTERNAL_CRON_KEY);
}

type TelegramTodoRow = {
  title: string;
  status: "open" | "done" | "archived";
  priority: number;
  due_at: string | null;
};

type GoogleEventRow = {
  summary?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
};

function normalizeTimeZone(timeZone: string | undefined): string {
  const candidate = timeZone?.trim() ? timeZone : "UTC";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: candidate });
    return candidate;
  } catch {
    return "UTC";
  }
}

function getDatePartsInTimeZone(date: Date, timeZone: string): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day)
  };
}

function getTimeZoneOffsetMs(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).formatToParts(date);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const asUtcTime = Date.UTC(
    Number(map.year),
    Number(map.month) - 1,
    Number(map.day),
    Number(map.hour),
    Number(map.minute),
    Number(map.second)
  );
  return asUtcTime - date.getTime();
}

function zonedDateTimeToUtcIso(args: {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  timeZone: string;
}): string {
  const naiveUtcTime = Date.UTC(args.year, args.month - 1, args.day, args.hour, args.minute, args.second);
  let utcTime = naiveUtcTime;
  for (let i = 0; i < 2; i += 1) {
    utcTime = naiveUtcTime - getTimeZoneOffsetMs(new Date(utcTime), args.timeZone);
  }
  return new Date(utcTime).toISOString();
}

function getTodayRange(timeZone: string): { timeMin: string; timeMax: string } {
  const now = new Date();
  const today = getDatePartsInTimeZone(now, timeZone);
  const nextDate = new Date(Date.UTC(today.year, today.month - 1, today.day + 1));
  const nextDay = {
    year: nextDate.getUTCFullYear(),
    month: nextDate.getUTCMonth() + 1,
    day: nextDate.getUTCDate()
  };

  return {
    timeMin: zonedDateTimeToUtcIso({
      year: today.year,
      month: today.month,
      day: today.day,
      hour: 0,
      minute: 0,
      second: 0,
      timeZone
    }),
    timeMax: zonedDateTimeToUtcIso({
      year: nextDay.year,
      month: nextDay.month,
      day: nextDay.day,
      hour: 0,
      minute: 0,
      second: 0,
      timeZone
    })
  };
}

async function fetchGoogleEventsForToday(args: { accessToken: string; timeZone: string }): Promise<Array<{ summary?: string; start?: string; end?: string }>> {
  const range = getTodayRange(args.timeZone);
  const query = new URLSearchParams({
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "50",
    timeMin: range.timeMin,
    timeMax: range.timeMax
  });

  const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?${query.toString()}`, {
    headers: {
      Authorization: `Bearer ${args.accessToken}`
    }
  });

  if (!response.ok) {
    return [];
  }

  const body = (await response.json()) as { items?: GoogleEventRow[] };
  return (body.items ?? []).map((event) => ({
    summary: event.summary,
    start: event.start?.dateTime ?? event.start?.date,
    end: event.end?.dateTime ?? event.end?.date
  }));
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
    let text = checkin.payload?.text ?? "Quick check-in: what's your next 10-minute step?";

    if (checkin.channel === "telegram") {
      if (checkin.payload?.type === "fixed_daily_telegram") {
        const todos = (await listTodos(checkin.user_id)) as TelegramTodoRow[];
        const openTodos = todos
          .filter((todo) => todo.status === "open")
          .map((todo) => ({
            title: todo.title,
            priority: todo.priority,
            due_at: todo.due_at
          }));

        const calendarTokens = await getCalendarTokens(checkin.user_id);
        const googleToken = calendarTokens.find((token) => token.provider === "google");
        const events = googleToken
          ? await fetchGoogleEventsForToday({
              accessToken: googleToken.access_token_enc,
              timeZone: normalizeTimeZone(checkin.timezone)
            })
          : [];

        const motivation = await generateDailyMotivationMessage({
          todos: openTodos,
          events,
          timezone: normalizeTimeZone(checkin.timezone),
          ...getAiExtractionConfig()
        });
        text = motivation.message;
      }

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
