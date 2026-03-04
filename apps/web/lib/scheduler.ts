import {
  buildCheckinPrompt
} from "@coach/ai";
import {
  getCalendarTokens,
  getLinkedChannels,
  getSchedulerUsers,
  getUserSchedulingContext,
  scheduleCheckin
} from "@coach/db";
import { fetchGoogleFreeBusy, fetchMicrosoftFreeBusy } from "@coach/integrations";
import { scoreCandidateSlot, subtractBusyIntervals, toIsoDateTime, type TimeWindow } from "@coach/shared";

function parseLocalTimeToDate(base: Date, hhmmss: string): Date {
  const [hh, mm] = hhmmss.split(":").map((v) => Number(v));
  const date = new Date(base);
  date.setHours(hh, mm, 0, 0);
  return date;
}

function withinDnd(candidate: Date, dndStart: Date, dndEnd: Date): boolean {
  if (dndStart <= dndEnd) {
    return candidate >= dndStart && candidate < dndEnd;
  }
  return candidate >= dndStart || candidate < dndEnd;
}

function normalizeTimeZone(timeZone: string): string {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return timeZone;
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

function zonedDateTimeToUtcDate(args: {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  timeZone: string;
}): Date {
  const naiveUtcTime = Date.UTC(args.year, args.month - 1, args.day, args.hour, args.minute, args.second);
  let utcTime = naiveUtcTime;
  for (let i = 0; i < 2; i += 1) {
    utcTime = naiveUtcTime - getTimeZoneOffsetMs(new Date(utcTime), args.timeZone);
  }
  return new Date(utcTime);
}

function parseTimeWithSeconds(value: string): { hour: number; minute: number; second: number; hhmm: string } {
  const [hhRaw, mmRaw, ssRaw] = value.split(":");
  const hour = Number(hhRaw ?? "0");
  const minute = Number(mmRaw ?? "0");
  const second = Number(ssRaw ?? "0");
  const safeHour = Number.isFinite(hour) ? Math.min(23, Math.max(0, hour)) : 0;
  const safeMinute = Number.isFinite(minute) ? Math.min(59, Math.max(0, minute)) : 0;
  const safeSecond = Number.isFinite(second) ? Math.min(59, Math.max(0, second)) : 0;
  return {
    hour: safeHour,
    minute: safeMinute,
    second: safeSecond,
    hhmm: `${String(safeHour).padStart(2, "0")}:${String(safeMinute).padStart(2, "0")}`
  };
}

export async function runSchedulerPass(now = new Date()): Promise<{ scheduled: number }> {
  const users = await getSchedulerUsers();
  let scheduled = 0;

  for (const user of users) {
    const context = await getUserSchedulingContext(user.id);
    const channels = await getLinkedChannels(user.id);
    if (!channels.length) {
      continue;
    }

    if (channels.includes("telegram") && context.preferences.fixed_telegram_enabled) {
      const timeZone = normalizeTimeZone(user.timezone);
      const localDate = getDatePartsInTimeZone(now, timeZone);
      const localTime = parseTimeWithSeconds(context.preferences.fixed_telegram_time_local);
      const scheduledFor = zonedDateTimeToUtcDate({
        year: localDate.year,
        month: localDate.month,
        day: localDate.day,
        hour: localTime.hour,
        minute: localTime.minute,
        second: localTime.second,
        timeZone
      });

      if (now >= scheduledFor) {
        const inserted = await scheduleCheckin({
          userId: user.id,
          channel: "telegram",
          scheduledFor: scheduledFor.toISOString(),
          payload: {
            type: "fixed_daily_telegram",
            message_mode: context.preferences.fixed_telegram_message_mode,
            local_date: `${String(localDate.year).padStart(4, "0")}-${String(localDate.month).padStart(2, "0")}-${String(localDate.day).padStart(2, "0")}`,
            time_local: localTime.hhmm
          }
        });
        if (inserted) {
          scheduled += 1;
        }
      }
    }

    if (!context.goals.length) {
      continue;
    }

    const workStart = parseLocalTimeToDate(now, context.preferences.workday_start_local);
    const workEnd = parseLocalTimeToDate(now, context.preferences.workday_end_local);

    const freeWindow: TimeWindow = { start: workStart, end: workEnd };
    const tokens = await getCalendarTokens(user.id);
    const busyIntervals = await resolveBusyIntervals({
      tokens,
      timeMin: workStart.toISOString(),
      timeMax: workEnd.toISOString(),
      timezone: user.timezone
    });
    const available = subtractBusyIntervals(freeWindow, busyIntervals);
    const lastCheckinMinutes = 300;

    const scored = available
      .map((window) => {
        const midpoint = new Date((window.start.getTime() + window.end.getTime()) / 2);
        return {
          at: midpoint,
          score: scoreCandidateSlot({
            candidate: midpoint,
            dueSoonCount: context.openTodos.filter((todo) => todo.due_at).length,
            responsiveness: 0.5,
            minutesFromLastCheckin: lastCheckinMinutes
          })
        };
      })
      .filter(({ at }) => {
        const dndStart = parseLocalTimeToDate(now, context.preferences.dnd_start_local);
        const dndEnd = parseLocalTimeToDate(now, context.preferences.dnd_end_local);
        return !withinDnd(at, dndStart, dndEnd);
      })
      .sort((a, b) => b.score - a.score);

    const winner = scored[0];
    if (!winner) {
      continue;
    }

    const prompt = buildCheckinPrompt({ goals: context.goals, todos: context.openTodos, recentMessages: [] });

    for (const channel of channels) {
      const inserted = await scheduleCheckin({
        userId: user.id,
        goalId: context.goals[0].id,
        channel,
        scheduledFor: toIsoDateTime(winner.at),
        payload: { text: prompt }
      });
      if (inserted) {
        scheduled += 1;
      }
    }
  }

  return { scheduled };
}

async function resolveBusyIntervals(args: {
  tokens: Array<{ provider: "google" | "microsoft"; access_token_enc: string }>;
  timeMin: string;
  timeMax: string;
  timezone: string;
}): Promise<TimeWindow[]> {
  const busy: TimeWindow[] = [];

  for (const token of args.tokens) {
    const intervals =
      token.provider === "google"
        ? await fetchGoogleFreeBusy({
            accessToken: token.access_token_enc,
            timeMin: args.timeMin,
            timeMax: args.timeMax,
            timezone: args.timezone
          })
        : await fetchMicrosoftFreeBusy({
            accessToken: token.access_token_enc,
            timeMin: args.timeMin,
            timeMax: args.timeMax,
            timezone: args.timezone
          });

    for (const slot of intervals) {
      const start = new Date(slot.start);
      const end = new Date(slot.end);
      if (!Number.isNaN(start.valueOf()) && !Number.isNaN(end.valueOf()) && end > start) {
        busy.push({ start, end });
      }
    }
  }

  busy.sort((a, b) => a.start.getTime() - b.start.getTime());
  return busy;
}
