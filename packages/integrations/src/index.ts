import { logEvent } from "@coach/observability";

export type TelegramSendInput = {
  botToken: string;
  chatId: string;
  text: string;
};

export async function telegramSendMessage(input: TelegramSendInput): Promise<{ ok: boolean; id?: string; raw: unknown }> {
  const url = `https://api.telegram.org/bot${input.botToken}/sendMessage`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: input.chatId, text: input.text })
  });

  const raw = (await response.json()) as Record<string, unknown>;
  const message = raw.result as { message_id?: number } | undefined;
  return { ok: response.ok, id: message?.message_id?.toString(), raw };
}

export type DiscordSendInput = {
  botToken: string;
  channelId: string;
  content: string;
};

export async function discordSendMessage(input: DiscordSendInput): Promise<{ ok: boolean; id?: string; raw: unknown }> {
  const url = `https://discord.com/api/v10/channels/${input.channelId}/messages`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bot ${input.botToken}`
    },
    body: JSON.stringify({ content: input.content, allowed_mentions: { parse: [] } })
  });

  const raw = (await response.json()) as Record<string, unknown>;
  return { ok: response.ok, id: raw.id as string | undefined, raw };
}

export type TelegramLinkMatch = { code: string } | null;

export function parseTelegramLinkCommand(text: string): TelegramLinkMatch {
  const match = text.trim().match(/^\/link\s+([A-Za-z0-9]{6,10})$/);
  if (!match) {
    return null;
  }
  return { code: match[1] };
}

export function isTelegramTasksCommand(text: string): boolean {
  return /^\/(tasks|todos)(?:@[A-Za-z0-9_]+)?$/i.test(text.trim());
}

export function isTelegramAiTestCommand(text: string): boolean {
  return /^\/test_ai(?:@[A-Za-z0-9_]+)?$/i.test(text.trim());
}

export function redactProviderError(raw: unknown): Record<string, unknown> {
  if (typeof raw !== "object" || raw === null) {
    return { raw };
  }
  const asRecord = raw as Record<string, unknown>;
  const cloned = { ...asRecord };
  delete cloned.token;
  return cloned;
}

export function captureDeliveryLog(args: {
  provider: "telegram" | "discord";
  checkinId: string;
  runId: string;
  ok: boolean;
  response: unknown;
}): void {
  logEvent({
    level: args.ok ? "info" : "error",
    message: args.ok ? "delivery_success" : "delivery_failure",
    provider: args.provider,
    checkinId: args.checkinId,
    runId: args.runId,
    metadata: {
      response: redactProviderError(args.response)
    }
  });
}

export type BusyInterval = { start: string; end: string };

export async function fetchGoogleFreeBusy(args: {
  accessToken: string;
  timeMin: string;
  timeMax: string;
  timezone: string;
}): Promise<BusyInterval[]> {
  const response = await fetch("https://www.googleapis.com/calendar/v3/freeBusy", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${args.accessToken}`
    },
    body: JSON.stringify({
      timeMin: args.timeMin,
      timeMax: args.timeMax,
      timeZone: args.timezone,
      items: [{ id: "primary" }]
    })
  });

  if (!response.ok) {
    return [];
  }

  const body = (await response.json()) as {
    calendars?: Record<string, { busy?: Array<{ start?: string; end?: string }> }>;
  };
  const entries = Object.values(body.calendars ?? {});
  return entries.flatMap((entry) =>
    (entry.busy ?? [])
      .filter((slot) => slot.start && slot.end)
      .map((slot) => ({ start: slot.start as string, end: slot.end as string }))
  );
}

export async function fetchMicrosoftFreeBusy(args: {
  accessToken: string;
  timeMin: string;
  timeMax: string;
  timezone: string;
}): Promise<BusyInterval[]> {
  const response = await fetch("https://graph.microsoft.com/v1.0/me/calendar/getSchedule", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${args.accessToken}`
    },
    body: JSON.stringify({
      schedules: ["me"],
      startTime: { dateTime: args.timeMin, timeZone: args.timezone },
      endTime: { dateTime: args.timeMax, timeZone: args.timezone },
      availabilityViewInterval: 30
    })
  });

  if (!response.ok) {
    return [];
  }

  const body = (await response.json()) as {
    value?: Array<{ scheduleItems?: Array<{ start?: { dateTime?: string }; end?: { dateTime?: string } }> }>;
  };

  return (body.value ?? []).flatMap((calendar) =>
    (calendar.scheduleItems ?? [])
      .filter((item) => item.start?.dateTime && item.end?.dateTime)
      .map((item) => ({ start: item.start?.dateTime as string, end: item.end?.dateTime as string }))
  );
}
