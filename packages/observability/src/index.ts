export type LogLevel = "debug" | "info" | "warn" | "error";

export type LogEvent = {
  level: LogLevel;
  message: string;
  runId?: string;
  checkinId?: string;
  provider?: string;
  metadata?: Record<string, unknown>;
};

export function logEvent(event: LogEvent): void {
  const payload = {
    ts: new Date().toISOString(),
    ...event
  };
  // Keep logs structured for ingestion by any backend later.
  console.log(JSON.stringify(payload));
}

export function createRunId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
