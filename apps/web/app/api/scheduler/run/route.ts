import { createRunId, logEvent } from "@coach/observability";
import { runSchedulerPass } from "@/lib/scheduler";
import { jsonError, jsonOk } from "@/lib/http";

function internalAuthorized(request: Request): boolean {
  const key = request.headers.get("x-internal-key");
  return Boolean(key && key === process.env.INTERNAL_CRON_KEY);
}

export async function POST(request: Request) {
  if (!internalAuthorized(request)) {
    return jsonError("Unauthorized", 401);
  }

  const runId = createRunId("scheduler");
  logEvent({ level: "info", message: "scheduler_run_started", runId });

  const result = await runSchedulerPass();

  logEvent({ level: "info", message: "scheduler_run_finished", runId, metadata: result });
  return jsonOk({ runId, ...result });
}
