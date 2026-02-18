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

export async function runSchedulerPass(now = new Date()): Promise<{ scheduled: number }> {
  const users = await getSchedulerUsers();
  let scheduled = 0;

  for (const user of users) {
    const context = await getUserSchedulingContext(user.id);
    const channels = await getLinkedChannels(user.id);
    if (!channels.length || !context.goals.length) {
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
      await scheduleCheckin({
        userId: user.id,
        goalId: context.goals[0].id,
        channel,
        scheduledFor: toIsoDateTime(winner.at),
        payload: { text: prompt }
      });
      scheduled += 1;
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
