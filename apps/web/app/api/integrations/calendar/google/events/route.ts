import { withClient } from "@coach/db";
import { requireSessionUser } from "@/lib/auth";
import { jsonError, jsonOk } from "@/lib/http";

type StoredGoogleToken = {
  access_token_enc: string;
  refresh_token_enc: string | null;
};

type GoogleTokenRefreshResponse = {
  access_token?: string;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
  expires_in?: number;
};

type GoogleEventsResponse = {
  items?: Array<Record<string, unknown>>;
  nextPageToken?: string;
};

function normalizeTimeZone(timeZone: string | undefined): string {
  const candidate = timeZone && timeZone.trim() ? timeZone : "UTC";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: candidate });
    return candidate;
  } catch {
    return "UTC";
  }
}

function getDatePartsInTimeZone(date: Date, timeZone: string): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day)
  };
}

function getTimeZoneOffsetMs(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).formatToParts(date);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const asUtcTime = Date.UTC(
    Number(map.year),
    Number(map.month) - 1,
    Number(map.day),
    Number(map.hour),
    Number(map.minute),
    Number(map.second)
  );
  return asUtcTime - date.getTime();
}

function zonedDateTimeToUtcIso(args: {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  timeZone: string;
}): string {
  const naiveUtcTime = Date.UTC(args.year, args.month - 1, args.day, args.hour, args.minute, args.second);
  let utcTime = naiveUtcTime;
  for (let i = 0; i < 2; i += 1) {
    utcTime = naiveUtcTime - getTimeZoneOffsetMs(new Date(utcTime), args.timeZone);
  }
  return new Date(utcTime).toISOString();
}

function getTodayRange(timeZone: string): { timeMin: string; timeMax: string } {
  const now = new Date();
  const today = getDatePartsInTimeZone(now, timeZone);
  const nextDate = new Date(Date.UTC(today.year, today.month - 1, today.day + 1));
  const nextDay = {
    year: nextDate.getUTCFullYear(),
    month: nextDate.getUTCMonth() + 1,
    day: nextDate.getUTCDate()
  };

  return {
    timeMin: zonedDateTimeToUtcIso({
      year: today.year,
      month: today.month,
      day: today.day,
      hour: 0,
      minute: 0,
      second: 0,
      timeZone
    }),
    timeMax: zonedDateTimeToUtcIso({
      year: nextDay.year,
      month: nextDay.month,
      day: nextDay.day,
      hour: 0,
      minute: 0,
      second: 0,
      timeZone
    })
  };
}

function parseBoundedInteger(value: string | null, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, Math.trunc(parsed)));
}

async function getGoogleToken(userId: string): Promise<StoredGoogleToken | null> {
  const result = await withClient((db) =>
    db.query(`select access_token_enc, refresh_token_enc from oauth_tokens where user_id = $1 and provider = 'google' limit 1`, [userId])
  );
  return (result.rows[0] as StoredGoogleToken | undefined) ?? null;
}

async function saveGoogleToken(args: {
  userId: string;
  accessToken: string;
  refreshToken: string | null;
  scope: string | null;
  tokenType: string | null;
  expiresAt: string | null;
}): Promise<void> {
  await withClient((db) =>
    db.query(
      `update oauth_tokens
       set access_token_enc = $2,
           refresh_token_enc = $3,
           scope = $4,
           token_type = $5,
           expires_at = $6,
           updated_at = now()
       where user_id = $1 and provider = 'google'`,
      [args.userId, args.accessToken, args.refreshToken, args.scope, args.tokenType, args.expiresAt]
    )
  );
}

async function refreshGoogleAccessToken(refreshToken: string): Promise<GoogleTokenRefreshResponse | null> {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    return null;
  }

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: "refresh_token"
    }).toString()
  });

  const body = (await response.json().catch(() => null)) as GoogleTokenRefreshResponse | null;
  if (!response.ok || !body?.access_token) {
    return null;
  }

  return body;
}

