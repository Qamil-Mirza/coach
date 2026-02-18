import { deleteTodo, updateTodo } from "@coach/db";
import { todoUpdateSchema } from "@coach/shared";
import { requireSessionUser } from "@/lib/auth";
import { jsonError, jsonOk } from "@/lib/http";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await requireSessionUser();
  if (!user) {
    return jsonError("Unauthorized", 401);
  }

  const body = await request.json().catch(() => null);
  const parsed = todoUpdateSchema.safeParse(body);
  if (!parsed.success || !Object.keys(parsed.data).length) {
    return jsonError("Invalid update payload");
  }

  const { id } = await context.params;
  const todo = await updateTodo(user.id, id, parsed.data);
  if (!todo) {
    return jsonError("Todo not found", 404);
  }

  return jsonOk(todo);
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await requireSessionUser();
  if (!user) {
    return jsonError("Unauthorized", 401);
  }

  const { id } = await context.params;
  const deleted = await deleteTodo(user.id, id);
  if (!deleted) {
    return jsonError("Todo not found", 404);
  }

  return jsonOk({ ok: true });
}
