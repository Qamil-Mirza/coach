export interface Env {
  API_BASE_URL: string;
  INTERNAL_CRON_KEY: string;
}

async function callInternal(path: string, env: Env): Promise<Response> {
  return fetch(`${env.API_BASE_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-internal-key": env.INTERNAL_CRON_KEY
    }
  });
}

export default {
  async scheduled(_controller: unknown, env: Env): Promise<void> {
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
