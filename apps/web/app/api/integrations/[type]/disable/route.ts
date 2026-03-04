import { disableIntegration } from "@coach/db";
import { requireSessionUser } from "@/lib/auth";
import { jsonError, jsonOk } from "@/lib/http";

export async function POST(_request: Request, context: { params: Promise<{ type: string }> }) {
  const user = await requireSessionUser();
  if (!user) {
    return jsonError("Unauthorized", 401);
  }

  const { type } = await context.params;
  const ok = await disableIntegration(user.id, type);
  if (!ok) {
    return jsonError("Integration not found", 404);
  }

  return jsonOk({ ok: true });
}
