import { z } from "zod";
import { withClient } from "@coach/db";
import { requireSessionUser } from "@/lib/auth";
import { jsonError, jsonOk } from "@/lib/http";

const schema = z.object({ minutes: z.number().int().positive().max(1440).default(120) });

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await requireSessionUser();
  if (!user) {
    return jsonError("Unauthorized", 401);
  }

  const body = await request.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return jsonError("Invalid snooze payload");
  }

  const { id } = await context.params;
  await withClient((db) =>
    db.query(
      `update checkins set status = 'scheduled', scheduled_for = now() + ($1 || ' minutes')::interval, updated_at = now()
       where id = $2 and user_id = $3`,
      [parsed.data.minutes, id, user.id]
    )
  );

  return jsonOk({ ok: true });
}