async function fetchGoogleEventsPage(args: {
  accessToken: string;
  calendarId: string;
  query: URLSearchParams;
}): Promise<Response> {
  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(args.calendarId)}/events?${args.query.toString()}`;
  return fetch(url, {
    headers: {
      Authorization: `Bearer ${args.accessToken}`
    }
  });
}

export async function GET(request: Request) {
  const user = await requireSessionUser();
  if (!user) {
    return jsonError("Unauthorized", 401);
  }

  const token = await getGoogleToken(user.id);
  if (!token) {
    return jsonError("Google calendar is not connected.", 400);
  }

  const url = new URL(request.url);
  const calendarId = url.searchParams.get("calendarId") || "primary";
  const timeZone = normalizeTimeZone(user.timezone);
  let timeMin = url.searchParams.get("timeMin");
  let timeMax = url.searchParams.get("timeMax");
  if (!timeMin && !timeMax) {
    const todayRange = getTodayRange(timeZone);
    timeMin = todayRange.timeMin;
    timeMax = todayRange.timeMax;
  }
  const singleEvents = url.searchParams.get("singleEvents") !== "false";
  const showDeleted = url.searchParams.get("showDeleted") === "true";
  const maxPages = parseBoundedInteger(url.searchParams.get("maxPages"), 10, 1, 50);
  const maxResults = parseBoundedInteger(url.searchParams.get("maxResults"), 2500, 1, 2500);

  const baseQuery = new URLSearchParams({
    maxResults: String(maxResults),
    singleEvents: singleEvents ? "true" : "false",
    showDeleted: showDeleted ? "true" : "false"
  });
  if (timeMin) {
    baseQuery.set("timeMin", timeMin);
  }
  if (timeMax) {
    baseQuery.set("timeMax", timeMax);
  }
  if (singleEvents) {
    baseQuery.set("orderBy", "startTime");
  }

  let accessToken = token.access_token_enc;
  let refreshToken = token.refresh_token_enc;
  const events: Array<Record<string, unknown>> = [];
  let pageToken: string | null = null;
  let pagesFetched = 0;
  let truncated = false;

  while (true) {
    if (pagesFetched >= maxPages) {
      truncated = pageToken !== null;
      break;
    }

    const query = new URLSearchParams(baseQuery);
    if (pageToken) {
      query.set("pageToken", pageToken);
    }

    let response = await fetchGoogleEventsPage({ accessToken, calendarId, query });

    if (response.status === 401 && refreshToken) {
      const refreshed = await refreshGoogleAccessToken(refreshToken);
      if (!refreshed?.access_token) {
        return jsonError("Google token expired. Reconnect Google Calendar and try again.", 401);
      }

      accessToken = refreshed.access_token;
      refreshToken = refreshed.refresh_token ?? refreshToken;
      const expiresAt = typeof refreshed.expires_in === "number" ? new Date(Date.now() + refreshed.expires_in * 1000).toISOString() : null;
      await saveGoogleToken({
        userId: user.id,
        accessToken,
        refreshToken,
        scope: refreshed.scope ?? null,
        tokenType: refreshed.token_type ?? null,
        expiresAt
      });

      response = await fetchGoogleEventsPage({ accessToken, calendarId, query });
    }

    if (!response.ok) {
      return jsonError("Failed to fetch Google Calendar events.", response.status);
    }

    const body = (await response.json()) as GoogleEventsResponse;
    events.push(...(body.items ?? []));
    pageToken = body.nextPageToken ?? null;
    pagesFetched += 1;
    if (!pageToken) {
      break;
    }
  }

  return jsonOk({
    provider: "google",
    time_zone: timeZone,
    time_min: timeMin,
    time_max: timeMax,
    calendar_id: calendarId,
    total_events: events.length,
    pages_fetched: pagesFetched,
    truncated,
    next_page_token: pageToken,
    events
  });
}
