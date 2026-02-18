import { withClient } from "@coach/db";
import { jsonError, jsonOk } from "@/lib/http";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) {
    return jsonError("Missing OAuth callback params");
  }

  await withClient((db) =>
    db.query(
      `insert into oauth_tokens (user_id, provider, access_token_enc, refresh_token_enc)
       values ($1, 'microsoft', $2, $3)
       on conflict (user_id, provider)
       do update set access_token_enc = excluded.access_token_enc, refresh_token_enc = excluded.refresh_token_enc, updated_at = now()`,
      [state, `ms_access_${code}`, ""]
    )
  );

  return jsonOk({ ok: true, provider: "microsoft" });
}
