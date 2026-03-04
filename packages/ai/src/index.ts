import { AiExtraction, aiExtractionSchema } from "@coach/shared";

export type CoachContext = {
  goals: Array<{ id: string; title: string }>;
  todos: Array<{ id: string; title: string; due_at?: string | null }>;
  recentMessages: Array<{ role: "user" | "assistant"; content: string }>;
};

export type ExtractionResult = {
  parsed: AiExtraction;
  source: "model" | "heuristic_fallback";
};

export function buildCheckinPrompt(context: CoachContext): string {
  const topGoal = context.goals[0]?.title ?? "your top goal";
  const nextTodo = context.todos[0]?.title ?? "your next important task";
  return `Quick check-in on ${topGoal}. What's the smallest 10-minute step toward ${nextTodo}?`;
}

export async function extractActionsFromReply(args: {
  userReply: string;
  openAiApiKey?: string;
}): Promise<ExtractionResult> {
  if (!args.openAiApiKey) {
    return { parsed: heuristicExtraction(args.userReply), source: "heuristic_fallback" };
  }

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${args.openAiApiKey}`
    },
    body: JSON.stringify({
      model: "gpt-5-mini",
      input: [
        {
          role: "system",
          content:
            "Extract todo actions from user replies. Return strict JSON matching schema: intent, todo_updates, new_todos, snooze_minutes, confidence."
        },
        { role: "user", content: args.userReply }
      ],
      text: {
        format: {
          type: "json_schema",
          name: "coach_reply",
          schema: {
            type: "object",
            properties: {
              intent: { type: "string", enum: ["complete_todo", "create_next_action", "snooze", "log_obstacle", "unknown"] },
              todo_updates: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    id: { type: "string" },
                    title: { type: "string" },
                    status: { type: "string", enum: ["open", "done", "archived"] }
                  },
                  additionalProperties: false
                }
              },
              new_todos: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    title: { type: "string" },
                    notes: { type: "string" }
                  },
                  required: ["title"],
                  additionalProperties: false
                }
              },
              snooze_minutes: { type: "number" },
              confidence: { type: "number" }
            },
            required: ["intent", "todo_updates", "new_todos", "confidence"],
            additionalProperties: false
          }
        }
      }
    })
  });

  if (!response.ok) {
    return { parsed: heuristicExtraction(args.userReply), source: "heuristic_fallback" };
  }

  const body = (await response.json()) as {
    output_text?: string;
    output?: Array<{ content?: Array<{ text?: string }> }>;
  };

  const raw =
    body.output_text ?? body.output?.[0]?.content?.find((entry) => typeof entry.text === "string")?.text ?? "{}";

  try {
    const parsed = aiExtractionSchema.parse(JSON.parse(raw));
    return { parsed, source: "model" };
  } catch {
    return { parsed: heuristicExtraction(args.userReply), source: "heuristic_fallback" };
  }
}

function heuristicExtraction(userReply: string): AiExtraction {
  const normalized = userReply.toLowerCase();
  if (normalized.includes("done") || normalized.includes("finished")) {
    return {
      intent: "complete_todo",
      todo_updates: [{ status: "done" }],
      new_todos: [],
      confidence: 0.45
    };
  }
  if (normalized.includes("later") || normalized.includes("tomorrow") || normalized.includes("snooze")) {
    return {
      intent: "snooze",
      todo_updates: [],
      new_todos: [],
      snooze_minutes: 120,
      confidence: 0.4
    };
  }
  return {
    intent: "unknown",
    todo_updates: [],
    new_todos: [],
    confidence: 0.2
  };
}
