import { cookies } from "next/headers";
import { z } from "zod";
import { verifyMagicCode } from "@coach/db";
import { jsonError, jsonOk } from "@/lib/http";

const schema = z.object({ email: z.string().email(), code: z.string().min(4).max(12) });

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return jsonError("Invalid payload");
  }

  const result = await verifyMagicCode(parsed.data.email, parsed.data.code);
  if (!result) {
    return jsonError("Code invalid or expired", 401);
  }

  const cookieStore = await cookies();
  cookieStore.set("coach_session", result.sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30
  });

  return jsonOk({ user: result.user });
}
