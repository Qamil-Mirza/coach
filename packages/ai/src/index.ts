import { AiExtraction, aiExtractionSchema } from "@coach/shared";

export type CoachContext = {
  goals: Array<{ id: string; title: string }>;
  todos: Array<{ id: string; title: string; due_at?: string | null }>;
  recentMessages: Array<{ role: "user" | "assistant"; content: string }>;
};

export type AiProvider = "openai" | "ollama" | "heuristic";

export type ExtractActionsConfig = {
  provider?: AiProvider;
  openAiApiKey?: string;
  openAiModel?: string;
  openAiBaseUrl?: string;
  ollamaBaseUrl?: string;
  ollamaModel?: string;
};

export type ExtractionResult = {
  parsed: AiExtraction;
  source: "model" | "heuristic_fallback";
};

export type TodoSummaryItem = {
  title: string;
  status: "open" | "done" | "archived";
  priority: number;
  due_at?: string | null;
};

export type TodoSummaryResult = {
  summary: string;
  source: "model" | "heuristic_fallback";
  provider: AiProvider;
};

export type DailyMotivationTodoItem = {
  title: string;
  priority: number;
  due_at?: string | null;
};

export type DailyMotivationEventItem = {
  summary?: string | null;
  start?: string | null;
  end?: string | null;
};

export type DailyMotivationResult = {
  message: string;
  source: "model" | "heuristic_fallback";
  provider: AiProvider;
};

export function buildCheckinPrompt(context: CoachContext): string {
  const topGoal = context.goals[0]?.title ?? "your top goal";
  const nextTodo = context.todos[0]?.title ?? "your next important task";
  return `Quick check-in on ${topGoal}. What's the smallest 10-minute step toward ${nextTodo}?`;
}

export async function extractActionsFromReply(args: {
  userReply: string;
} & ExtractActionsConfig): Promise<ExtractionResult> {
  const provider = resolveProvider(args);
  let parsed: AiExtraction | null = null;

  try {
    parsed =
      provider === "openai"
        ? await extractWithOpenAi(args)
        : provider === "ollama"
          ? await extractWithOllama(args)
          : null;
  } catch {
    parsed = null;
  }

  if (parsed) {
    return { parsed, source: "model" };
  }

  return { parsed: heuristicExtraction(args.userReply), source: "heuristic_fallback" };
}

const extractionJsonSchema = {
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
};

const extractionSystemPrompt =
  "Extract todo actions from user replies. Return strict JSON matching schema: intent, todo_updates, new_todos, snooze_minutes, confidence.";

function resolveProvider(args: ExtractActionsConfig): AiProvider {
  if (args.provider) {
    return args.provider;
  }
  if (args.openAiApiKey) {
    return "openai";
  }
  if (args.ollamaModel) {
    return "ollama";
  }
  return "heuristic";
}

async function extractWithOpenAi(args: {
  userReply: string;
} & ExtractActionsConfig): Promise<AiExtraction | null> {
  if (!args.openAiApiKey) {
    return null;
  }

  const openAiBaseUrl = (args.openAiBaseUrl ?? "https://api.openai.com/v1").replace(/\/+$/, "");
  const response = await fetch(`${openAiBaseUrl}/responses`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${args.openAiApiKey}`
    },
    body: JSON.stringify({
      model: args.openAiModel ?? "gpt-5-mini",
      input: [
        {
          role: "system",
          content: extractionSystemPrompt
        },
        { role: "user", content: args.userReply }
      ],
      text: {
        format: {
          type: "json_schema",
          name: "coach_reply",
          schema: extractionJsonSchema
        }
      }
    })
  });

  if (!response.ok) {
    return null;
  }

  const body = (await response.json()) as {
    output_text?: string;
    output?: Array<{ content?: Array<{ text?: string }> }>;
  };

  const raw =
    body.output_text ?? body.output?.[0]?.content?.find((entry) => typeof entry.text === "string")?.text ?? "{}";
  return parseAiExtraction(raw);
}

async function extractWithOllama(args: {
  userReply: string;
} & ExtractActionsConfig): Promise<AiExtraction | null> {
  if (!args.ollamaModel) {
    return null;
  }

  const ollamaBaseUrl = (args.ollamaBaseUrl ?? "http://127.0.0.1:11434").replace(/\/+$/, "");
  const response = await fetch(`${ollamaBaseUrl}/api/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: args.ollamaModel,
      stream: false,
      format: "json",
      options: { temperature: 0 },
      messages: [
        { role: "system", content: `${extractionSystemPrompt} Use the exact keys from this schema.` },
        { role: "user", content: args.userReply }
      ]
    })
  });

  if (!response.ok) {
    return null;
  }

  const body = (await response.json()) as {
    message?: { content?: string };
    response?: string;
  };
  const raw = body.message?.content ?? body.response ?? "{}";
  return parseAiExtraction(raw);
}

function parseAiExtraction(raw: string): AiExtraction | null {
  try {
    return aiExtractionSchema.parse(JSON.parse(raw));
  } catch {
    return null;
  }
}

