import { updateGoal } from "@coach/db";
import { goalUpdateSchema } from "@coach/shared";
import { requireSessionUser } from "@/lib/auth";
import { jsonError, jsonOk } from "@/lib/http";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await requireSessionUser();
  if (!user) {
    return jsonError("Unauthorized", 401);
  }

  const body = await request.json().catch(() => null);
  const parsed = goalUpdateSchema.safeParse(body);
  if (!parsed.success || !Object.keys(parsed.data).length) {
    return jsonError("Invalid goal update");
  }

  const { id } = await context.params;
  const goal = await updateGoal(user.id, id, parsed.data);
  if (!goal) {
    return jsonError("Goal not found", 404);
  }

  return jsonOk(goal);
}
