import { z } from "zod";
import { requestMagicLink } from "@coach/db";
import { jsonError, jsonOk } from "@/lib/http";

const schema = z.object({ email: z.string().email() });

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return jsonError("Invalid email");
  }

  const result = await requestMagicLink(parsed.data.email);
  return jsonOk({ message: "Code requested", debug_code: result.code });
}
