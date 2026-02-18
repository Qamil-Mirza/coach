import Link from "next/link";

export default function HomePage() {
  return (
    <main>
      <section className="card">
        <h1>Coach</h1>
        <p>Track your goals, finish tasks, and get proactive AI check-ins on Telegram or Discord.</p>
        <Link href="/signin">
          <button>Sign in</button>
        </Link>
      </section>
    </main>
  );
}
