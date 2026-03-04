export interface Env {
  API_BASE_URL?: string;
  INTERNAL_CRON_KEY?: string;
}

function normalizeApiBaseUrl(value: string | undefined): string {
  const base = value?.trim() || "http://localhost:3000";
  return base.replace(/\/+$/, "");
}

function resolveInternalKey(env: Env, request?: Request): string {
  const fromEnv = env.INTERNAL_CRON_KEY?.trim();
  if (fromEnv) {
    return fromEnv;
  }
  const fromHeader = request?.headers.get("x-internal-key")?.trim();
  if (fromHeader) {
    return fromHeader;
  }
  return "";
}

async function callInternal(path: string, env: Env, request?: Request): Promise<Response> {
  const apiBaseUrl = normalizeApiBaseUrl(env.API_BASE_URL);
  const internalKey = resolveInternalKey(env, request);
  if (!internalKey) {
    return new Response(JSON.stringify({ error: "Missing INTERNAL_CRON_KEY for scheduler worker." }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }

  return fetch(`${apiBaseUrl}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-internal-key": internalKey
    }
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/run" && request.method === "POST") {
      const schedulerResp = await callInternal("/api/scheduler/run", env, request);
      const dispatchResp = schedulerResp.ok ? await callInternal("/api/checkins/dispatch", env, request) : null;

      return new Response(
        JSON.stringify({
          ok: schedulerResp.ok && Boolean(dispatchResp?.ok),
          scheduler_status: schedulerResp.status,
          dispatch_status: dispatchResp?.status ?? null,
          api_base_url: normalizeApiBaseUrl(env.API_BASE_URL)
        }),
        {
          status: schedulerResp.ok && dispatchResp?.ok ? 200 : 500,
          headers: { "Content-Type": "application/json" }
        }
      );
    }

    return new Response("coach-scheduler is running", {
      status: 200,
      headers: { "Content-Type": "text/plain; charset=utf-8" }
    });
  },

  async scheduled(_controller: unknown, env: Env): Promise<void> {
    if (!resolveInternalKey(env)) {
      console.error("scheduler_config_missing_internal_key");
      return;
    }

    const schedulerResp = await callInternal("/api/scheduler/run", env);
    if (!schedulerResp.ok) {
      console.error("scheduler_run_failed", await schedulerResp.text());
      return;
    }

    const dispatchResp = await callInternal("/api/checkins/dispatch", env);
    if (!dispatchResp.ok) {
      console.error("dispatch_failed", await dispatchResp.text());
      return;
    }

    console.log("scheduler_tick_complete", {
      scheduler: await schedulerResp.json(),
      dispatch: await dispatchResp.json()
    });
  }
};
