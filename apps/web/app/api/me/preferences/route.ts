import { schedulePreferencesSchema } from "@coach/shared";
import { updateSchedulePreferences, withClient } from "@coach/db";
import { requireSessionUser } from "@/lib/auth";
import { jsonError, jsonOk } from "@/lib/http";

export async function GET() {
  const user = await requireSessionUser();
  if (!user) {
    return jsonError("Unauthorized", 401);
  }

  const result = await withClient((db) =>
    db.query(
      `select dnd_start_local::text, dnd_end_local::text, workday_start_local::text, workday_end_local::text,
              checkin_frequency, preferred_windows, calendar_strategy,
              fixed_telegram_enabled, fixed_telegram_time_local::text, fixed_telegram_message_mode, fixed_telegram_days
       from schedule_preferences where user_id = $1`,
      [user.id]
    )
  );

  return jsonOk({ preferences: result.rows[0] ?? null });
}

export async function PUT(request: Request) {
  const user = await requireSessionUser();
  if (!user) {
    return jsonError("Unauthorized", 401);
  }

  const body = await request.json().catch(() => null);
  const parsed = schedulePreferencesSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError("Invalid preferences payload");
  }

  await updateSchedulePreferences(user.id, parsed.data);
  return jsonOk({ ok: true });
}
