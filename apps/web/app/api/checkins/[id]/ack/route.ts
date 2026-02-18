import { withClient } from "@coach/db";
import { requireSessionUser } from "@/lib/auth";
import { jsonError, jsonOk } from "@/lib/http";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await requireSessionUser();
  if (!user) {
    return jsonError("Unauthorized", 401);
  }
  const { id } = await context.params;

  await withClient((db) =>
    db.query(
      `update checkins set status = 'responded', responded_at = now(), updated_at = now() where id = $1 and user_id = $2`,
      [id, user.id]
    )
  );

  return jsonOk({ ok: true });
}
