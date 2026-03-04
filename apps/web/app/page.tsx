import Link from "next/link";
import { Spotlight } from "@/components/effects/spotlight";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function HomePage() {
  return (
    <main className="page-shell">
      <Spotlight />

      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">
            <Badge variant="accent">Coach</Badge>
            Personal execution system
          </p>
          <h1 className="hero-title">Ship your goals with calm, daily momentum.</h1>
          <p className="hero-subtitle">
            Coach turns your plans into actionable check-ins. Track goals, manage tasks, and get nudges across channels you already use.
          </p>
          <div className="hero-actions">
            <Link href="/signin" className="btn-link btn-link-primary">
              Start in 30 seconds
            </Link>
            <Link href="/signin" className="btn-link btn-link-secondary">
              Try local demo login
            </Link>
          </div>

          <div className="hero-grid">
            <div className="metric">
              <strong>1 dashboard</strong>
              <span>Goals, tasks, integrations</span>
            </div>
            <div className="metric">
              <strong>3 channels</strong>
              <span>Web, Telegram, Discord</span>
            </div>
            <div className="metric">
              <strong>5-minute</strong>
              <span>Scheduler cadence</span>
            </div>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>How it works</CardTitle>
          </CardHeader>
          <CardContent className="feature-list">
            <div className="feature">
              <span>Create focused goals</span>
              <Badge variant="muted">Step 1</Badge>
            </div>
            <div className="feature">
              <span>Capture todos with deadlines</span>
              <Badge variant="muted">Step 2</Badge>
            </div>
            <div className="feature">
              <span>Get proactive check-ins</span>
              <Badge variant="muted">Step 3</Badge>
            </div>
            <p className="footer-note">Built for local-first development and fast iteration.</p>
          </CardContent>
        </Card>
      </section>

      <section className="grid-3">
        <Card>
          <CardHeader>
            <CardTitle>Goal tracking</CardTitle>
          </CardHeader>
          <CardContent>
            Break outcomes into active priorities and keep them visible every day.
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Task execution</CardTitle>
          </CardHeader>
          <CardContent>
            Manage priorities, due dates, and status updates from one interface.
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Coach automation</CardTitle>
          </CardHeader>
          <CardContent>
            Scheduler triggers smart nudges so you keep progressing without overthinking.
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
