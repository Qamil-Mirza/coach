import Link from "next/link";
import { redirect } from "next/navigation";
import { getCalendarTokens, getLinkedChannels, getReminderSettings, listTodos } from "@coach/db";
import { Spotlight } from "@/components/effects/spotlight";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { requireSessionUser } from "@/lib/auth";
import {
  createDiscordLinkCodeAction,
  createTelegramLinkCodeAction,
  createTodoAction,
  deleteTodoAction,
  disconnectCalendarProviderAction,
  disableIntegrationAction,
  signOutAction,
  startGoogleConnectAction,
  startMicrosoftConnectAction,
  toggleTodoStatusAction,
  updateReminderSettingsAction,
  updateTodoAction
} from "./actions";

type TodoRow = {
  id: string;
  title: string;
  status: "open" | "done" | "archived";
  priority: number;
  due_at: string | null;
};

function toLocalDateTimeInput(value: string | null): string {
  if (!value) {
    return "";
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf())) {
    return "";
  }
  const local = new Date(parsed.getTime() - parsed.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function toLocalTimeInput(value: string): string {
  const [hh = "12", mm = "10"] = value.split(":");
  return `${hh.padStart(2, "0")}:${mm.padStart(2, "0")}`;
}

function formatDueDate(value: string | null): string {
  if (!value) {
    return "No due date";
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf())) {
    return "No due date";
  }
  return parsed.toLocaleString();
}

function getPriorityLabel(priority: number): string {
  if (priority === 1) {
    return "High";
  }
  if (priority === 3) {
    return "Low";
  }
  return "Medium";
}

function getPriorityVariant(priority: number): "danger" | "accent" | "muted" {
  if (priority === 1) {
    return "danger";
  }
  if (priority === 3) {
    return "muted";
  }
  return "accent";
}

function getIntegrationStatusAlert(status: string): { variant: "success" | "error"; message: string } {
  if (status === "google_connected") {
    return { variant: "success", message: "Google Calendar connected." };
  }
  if (status === "microsoft_connected") {
    return { variant: "success", message: "Microsoft Calendar connected." };
  }
  if (status === "google_disconnected") {
    return { variant: "success", message: "Google Calendar disconnected." };
  }
  if (status === "microsoft_disconnected") {
    return { variant: "success", message: "Microsoft Calendar disconnected." };
  }
  if (status === "google_disconnect_missing") {
    return { variant: "error", message: "Google Calendar was already disconnected." };
  }
  if (status === "microsoft_disconnect_missing") {
    return { variant: "error", message: "Microsoft Calendar was already disconnected." };
  }
  if (status === "reminder_settings_saved") {
    return { variant: "success", message: "Daily Telegram reminder settings saved." };
  }
  if (status === "reminder_requires_telegram") {
    return { variant: "error", message: "Link Telegram first before enabling the daily reminder." };
  }
  return { variant: "error", message: "Calendar disconnect failed. Please try again." };
}

