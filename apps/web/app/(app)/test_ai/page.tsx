import Link from "next/link";
import { redirect } from "next/navigation";
import { summarizeTodos, type TodoSummaryItem } from "@coach/ai";
import { listTodos } from "@coach/db";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getAiExtractionConfig } from "@/lib/ai";
import { requireSessionUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

type TodoRow = {
  id: string;
  title: string;
  status: "open" | "done" | "archived";
  priority: number;
  due_at: string | Date | null;
};

function normalizeDueAt(value: string | Date | null): string | null {
  if (!value) {
    return null;
  }
  if (value instanceof Date) {
    return Number.isNaN(value.valueOf()) ? null : value.toISOString();
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf())) {
    return null;
  }
  return parsed.toISOString();
}

function resolveConfiguredProvider(): "openai" | "ollama" | "heuristic" {
  const provider = process.env.AI_PROVIDER;
  if (provider === "openai" || provider === "ollama" || provider === "heuristic") {
    return provider;
  }
  if (process.env.OPENAI_API_KEY) {
    return "openai";
  }
  if (process.env.OLLAMA_MODEL) {
    return "ollama";
  }
  return "heuristic";
}

export default async function TestAiPage() {
  const user = await requireSessionUser();
  if (!user) {
    redirect("/signin");
  }

  const todosRaw = (await listTodos(user.id)) as TodoRow[];
  const todosForSummary: TodoSummaryItem[] = todosRaw.map((todo) => ({
    title: todo.title,
    status: todo.status,
    priority: todo.priority,
    due_at: normalizeDueAt(todo.due_at)
  }));

  const summary = await summarizeTodos({
    todos: todosForSummary,
    ...getAiExtractionConfig()
  });

  const configuredProvider = resolveConfiguredProvider();

  return (
    <main className="page-shell">
      <section className="section-spacer">
        <Card>
          <CardHeader>
            <CardTitle>AI Integration Test</CardTitle>
            <CardDescription>Verifies the configured model provider can summarize your current todo list.</CardDescription>
          </CardHeader>
          <CardContent className="stack">
            <div className="chip-row">
              <Badge variant="muted">Configured: {configuredProvider}</Badge>
              <Badge variant={summary.source === "model" ? "success" : "danger"}>Source: {summary.source}</Badge>
              <Badge variant="accent">Todos: {todosForSummary.length}</Badge>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Summary</CardTitle>
              </CardHeader>
              <CardContent>
                <p style={{ margin: 0, lineHeight: 1.6 }}>{summary.summary}</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Context Sent To Model</CardTitle>
                <CardDescription>Use this to confirm the model received your todo list data.</CardDescription>
              </CardHeader>
              <CardContent>
                <pre
                  style={{
                    margin: 0,
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                    fontSize: "0.86rem",
                    lineHeight: 1.55
                  }}
                >
                  {JSON.stringify(todosForSummary, null, 2)}
                </pre>
              </CardContent>
            </Card>

            <div className="chip-row">
              <Link href="/test_ai?refresh=1">
                <Button type="button">Run again</Button>
              </Link>
              <Link href="/dashboard">
                <Button type="button" variant="secondary">
                  Back to dashboard
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
