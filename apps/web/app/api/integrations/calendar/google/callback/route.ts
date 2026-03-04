import { withClient } from "@coach/db";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) {
    return Response.redirect(new URL("/dashboard?integration_error=google_oauth_failed", request.url));
  }

  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET || !process.env.APP_BASE_URL) {
    return Response.redirect(new URL("/dashboard?integration_error=google_config_missing", request.url));
  }

  const redirectUri = `${process.env.APP_BASE_URL}/api/integrations/calendar/google/callback`;
  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri
    }).toString()
  });

  const tokenBody = (await tokenResponse.json().catch(() => null)) as
    | {
        access_token?: string;
        refresh_token?: string;
        scope?: string;
        token_type?: string;
        expires_in?: number;
      }
    | null;

  if (!tokenResponse.ok || !tokenBody?.access_token) {
    return Response.redirect(new URL("/dashboard?integration_error=google_oauth_failed", request.url));
  }

  const expiresAt =
    typeof tokenBody.expires_in === "number" ? new Date(Date.now() + tokenBody.expires_in * 1000).toISOString() : null;

  await withClient(async (db) => {
    await db.query(
      `insert into oauth_tokens (user_id, provider, access_token_enc, refresh_token_enc, scope, token_type, expires_at)
       values ($1, 'google', $2, $3, $4, $5, $6)
       on conflict (user_id, provider)
       do update set
         access_token_enc = excluded.access_token_enc,
         refresh_token_enc = coalesce(excluded.refresh_token_enc, oauth_tokens.refresh_token_enc),
         scope = excluded.scope,
         token_type = excluded.token_type,
         expires_at = excluded.expires_at,
         updated_at = now()`,
      [
        state,
        tokenBody.access_token,
        tokenBody.refresh_token ?? null,
        tokenBody.scope ?? null,
        tokenBody.token_type ?? null,
        expiresAt
      ]
    );

    await db.query(
      `insert into integrations (user_id, type, status, config)
       values ($1, 'google_calendar', 'active', '{}'::jsonb)
       on conflict (user_id, type)
       do update set status = 'active', updated_at = now()`,
      [state]
    );
  });

  return Response.redirect(new URL("/dashboard?integration_status=google_connected", request.url));
}
