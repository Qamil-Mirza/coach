import { requireSessionUser } from "@/lib/auth";
import { jsonError, jsonOk } from "@/lib/http";

export async function POST() {
  const user = await requireSessionUser();
  if (!user) {
    return jsonError("Unauthorized", 401);
  }

  const redirectUri = `${process.env.APP_BASE_URL}/api/integrations/calendar/microsoft/callback`;
  const scope = encodeURIComponent("openid profile offline_access Calendars.Read");
  const tenant = process.env.MS_TENANT_ID ?? "common";
  const clientId = process.env.MS_CLIENT_ID ?? "";
  const url = `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize?client_id=${clientId}&response_type=code&redirect_uri=${encodeURIComponent(redirectUri)}&response_mode=query&scope=${scope}&state=${user.id}`;

  return jsonOk({ auth_url: url });
}
