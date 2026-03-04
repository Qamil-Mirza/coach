import { createGoal, listGoals } from "@coach/db";
import { goalCreateSchema } from "@coach/shared";
import { requireSessionUser } from "@/lib/auth";
import { jsonError, jsonOk } from "@/lib/http";

export async function GET() {
  const user = await requireSessionUser();
  if (!user) {
    return jsonError("Unauthorized", 401);
  }

  const goals = await listGoals(user.id);
  return jsonOk({ goals });
}

export async function POST(request: Request) {
  const user = await requireSessionUser();
  if (!user) {
    return jsonError("Unauthorized", 401);
  }

  const body = await request.json().catch(() => null);
  const parsed = goalCreateSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError("Invalid goal payload");
  }

  const goal = await createGoal(user.id, parsed.data);
  return jsonOk(goal, 201);
}