export async function summarizeTodos(args: {
  todos: TodoSummaryItem[];
} & ExtractActionsConfig): Promise<TodoSummaryResult> {
  const provider = resolveProvider(args);
  let summary: string | null = null;

  try {
    summary =
      provider === "openai"
        ? await summarizeWithOpenAi(args)
        : provider === "ollama"
          ? await summarizeWithOllama(args)
          : null;
  } catch {
    summary = null;
  }

  const normalized = summary?.trim();
  if (normalized) {
    return {
      summary: normalized,
      source: "model",
      provider
    };
  }

  return {
    summary: heuristicTodoSummary(args.todos),
    source: "heuristic_fallback",
    provider
  };
}

export async function generateDailyMotivationMessage(args: {
  todos: DailyMotivationTodoItem[];
  events: DailyMotivationEventItem[];
  timezone?: string;
} & ExtractActionsConfig): Promise<DailyMotivationResult> {
  const provider = resolveProvider(args);
  let message: string | null = null;

  try {
    message =
      provider === "openai"
        ? await generateDailyMotivationWithOpenAi(args)
        : provider === "ollama"
          ? await generateDailyMotivationWithOllama(args)
          : null;
  } catch {
    message = null;
  }

  const normalized = message?.trim();
  if (normalized) {
    return {
      message: normalized,
      source: "model",
      provider
    };
  }

  return {
    message: heuristicDailyMotivation(args.todos, args.events),
    source: "heuristic_fallback",
    provider
  };
}

const summarySystemPrompt =
  "You are a productivity coach. Summarize a todo list in plain text. Keep it concise and practical. Include: overall progress and top next actions.";

function buildTodoSummaryPrompt(todos: TodoSummaryItem[]): string {
  if (!todos.length) {
    return "The user has no todo items. Return a short encouragement and suggest one concrete next step.";
  }

  const lines = todos.map((todo, index) => {
    const due = todo.due_at ? ` due=${todo.due_at}` : "";
    return `${index + 1}. title=${todo.title}; status=${todo.status}; priority=${todo.priority}${due}`;
  });
  return `Summarize this todo list:\n${lines.join("\n")}`;
}

async function summarizeWithOpenAi(args: {
  todos: TodoSummaryItem[];
} & ExtractActionsConfig): Promise<string | null> {
  if (!args.openAiApiKey) {
    return null;
  }

  const openAiBaseUrl = (args.openAiBaseUrl ?? "https://api.openai.com/v1").replace(/\/+$/, "");
  const response = await fetch(`${openAiBaseUrl}/responses`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${args.openAiApiKey}`
    },
    body: JSON.stringify({
      model: args.openAiModel ?? "gpt-5-mini",
      input: [
        { role: "system", content: summarySystemPrompt },
        { role: "user", content: buildTodoSummaryPrompt(args.todos) }
      ],
      max_output_tokens: 220
    })
  });

  if (!response.ok) {
    return null;
  }

  const body = (await response.json()) as {
    output_text?: string;
    output?: Array<{ content?: Array<{ text?: string }> }>;
  };
  return body.output_text ?? body.output?.[0]?.content?.find((entry) => typeof entry.text === "string")?.text ?? null;
}

async function summarizeWithOllama(args: {
  todos: TodoSummaryItem[];
} & ExtractActionsConfig): Promise<string | null> {
  if (!args.ollamaModel) {
    return null;
  }

  const ollamaBaseUrl = (args.ollamaBaseUrl ?? "http://127.0.0.1:11434").replace(/\/+$/, "");
  const response = await fetch(`${ollamaBaseUrl}/api/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: args.ollamaModel,
      stream: false,
      options: { temperature: 0.2 },
      messages: [
        { role: "system", content: summarySystemPrompt },
        { role: "user", content: buildTodoSummaryPrompt(args.todos) }
      ]
    })
  });

  if (!response.ok) {
    return null;
  }

  const body = (await response.json()) as {
    message?: { content?: string };
    response?: string;
  };
  return body.message?.content ?? body.response ?? null;
}

const dailyMotivationSystemPromptOpenAi =
  "You are a supportive productivity coach writing a Telegram reminder. Be concise, positive, and practical. Mention today's schedule context and top todos, then end with one concrete next action. Plain text only.";

const dailyMotivationSystemPromptOllama =
  "You are an intense accountability coach writing a Telegram reminder in a hard, disciplined tone. Push for ownership and immediate action. No coddling, no vague inspiration. Include: one hard truth tied to today's schedule/todos, top priorities, and one immediate 10-minute action to start now. Keep it concise (under 120 words), plain text only. Do not use insults, profanity, threats, or demeaning language. End with: Reply DONE when it's finished.";

