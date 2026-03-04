"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  createIntegrationLink,
  createTodo,
  deleteTodo,
  disableIntegration,
  disconnectCalendarProvider,
  getLinkedChannels,
  revokeSession,
  updateReminderSettings,
  updateTodo
} from "@coach/db";
import { todoCreateSchema, todoUpdateSchema } from "@coach/shared";
import { getSessionToken, requireSessionUser } from "@/lib/auth";

function toDateTimeIso(value: FormDataEntryValue | null): string | null {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf())) {
    return null;
  }
  return parsed.toISOString();
}

async function assertAuth() {
  const user = await requireSessionUser();
  if (!user) {
    redirect("/signin");
  }
  return user;
}

export async function createTodoAction(formData: FormData) {
  const user = await assertAuth();
  const priorityRaw = Number(formData.get("priority") ?? 2);

  const parsed = todoCreateSchema.safeParse({
    title: String(formData.get("title") ?? ""),
    due_at: toDateTimeIso(formData.get("due_at")),
    priority: Number.isFinite(priorityRaw) ? priorityRaw : 2,
    tags: []
  });
  if (!parsed.success) {
    return;
  }

  await createTodo(user.id, parsed.data);
  revalidatePath("/dashboard");
}

export async function updateTodoAction(formData: FormData) {
  const user = await assertAuth();
  const todoId = String(formData.get("todo_id") ?? "");
  const redirectTo = typeof formData.get("redirect_to") === "string" ? String(formData.get("redirect_to")) : null;
  if (!todoId) {
    return;
  }

  const priorityRaw = Number(formData.get("priority") ?? 2);
  const parsed = todoUpdateSchema.safeParse({
    title: String(formData.get("title") ?? ""),
    status: typeof formData.get("status") === "string" ? String(formData.get("status")) : undefined,
    due_at: toDateTimeIso(formData.get("due_at")),
    priority: Number.isFinite(priorityRaw) ? priorityRaw : 2
  });
  if (!parsed.success) {
    return;
  }

  await updateTodo(user.id, todoId, parsed.data);
  revalidatePath("/dashboard");
  if (redirectTo) {
    redirect(redirectTo);
  }
}

export async function toggleTodoStatusAction(formData: FormData) {
  const user = await assertAuth();
  const todoId = String(formData.get("todo_id") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!todoId || (status !== "open" && status !== "done")) {
    return;
  }

  const parsed = todoUpdateSchema.safeParse({ status });
  if (!parsed.success) {
    return;
  }

  await updateTodo(user.id, todoId, parsed.data);
  revalidatePath("/dashboard");
}

export async function deleteTodoAction(formData: FormData) {
  const user = await assertAuth();
  const todoId = String(formData.get("todo_id") ?? "");
  if (!todoId) {
    return;
  }

  await deleteTodo(user.id, todoId);
  revalidatePath("/dashboard");
}

export async function createTelegramLinkCodeAction() {
  const user = await assertAuth();
  const result = await createIntegrationLink(user.id, "telegram");
  redirect(`/dashboard?telegram_code=${encodeURIComponent(result.code)}`);
}

export async function createDiscordLinkCodeAction() {
  const user = await assertAuth();
  const result = await createIntegrationLink(user.id, "discord");
  redirect(`/dashboard?discord_code=${encodeURIComponent(result.code)}`);
}

export async function disableIntegrationAction(formData: FormData) {
  const user = await assertAuth();
  const type = String(formData.get("type") ?? "");
  if (!type) {
    return;
  }

  await disableIntegration(user.id, type);
  revalidatePath("/dashboard");
}

export async function startGoogleConnectAction() {
  const user = await assertAuth();
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.APP_BASE_URL) {
    redirect("/dashboard?integration_error=google_config_missing");
  }

  const redirectUri = `${process.env.APP_BASE_URL}/api/integrations/calendar/google/callback`;
  const scope = encodeURIComponent("https://www.googleapis.com/auth/calendar.readonly");
  const url = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${process.env.GOOGLE_CLIENT_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${scope}&access_type=offline&prompt=consent&state=${user.id}`;
  redirect(url);
}

export async function startMicrosoftConnectAction() {
  const user = await assertAuth();
  if (!process.env.MS_CLIENT_ID || !process.env.APP_BASE_URL) {
    redirect("/dashboard?integration_error=microsoft_config_missing");
  }

  const redirectUri = `${process.env.APP_BASE_URL}/api/integrations/calendar/microsoft/callback`;
  const scope = encodeURIComponent("openid profile offline_access Calendars.Read");
  const tenant = process.env.MS_TENANT_ID ?? "common";
  const url = `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize?client_id=${process.env.MS_CLIENT_ID}&response_type=code&redirect_uri=${encodeURIComponent(redirectUri)}&response_mode=query&scope=${scope}&state=${user.id}`;
  redirect(url);
}

export async function disconnectCalendarProviderAction(formData: FormData) {
  const user = await assertAuth();
  const provider = String(formData.get("provider") ?? "");
  if (provider !== "google" && provider !== "microsoft") {
    return;
  }

  const wasDisconnected = await disconnectCalendarProvider(user.id, provider);
  revalidatePath("/dashboard");
  const status = wasDisconnected ? `${provider}_disconnected` : `${provider}_disconnect_missing`;
  redirect(`/dashboard?integration_status=${encodeURIComponent(status)}`);
}

function normalizeTimeInput(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return "12:10";
  }
  const [hhRaw, mmRaw] = trimmed.split(":");
  const hh = Number(hhRaw ?? "12");
  const mm = Number(mmRaw ?? "10");
  if (!Number.isFinite(hh) || !Number.isFinite(mm) || hh < 0 || hh > 23 || mm < 0 || mm > 59) {
    return "12:10";
  }
  return `${String(Math.trunc(hh)).padStart(2, "0")}:${String(Math.trunc(mm)).padStart(2, "0")}`;
}

export async function updateReminderSettingsAction(formData: FormData) {
  const user = await assertAuth();
  const enabled = String(formData.get("fixed_telegram_enabled") ?? "false") === "true";
  const timeLocal = normalizeTimeInput(String(formData.get("fixed_telegram_time_local") ?? "12:10"));
  const messageModeRaw = String(formData.get("fixed_telegram_message_mode") ?? "ai_motivation");
  const messageMode = messageModeRaw === "ai_motivation" ? "ai_motivation" : "ai_motivation";

  if (enabled) {
    const channels = await getLinkedChannels(user.id);
    if (!channels.includes("telegram")) {
      redirect("/dashboard?integration_status=reminder_requires_telegram");
    }
  }

  await updateReminderSettings(user.id, {
    fixed_telegram_enabled: enabled,
    fixed_telegram_time_local: timeLocal,
    fixed_telegram_message_mode: messageMode,
    fixed_telegram_days: "daily"
  });

  revalidatePath("/dashboard");
  redirect("/dashboard?integration_status=reminder_settings_saved");
}

export async function signOutAction() {
  const token = await getSessionToken();
  if (token) {
    await revokeSession(token);
  }

  const cookieStore = await cookies();
  cookieStore.delete("coach_session");
  redirect("/signin");
}
