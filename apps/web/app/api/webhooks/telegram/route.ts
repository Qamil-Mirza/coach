import { extractActionsFromReply, summarizeTodos } from "@coach/ai";
import { insertConversationMessage, linkTelegramByCode, listTodos, withClient } from "@coach/db";
import {
  isTelegramAiTestCommand,
  isTelegramTasksCommand,
  parseTelegramLinkCommand,
  telegramSendMessage
} from "@coach/integrations";
import { getAiExtractionConfig } from "@/lib/ai";
import { jsonOk } from "@/lib/http";

type TelegramTodoRow = {
  title: string;
  status: "open" | "done" | "archived";
  priority: number;
  due_at: string | null;
};

function renderTodoListMessage(todos: TelegramTodoRow[]): string {
  if (!todos.length) {
    return "You have no todo items yet.";
  }

  const header = "Your todo list:";
  const lines = todos.map((todo, index) => {
    const mark = todo.status === "done" ? "[x]" : todo.status === "archived" ? "[-]" : "[ ]";
    const priority = `P${todo.priority}`;
    const due = todo.due_at ? ` | due ${new Date(todo.due_at).toISOString().slice(0, 10)}` : "";
    return `${index + 1}. ${mark} ${todo.title} (${priority})${due}`;
  });

  const maxChars = 3800;
  let message = header;
  let shown = 0;
  for (const line of lines) {
    const candidate = `${message}\n${line}`;
    if (candidate.length > maxChars) {
      break;
    }
    message = candidate;
    shown += 1;
  }

  const remaining = todos.length - shown;
  if (remaining > 0) {
    message += `\n...and ${remaining} more`;
  }

  return message;
}

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => ({}))) as {
    message?: {
      text?: string;
      chat?: { id?: number | string };
      message_id?: number;
      from?: { id?: number | string };
    };
  };

  const text = payload.message?.text ?? "";
  const chatId = payload.message?.chat?.id?.toString() ?? "";
  const providerMessageId = payload.message?.message_id?.toString();

  const link = parseTelegramLinkCommand(text);
  if (link && chatId) {
    await linkTelegramByCode(link.code, chatId);
    return jsonOk({ ok: true, linked: true });
  }

  const userResult = await withClient((db) =>
    db.query(`select user_id from integrations where type = 'telegram' and config->>'chat_id' = $1 limit 1`, [chatId])
  );
  const userId = userResult.rows[0]?.user_id as string | undefined;

  if (!userId) {
    return jsonOk({ ok: true, ignored: true });
  }

  await insertConversationMessage({
    userId,
    direction: "inbound",
    channel: "telegram",
    content: text,
    providerMessageId,
    raw: payload as Record<string, unknown>
  });

  if (isTelegramTasksCommand(text)) {
    const todos = (await listTodos(userId)) as TelegramTodoRow[];
    const listMessage = renderTodoListMessage(todos);
    await telegramSendMessage({
      botToken: process.env.TELEGRAM_BOT_TOKEN ?? "",
      chatId,
      text: listMessage
    });
    return jsonOk({ ok: true, listed: true, total: todos.length });
  }

  if (isTelegramAiTestCommand(text)) {
    const todos = (await listTodos(userId)) as TelegramTodoRow[];
    const summary = await summarizeTodos({
      todos: todos.map((todo) => ({
        title: todo.title,
        status: todo.status,
        priority: todo.priority,
        due_at: todo.due_at
      })),
      ...getAiExtractionConfig()
    });

    const testMessage = `AI summary test
provider=${summary.provider}
source=${summary.source}

${summary.summary}`;

    await telegramSendMessage({
      botToken: process.env.TELEGRAM_BOT_TOKEN ?? "",
      chatId,
      text: testMessage
    });

    return jsonOk({
      ok: true,
      ai_test: true,
      provider: summary.provider,
      source: summary.source
    });
  }

  const extraction = await extractActionsFromReply({ userReply: text, ...getAiExtractionConfig() });

  if (extraction.parsed.intent === "snooze") {
    const minutes = extraction.parsed.snooze_minutes ?? 120;
    await withClient((db) =>
      db.query(
        `with latest as (
           select id
           from checkins
           where user_id = $2 and status in ('sent', 'delivered')
           order by scheduled_for desc
           limit 1
         )
         update checkins
         set scheduled_for = now() + ($1 || ' minutes')::interval, status = 'scheduled', updated_at = now()
         where id = (select id from latest)`,
        [minutes, userId]
      )
    );
  }

  if (extraction.parsed.intent === "complete_todo") {
    await withClient((db) =>
      db.query(
        `update todos set status = 'done', completed_at = now(), updated_at = now()
         where id = (
           select id from todos where user_id = $1 and status = 'open' order by coalesce(due_at, now() + interval '365 days') asc limit 1
         )`,
        [userId]
      )
    );
  }

  if (extraction.parsed.intent === "create_next_action") {
    const title = extraction.parsed.new_todos[0]?.title;
    if (title) {
      await withClient((db) =>
        db.query(`insert into todos (user_id, title) values ($1, $2)`, [userId, title])
      );
    }
  }

  return jsonOk({ ok: true, parsed: extraction.parsed, source: extraction.source });
}
