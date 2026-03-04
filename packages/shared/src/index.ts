import { z } from "zod";

export const channelSchema = z.enum(["telegram", "discord", "in_app"]);
export type Channel = z.infer<typeof channelSchema>;

export const checkinStatusSchema = z.enum([
  "scheduled",
  "sent",
  "delivered",
  "responded",
  "skipped",
  "failed",
  "cancelled"
]);
export type CheckinStatus = z.infer<typeof checkinStatusSchema>;

export const todoCreateSchema = z.object({
  title: z.string().min(1).max(200),
  notes: z.string().max(5000).optional().nullable(),
  goal_id: z.string().uuid().optional().nullable(),
  due_at: z.string().datetime().optional().nullable(),
  priority: z.number().int().min(1).max(3).default(2),
  tags: z.array(z.string().max(30)).default([])
});

export const todoUpdateSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  notes: z.string().max(5000).nullable().optional(),
  status: z.enum(["open", "done", "archived"]).optional(),
  priority: z.number().int().min(1).max(3).optional(),
  due_at: z.string().datetime().nullable().optional(),
  snoozed_until: z.string().datetime().nullable().optional(),
  tags: z.array(z.string().max(30)).optional(),
  goal_id: z.string().uuid().nullable().optional()
});

export const goalCreateSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(5000).nullable().optional(),
  target_type: z.enum(["binary", "count", "duration", "custom"]).default("binary"),
  target_value: z.number().optional().nullable(),
  target_unit: z.string().max(60).optional().nullable(),
  starts_at: z.string().datetime().optional().nullable(),
  ends_at: z.string().datetime().optional().nullable()
});

export const goalUpdateSchema = goalCreateSchema.partial().extend({
  status: z.enum(["active", "paused", "complete", "archived"]).optional()
});

export const schedulePreferencesSchema = z.object({
  dnd_start_local: z.string().regex(/^\d{2}:\d{2}$/),
  dnd_end_local: z.string().regex(/^\d{2}:\d{2}$/),
  workday_start_local: z.string().regex(/^\d{2}:\d{2}$/),
  workday_end_local: z.string().regex(/^\d{2}:\d{2}$/),
  checkin_frequency: z.enum(["daily", "2x_daily", "weekly", "custom"]),
  preferred_windows: z.array(
    z.object({ start: z.string().regex(/^\d{2}:\d{2}$/), end: z.string().regex(/^\d{2}:\d{2}$/) })
  ),
  calendar_strategy: z.enum(["freebusy_first", "heuristics_only"])
});

export const aiExtractionSchema = z.object({
  intent: z.enum(["complete_todo", "create_next_action", "snooze", "log_obstacle", "unknown"]),
  todo_updates: z.array(
    z.object({
      id: z.string().uuid().optional(),
      title: z.string().optional(),
      status: z.enum(["open", "done", "archived"]).optional()
    })
  ),
  new_todos: z.array(z.object({ title: z.string().min(1).max(200), notes: z.string().optional() })),
  snooze_minutes: z.number().int().positive().optional(),
  confidence: z.number().min(0).max(1)
});

export type AiExtraction = z.infer<typeof aiExtractionSchema>;

export type TimeWindow = { start: Date; end: Date };

type SlotScoreInput = {
  candidate: Date;
  dueSoonCount: number;
  responsiveness: number;
  minutesFromLastCheckin: number;
};

export function scoreCandidateSlot(input: SlotScoreInput): number {
  const dueWeight = Math.min(input.dueSoonCount * 15, 45);
  const responseWeight = Math.max(0, Math.min(input.responsiveness, 1)) * 35;
  const spacingWeight = Math.min(input.minutesFromLastCheckin / 20, 20);
  return dueWeight + responseWeight + spacingWeight;
}

export function subtractBusyIntervals(free: TimeWindow, busy: TimeWindow[]): TimeWindow[] {
  let available: TimeWindow[] = [free];

  for (const block of busy) {
    const next: TimeWindow[] = [];
    for (const win of available) {
      if (block.end <= win.start || block.start >= win.end) {
        next.push(win);
        continue;
      }
      if (block.start > win.start) {
        next.push({ start: win.start, end: block.start });
      }
      if (block.end < win.end) {
        next.push({ start: block.end, end: win.end });
      }
    }
    available = next;
  }

  return available.filter((w) => w.end > w.start);
}

export function toIsoDateTime(date: Date): string {
  return date.toISOString();
}
