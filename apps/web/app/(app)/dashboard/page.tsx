import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getUserBySessionToken } from "@coach/db";

async function getSessionUser() {
  const cookieStore = await cookies();
  const token = cookieStore.get("coach_session")?.value;
  if (!token) {
    return null;
  }
  return getUserBySessionToken(token);
}

export default async function DashboardPage() {
  const user = await getSessionUser();
  if (!user) {
    redirect("/signin");
  }

  return (
    <main>
      <div className="card">
        <h1>Dashboard</h1>
        <p>{user.email}</p>
        <p>Use the API routes to create todos/goals and connect integrations.</p>
      </div>
      <div className="grid two">
        <div className="card">
          <h2>Core APIs</h2>
          <p>`/api/todos`, `/api/goals`, `/api/me`</p>
        </div>
        <div className="card">
          <h2>Coach APIs</h2>
          <p>`/api/scheduler/run`, `/api/checkins/dispatch`, webhooks</p>
        </div>
      </div>
    </main>
  );
}
