import { createIntegrationLink } from "@coach/db";
import { requireSessionUser } from "@/lib/auth";
import { jsonError, jsonOk } from "@/lib/http";

export async function POST() {
  const user = await requireSessionUser();
  if (!user) {
    return jsonError("Unauthorized", 401);
  }

  const result = await createIntegrationLink(user.id, "discord");
  return jsonOk({ code: result.code, instructions: "Configure bot and post code in configured channel topic or setup flow" });
}