export default async function DashboardPage({
  searchParams
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireSessionUser();
  if (!user) {
    redirect("/signin");
  }

  const [todosRaw, linkedChannels, calendarTokens, reminderSettings, params] = await Promise.all([
    listTodos(user.id),
    getLinkedChannels(user.id),
    getCalendarTokens(user.id),
    getReminderSettings(user.id),
    searchParams ?? Promise.resolve({} as Record<string, string | string[] | undefined>)
  ]);

  const todos = todosRaw as TodoRow[];
  const openCount = todos.filter((todo) => todo.status === "open").length;
  const doneCount = todos.filter((todo) => todo.status === "done").length;
  const isGoogleConnected = calendarTokens.some((token) => token.provider === "google");
  const isMicrosoftConnected = calendarTokens.some((token) => token.provider === "microsoft");
  const telegramCode = typeof params.telegram_code === "string" ? params.telegram_code : null;
  const discordCode = typeof params.discord_code === "string" ? params.discord_code : null;
  const integrationError = typeof params.integration_error === "string" ? params.integration_error : null;
  const integrationStatus = typeof params.integration_status === "string" ? params.integration_status : null;
  const editTodoId = typeof params.edit === "string" ? params.edit : null;
  const selectedTodo = editTodoId ? todos.find((todo) => todo.id === editTodoId) ?? null : null;
  const integrationStatusAlert = integrationStatus ? getIntegrationStatusAlert(integrationStatus) : null;

  return (
    <main className="page-shell">
      <Spotlight />

      <Card>
        <CardContent>
          <div className="dashboard-header">
            <div className="stack">
              <p className="eyebrow">
                <Badge variant="accent">Todo Workspace</Badge>
                {user.email}
              </p>
              <h1>Focus on the next task that matters.</h1>
              <p className="muted">Create todos and manage everything from a single clean list view.</p>
              <div className="chip-row">
                <Badge variant="muted">Total: {todos.length}</Badge>
                <Badge variant="accent">Open: {openCount}</Badge>
                <Badge variant="success">Done: {doneCount}</Badge>
              </div>
            </div>
            <div className="chip-row">
              <form action={signOutAction}>
                <Button type="submit" variant="secondary">
                  Sign out
                </Button>
              </form>
            </div>
          </div>
        </CardContent>
      </Card>

      {(telegramCode || discordCode || integrationError || integrationStatusAlert) ? (
        <section className="section-spacer stack">
          {telegramCode ? (
            <Alert variant="success">
              Telegram link code: <strong>{telegramCode}</strong>. Send <code>/link {telegramCode}</code> to your bot.
            </Alert>
          ) : null}
          {discordCode ? (
            <Alert variant="success">
              Discord link code: <strong>{discordCode}</strong>. Use it in your Discord setup flow.
            </Alert>
          ) : null}
          {integrationError ? (
            <Alert variant="error">
              {integrationError === "google_config_missing" ? "Google integration config missing. Set GOOGLE_CLIENT_ID and APP_BASE_URL." : null}
              {integrationError === "microsoft_config_missing" ? "Microsoft integration config missing. Set MS_CLIENT_ID and APP_BASE_URL." : null}
              {integrationError === "google_oauth_failed" ? "Google OAuth callback failed. Try connecting again." : null}
            </Alert>
          ) : null}
          {integrationStatusAlert ? <Alert variant={integrationStatusAlert.variant}>{integrationStatusAlert.message}</Alert> : null}
        </section>
      ) : null}

      <section className="section-spacer">
        <Card>
          <CardHeader>
            <CardTitle>Create Todo</CardTitle>
            <CardDescription>Add a task and it appears instantly in the list below.</CardDescription>
          </CardHeader>
          <CardContent>
            <form action={createTodoAction} className="todo-create">
              <label className="field">
                <span className="field-label">Todo description</span>
                <Input name="title" placeholder="Draft onboarding email sequence" required />
              </label>
              <label className="field">
                <span className="field-label">Priority</span>
                <Select name="priority" defaultValue="2">
                  <option value="1">High</option>
                  <option value="2">Medium</option>
                  <option value="3">Low</option>
                </Select>
              </label>
              <label className="field">
                <span className="field-label">Due date</span>
                <Input type="datetime-local" name="due_at" />
              </label>
              <Button type="submit">Create todo</Button>
            </form>
          </CardContent>
        </Card>
      </section>

      <section className="section-spacer">
        <Card>
          <CardHeader>
            <CardTitle>Todos</CardTitle>
            <CardDescription>A summary of what you set out to do today.</CardDescription>
          </CardHeader>
          <CardContent>
            {todos.length ? (
              <div className="todo-table-wrap">
                <div className="todo-header-row">
                  <span className="todo-header-cell todo-header-center">Done</span>
                  <span className="todo-header-cell">Todo description</span>
                  <span className="todo-header-cell todo-header-center">Priority</span>
                  <span className="todo-header-cell">Due date</span>
                  <span className="todo-header-cell todo-header-center">Edit</span>
                  <span className="todo-header-cell todo-header-center">Delete</span>
                </div>

                <div className="todo-list">
                  {todos.map((todo) => (
                    <div className="todo-row" key={todo.id}>
                      <form action={toggleTodoStatusAction} className="todo-cell todo-cell-check">
                        <input type="hidden" name="todo_id" value={todo.id} />
                        <input type="hidden" name="status" value={todo.status === "done" ? "open" : "done"} />
                        <button
                          type="submit"
                          className={`todo-checkbox ${todo.status === "done" ? "checked" : ""}`}
                          aria-label={todo.status === "done" ? "Mark todo as open" : "Mark todo as done"}
                          title={todo.status === "done" ? "Mark as open" : "Mark as done"}
                        >
                          {todo.status === "done" ? "✓" : ""}
                        </button>
                      </form>

                      <div className="todo-cell todo-cell-title">
                        <p className={`todo-title ${todo.status === "done" ? "done" : ""}`}>{todo.title}</p>
                      </div>

                      <div className="todo-cell todo-cell-center">
                        <Badge variant={getPriorityVariant(todo.priority)}>{getPriorityLabel(todo.priority)}</Badge>
                      </div>

                      <div className="todo-cell">
                        <span className="todo-due">{formatDueDate(todo.due_at)}</span>
                      </div>

                      <div className="todo-cell todo-cell-center">
                        <Link href={`/dashboard?edit=${todo.id}`} className="todo-action-link">
                          Edit
                        </Link>
                      </div>

                      <div className="todo-cell todo-cell-center">
                        <form action={deleteTodoAction} className="todo-action-form">
                          <input type="hidden" name="todo_id" value={todo.id} />
                          <Button type="submit" variant="danger" size="sm">
                            Delete
                          </Button>
                        </form>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="muted">No todos yet. Create your first todo above.</p>
            )}
          </CardContent>
        </Card>
      </section>

      <section className="section-spacer">
        <Card>
          <CardHeader>
            <CardTitle>Integrations</CardTitle>
            <CardDescription>Link channels and calendars for automated check-ins.</CardDescription>
          </CardHeader>
          <CardContent className="stack integrations-stack">
            <div className="chip-row">
              {linkedChannels.length ? (
                linkedChannels.map((channel) => (
                  <Badge variant="success" key={channel}>
                    {channel}
                  </Badge>
                ))
              ) : (
                <Badge variant="muted">No active channels</Badge>
              )}
            </div>

            <div className="integration-dropdown-list">
              <details className="integration-dropdown">
                <summary className="integration-summary">
                  <span className="integration-summary-main">
                    <strong>Telegram</strong>
                    <span>Generate a link code and connect your bot.</span>
                  </span>
                  <span className="integration-summary-meta">
                    <Badge variant={linkedChannels.includes("telegram") ? "success" : "muted"}>
                      {linkedChannels.includes("telegram") ? "Active" : "Not linked"}
                    </Badge>
                    <span className="integration-chevron" aria-hidden>
                      ▾
                    </span>
                  </span>
                </summary>
                <div className="integration-dropdown-content">
                  <form action={createTelegramLinkCodeAction} className="integration-actions">
                    <Button type="submit">Generate link code</Button>
                  </form>
                  {linkedChannels.includes("telegram") ? (
                    <form action={disableIntegrationAction} className="integration-secondary-action">
                      <input type="hidden" name="type" value="telegram" />
                      <Button type="submit" variant="danger" size="sm">
                        Disable Telegram
                      </Button>
                    </form>
                  ) : null}
                </div>
              </details>

              <details className="integration-dropdown">
                <summary className="integration-summary">
                  <span className="integration-summary-main">
                    <strong>Discord</strong>
                    <span>Generate a link code and connect your server channel.</span>
                  </span>
                  <span className="integration-summary-meta">
                    <Badge variant={linkedChannels.includes("discord") ? "success" : "muted"}>
                      {linkedChannels.includes("discord") ? "Active" : "Not linked"}
                    </Badge>
                    <span className="integration-chevron" aria-hidden>
                      ▾
                    </span>
                  </span>
                </summary>
                <div className="integration-dropdown-content">
                  <form action={createDiscordLinkCodeAction} className="integration-actions">
                    <Button type="submit">Generate link code</Button>
                  </form>
                  {linkedChannels.includes("discord") ? (
                    <form action={disableIntegrationAction} className="integration-secondary-action">
                      <input type="hidden" name="type" value="discord" />
                      <Button type="submit" variant="danger" size="sm">
                        Disable Discord
                      </Button>
                    </form>
                  ) : null}
                </div>
              </details>

              <details className="integration-dropdown">
                <summary className="integration-summary">
                  <span className="integration-summary-main">
                    <strong>Calendar Providers</strong>
                    <span>Connect external calendars to improve scheduling quality.</span>
                  </span>
                  <span className="integration-summary-meta">
                    <Badge variant={isGoogleConnected || isMicrosoftConnected ? "success" : "muted"}>
                      {isGoogleConnected || isMicrosoftConnected ? "Connected" : "Optional"}
                    </Badge>
                    <span className="integration-chevron" aria-hidden>
                      ▾
                    </span>
                  </span>
                </summary>
                <div className="integration-dropdown-content">
                  <div className="stack">
                    <div className="chip-row">
                      <Badge variant={isGoogleConnected ? "success" : "muted"}>
                        Google: {isGoogleConnected ? "Connected" : "Not linked"}
                      </Badge>
                      <Badge variant={isMicrosoftConnected ? "success" : "muted"}>
                        Microsoft: {isMicrosoftConnected ? "Connected" : "Not linked"}
                      </Badge>
                    </div>
                    {(isGoogleConnected || isMicrosoftConnected) ? (
                      <div className="chip-row">
                        {isGoogleConnected ? (
                          <form action={disconnectCalendarProviderAction}>
                            <input type="hidden" name="provider" value="google" />
                            <Button type="submit" variant="danger" size="sm">
                              Disconnect Google
                            </Button>
                          </form>
                        ) : null}
                        {isMicrosoftConnected ? (
                          <form action={disconnectCalendarProviderAction}>
                            <input type="hidden" name="provider" value="microsoft" />
                            <Button type="submit" variant="danger" size="sm">
                              Disconnect Microsoft
                            </Button>
                          </form>
                        ) : null}
                      </div>
                    ) : null}
                    {isGoogleConnected ? (
                      <Link href="/api/integrations/calendar/google/events" className="btn-link btn-link-secondary">
                        Test Google Event Fetch
                      </Link>
                    ) : null}
                    <div className="chip-row integration-provider-actions">
                      <form action={startGoogleConnectAction}>
                        <Button type="submit" variant="secondary">
                          {isGoogleConnected ? "Reconnect Google" : "Connect Google"}
                        </Button>
                      </form>
                      <form action={startMicrosoftConnectAction}>
                        <Button type="submit" variant="secondary">
                          {isMicrosoftConnected ? "Reconnect Microsoft" : "Connect Microsoft"}
                        </Button>
                      </form>
                    </div>
                  </div>
                </div>
              </details>

              <details className="integration-dropdown">
                <summary className="integration-summary">
                  <span className="integration-summary-main">
                    <strong>Daily Telegram Reminder</strong>
                    <span>AI motivation + today plan reminder at a fixed local time.</span>
                  </span>
                  <span className="integration-summary-meta">
                    <Badge variant={reminderSettings.fixed_telegram_enabled ? "success" : "muted"}>
                      {reminderSettings.fixed_telegram_enabled
                        ? `Daily at ${toLocalTimeInput(reminderSettings.fixed_telegram_time_local)}`
                        : "Disabled"}
                    </Badge>
                    <span className="integration-chevron" aria-hidden>
                      ▾
                    </span>
                  </span>
                </summary>
                <div className="integration-dropdown-content">
                  <form action={updateReminderSettingsAction} className="form-stack">
                    <label className="field">
                      <span className="field-label">Status</span>
                      <Select name="fixed_telegram_enabled" defaultValue={reminderSettings.fixed_telegram_enabled ? "true" : "false"}>
                        <option value="false">Disabled</option>
                        <option value="true">Enabled</option>
                      </Select>
                    </label>
                    <label className="field">
                      <span className="field-label">Send time (local)</span>
                      <Input type="time" name="fixed_telegram_time_local" defaultValue={toLocalTimeInput(reminderSettings.fixed_telegram_time_local)} />
                    </label>
                    <label className="field">
                      <span className="field-label">Message mode</span>
                      <Select name="fixed_telegram_message_mode" defaultValue={reminderSettings.fixed_telegram_message_mode}>
                        <option value="ai_motivation">AI motivation + day plan</option>
                      </Select>
                    </label>
                    <Button type="submit" variant="secondary">
                      Save reminder settings
                    </Button>
                  </form>
                </div>
              </details>
            </div>
          </CardContent>
        </Card>
      </section>

      {selectedTodo ? (
        <div className="todo-modal-backdrop">
          <div className="todo-modal-shell">
            <Card className="todo-modal-card">
              <CardHeader>
                <div className="todo-modal-header">
                  <div>
                    <CardTitle>Edit Todo</CardTitle>
                    <CardDescription>Update description, priority, status, and due date.</CardDescription>
                  </div>
                  <Link href="/dashboard" className="todo-action-link">
                    Close
                  </Link>
                </div>
              </CardHeader>
              <CardContent>
                <form action={updateTodoAction} className="form-stack">
                  <input type="hidden" name="todo_id" value={selectedTodo.id} />
                  <input type="hidden" name="redirect_to" value="/dashboard" />
                  <label className="field">
                    <span className="field-label">Description</span>
                    <Input name="title" defaultValue={selectedTodo.title} required />
                  </label>
                  <label className="field">
                    <span className="field-label">Priority</span>
                    <Select name="priority" defaultValue={String(selectedTodo.priority)}>
                      <option value="1">High</option>
                      <option value="2">Medium</option>
                      <option value="3">Low</option>
                    </Select>
                  </label>
                  <label className="field">
                    <span className="field-label">Status</span>
                    <Select name="status" defaultValue={selectedTodo.status}>
                      <option value="open">open</option>
                      <option value="done">done</option>
                      <option value="archived">archived</option>
                    </Select>
                  </label>
                  <label className="field">
                    <span className="field-label">Due date</span>
                    <Input type="datetime-local" name="due_at" defaultValue={toLocalDateTimeInput(selectedTodo.due_at)} />
                  </label>
                  <div className="todo-modal-actions">
                    <Button type="submit" variant="secondary">
                      Save changes
                    </Button>
                    <Link href="/dashboard" className="btn-link btn-link-secondary">
                      Cancel
                    </Link>
                  </div>
                </form>
              </CardContent>
            </Card>
          </div>
        </div>
      ) : null}
    </main>
  );
}
