import { cookies } from "next/headers";
import { getUserBySessionToken, type SessionUser } from "@coach/db";

export async function requireSessionUser(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get("coach_session")?.value;
  if (!token) {
    return null;
  }
  return getUserBySessionToken(token);
}

export async function getSessionToken(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get("coach_session")?.value ?? null;
}
