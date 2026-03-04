import { buildCheckinPrompt, extractActionsFromReply } from "@coach/ai";
import { getUserSchedulingContext } from "@coach/db";
import { requireSessionUser } from "@/lib/auth";
import { getAiExtractionConfig } from "@/lib/ai";
import { jsonError, jsonOk } from "@/lib/http";

export async function POST(request: Request) {
  const user = await requireSessionUser();
  if (!user) {
    return jsonError("Unauthorized", 401);
  }

  const body = (await request.json().catch(() => ({}))) as { message?: string };
  const message = body.message?.trim();

  const context = await getUserSchedulingContext(user.id);
  if (!message) {
    return jsonOk({
      prompt: buildCheckinPrompt({ goals: context.goals, todos: context.openTodos, recentMessages: [] })
    });
  }

  const extraction = await extractActionsFromReply({
    userReply: message,
    ...getAiExtractionConfig()
  });

  return jsonOk({ extraction: extraction.parsed, source: extraction.source });
}
