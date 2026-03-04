import { createTodo, listTodos } from "@coach/db";
import { todoCreateSchema } from "@coach/shared";
import { requireSessionUser } from "@/lib/auth";
import { jsonError, jsonOk } from "@/lib/http";

export async function GET() {
  const user = await requireSessionUser();
  if (!user) {
    return jsonError("Unauthorized", 401);
  }
  const todos = await listTodos(user.id);
  return jsonOk({ todos });
}

export async function POST(request: Request) {
  const user = await requireSessionUser();
  if (!user) {
    return jsonError("Unauthorized", 401);
  }

  const body = await request.json().catch(() => null);
  const parsed = todoCreateSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError("Invalid todo payload");
  }

  const todo = await createTodo(user.id, parsed.data);
  return jsonOk(todo, 201);
}
