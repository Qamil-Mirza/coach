"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { Spotlight } from "@/components/effects/spotlight";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export default function SignInPage() {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [status, setStatus] = useState<string>("");
  const [statusVariant, setStatusVariant] = useState<"success" | "error">("success");
  const [debugCode, setDebugCode] = useState<string>("");

  async function requestCode(event: FormEvent) {
    event.preventDefault();
    const response = await fetch("/api/auth/request-magic-link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email })
    });
    const data = await response.json();
    if (!response.ok) {
      setDebugCode("");
      setStatusVariant("error");
      setStatus(data.error ?? "Failed to request code");
      return;
    }
    setDebugCode(typeof data.debug_code === "string" ? data.debug_code : "");
    setStatusVariant("success");
    setStatus(data.message ?? "Code requested");
  }

  async function verifyCode(event: FormEvent) {
    event.preventDefault();
    const response = await fetch("/api/auth/verify-otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, code })
    });
    if (response.ok) {
      window.location.href = "/dashboard";
      return;
    }
    const data = await response.json();
    setStatusVariant("error");
    setStatus(data.error ?? "Verification failed");
  }

  return (
    <main className="page-shell">
      <Spotlight />

      <div className="auth-grid">
        <Card className="auth-brand">
          <CardHeader>
            <Badge variant="accent">Coach Access</Badge>
            <h1>Welcome back.</h1>
            <p>Use a one-time code to sign in. In local development, code delivery is shown directly in the interface.</p>
          </CardHeader>
          <CardContent className="stack">
            <div className="feature">
              <span>No passwords to remember</span>
              <Badge variant="muted">OTP</Badge>
            </div>
            <div className="feature">
              <span>Session cookie auth</span>
              <Badge variant="muted">Secure</Badge>
            </div>
            <div className="feature">
              <span>Fast local testing flow</span>
              <Badge variant="muted">Dev</Badge>
            </div>
            <Link href="/" className="btn-link btn-link-secondary">
              Back to homepage
            </Link>
          </CardContent>
        </Card>

        <Card className="auth-panel">
          <CardHeader>
            <CardTitle>Sign in</CardTitle>
          </CardHeader>
          <CardContent className="stack">
            <form onSubmit={requestCode} className="form-stack">
              <label className="field">
                <span className="field-label">Email</span>
                <Input type="email" placeholder="you@example.com" value={email} onChange={(event) => setEmail(event.target.value)} required />
              </label>
              <Button type="submit">Request code</Button>
            </form>

            {debugCode ? (
              <Alert variant="info">
                Local dev code: <strong>{debugCode}</strong>
              </Alert>
            ) : null}

            <form onSubmit={verifyCode} className="form-stack">
              <label className="field">
                <span className="field-label">Verification code</span>
                <Input placeholder="ABC123" value={code} onChange={(event) => setCode(event.target.value)} required />
              </label>
              <Button type="submit" variant="secondary">
                Verify and continue
              </Button>
            </form>

            {status ? <Alert variant={statusVariant === "success" ? "success" : "error"}>{status}</Alert> : null}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
