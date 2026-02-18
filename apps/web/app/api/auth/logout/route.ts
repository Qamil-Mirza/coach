import { cookies } from "next/headers";
import { revokeSession } from "@coach/db";
import { getSessionToken } from "@/lib/auth";
import { jsonOk } from "@/lib/http";

export async function POST() {
  const token = await getSessionToken();
  if (token) {
    await revokeSession(token);
  }

  const cookieStore = await cookies();
  cookieStore.delete("coach_session");

  return jsonOk({ ok: true });
}