function buildDailyMotivationPrompt(args: {
  todos: DailyMotivationTodoItem[];
  events: DailyMotivationEventItem[];
  timezone?: string;
}): string {
  const todoLines = args.todos.length
    ? args.todos.map((todo, index) => {
        const due = todo.due_at ? ` due=${todo.due_at}` : "";
        return `${index + 1}. title=${todo.title}; priority=${todo.priority}${due}`;
      })
    : ["No open todos."];

  const eventLines = args.events.length
    ? args.events.map((event, index) => {
        const title = event.summary?.trim() || "Untitled event";
        const start = event.start ? ` start=${event.start}` : "";
        const end = event.end ? ` end=${event.end}` : "";
        return `${index + 1}. ${title}${start}${end}`;
      })
    : ["No calendar events found for today."];

  const timezone = args.timezone ?? "UTC";
  return `Timezone: ${timezone}

Today's todos:
${todoLines.join("\n")}

Today's events:
${eventLines.join("\n")}

Write one short motivational reminder for Telegram in under 120 words.`;
}

async function generateDailyMotivationWithOpenAi(args: {
  todos: DailyMotivationTodoItem[];
  events: DailyMotivationEventItem[];
  timezone?: string;
} & ExtractActionsConfig): Promise<string | null> {
  if (!args.openAiApiKey) {
    return null;
  }

  const openAiBaseUrl = (args.openAiBaseUrl ?? "https://api.openai.com/v1").replace(/\/+$/, "");
  const response = await fetch(`${openAiBaseUrl}/responses`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${args.openAiApiKey}`
    },
    body: JSON.stringify({
      model: args.openAiModel ?? "gpt-5-mini",
      input: [
        { role: "system", content: dailyMotivationSystemPromptOpenAi },
        { role: "user", content: buildDailyMotivationPrompt(args) }
      ],
      max_output_tokens: 220
    })
  });

  if (!response.ok) {
    return null;
  }

  const body = (await response.json()) as {
    output_text?: string;
    output?: Array<{ content?: Array<{ text?: string }> }>;
  };
  return body.output_text ?? body.output?.[0]?.content?.find((entry) => typeof entry.text === "string")?.text ?? null;
}

async function generateDailyMotivationWithOllama(args: {
  todos: DailyMotivationTodoItem[];
  events: DailyMotivationEventItem[];
  timezone?: string;
} & ExtractActionsConfig): Promise<string | null> {
  if (!args.ollamaModel) {
    return null;
  }

  const ollamaBaseUrl = (args.ollamaBaseUrl ?? "http://127.0.0.1:11434").replace(/\/+$/, "");
  const response = await fetch(`${ollamaBaseUrl}/api/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: args.ollamaModel,
      stream: false,
      options: { temperature: 0.35 },
      messages: [
        { role: "system", content: dailyMotivationSystemPromptOllama },
        { role: "user", content: buildDailyMotivationPrompt(args) }
      ]
    })
  });

  if (!response.ok) {
    return null;
  }

  const body = (await response.json()) as {
    message?: { content?: string };
    response?: string;
  };
  return body.message?.content ?? body.response ?? null;
}

function heuristicDailyMotivation(todos: DailyMotivationTodoItem[], events: DailyMotivationEventItem[]): string {
  const sortedTodos = todos
    .slice()
    .sort((a, b) => {
      if (a.priority !== b.priority) {
        return a.priority - b.priority;
      }
      const dueA = a.due_at ? new Date(a.due_at).getTime() : Number.MAX_SAFE_INTEGER;
      const dueB = b.due_at ? new Date(b.due_at).getTime() : Number.MAX_SAFE_INTEGER;
      const safeA = Number.isNaN(dueA) ? Number.MAX_SAFE_INTEGER : dueA;
      const safeB = Number.isNaN(dueB) ? Number.MAX_SAFE_INTEGER : dueB;
      return safeA - safeB;
    })
    .slice(0, 3);

  const topTodoText = sortedTodos.length ? sortedTodos.map((todo) => todo.title).join(", ") : "pick one meaningful task";
  const eventCount = events.length;
  const eventText = eventCount
    ? `You have ${eventCount} event${eventCount === 1 ? "" : "s"} on your calendar today.`
    : "Your calendar looks open today.";

  return `No excuses today. ${eventText} Priority targets: ${topTodoText}. Pick the hardest important task and execute a focused 10-minute sprint now. Reply DONE when finished.`;
}

function heuristicTodoSummary(todos: TodoSummaryItem[]): string {
  if (!todos.length) {
    return "You have no todo items yet. Add one small task you can finish in 10 minutes.";
  }

  const open = todos.filter((todo) => todo.status === "open");
  const done = todos.filter((todo) => todo.status === "done");
  const archived = todos.filter((todo) => todo.status === "archived");

  const rank = (todo: TodoSummaryItem): number => {
    const due = todo.due_at ? new Date(todo.due_at).getTime() : Number.MAX_SAFE_INTEGER;
    const safeDue = Number.isNaN(due) ? Number.MAX_SAFE_INTEGER : due;
    return todo.priority * 1_000_000_000_000 + safeDue;
  };

  const top = open.slice().sort((a, b) => rank(a) - rank(b)).slice(0, 3);
  const next = top.length ? top.map((todo) => todo.title).join(", ") : "No open tasks";

  return `You have ${open.length} open, ${done.length} done, and ${archived.length} archived tasks. Next focus: ${next}.`;
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
