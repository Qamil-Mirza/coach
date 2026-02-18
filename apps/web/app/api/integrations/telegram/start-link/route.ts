import { createIntegrationLink } from "@coach/db";
import { requireSessionUser } from "@/lib/auth";
import { jsonError, jsonOk } from "@/lib/http";

export async function POST() {
  const user = await requireSessionUser();
  if (!user) {
    return jsonError("Unauthorized", 401);
  }

  const result = await createIntegrationLink(user.id, "telegram");
  return jsonOk({ code: result.code, instructions: "Send /link <code> to your Telegram bot" });
}
