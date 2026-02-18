import { requireSessionUser } from "@/lib/auth";
import { jsonError, jsonOk } from "@/lib/http";

export async function POST() {
  const user = await requireSessionUser();
  if (!user) {
    return jsonError("Unauthorized", 401);
  }

  const redirectUri = `${process.env.APP_BASE_URL}/api/integrations/calendar/google/callback`;
  const scope = encodeURIComponent("https://www.googleapis.com/auth/calendar.readonly");
  const url = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${process.env.GOOGLE_CLIENT_ID ?? ""}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${scope}&access_type=offline&prompt=consent&state=${user.id}`;

  return jsonOk({ auth_url: url });
}
