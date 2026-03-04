"use client";

import { FormEvent, useState } from "react";

export default function SignInPage() {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [status, setStatus] = useState<string>("");

  async function requestCode(event: FormEvent) {
    event.preventDefault();
    const response = await fetch("/api/auth/request-magic-link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email })
    });
    const data = await response.json();
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
    setStatus(data.error ?? "Verification failed");
  }

  return (
    <main>
      <div className="card">
        <h1>Sign in</h1>
        <p>Request a one-time code. In production, this is delivered by email.</p>
        <form onSubmit={requestCode} className="grid">
          <input type="email" placeholder="you@example.com" value={email} onChange={(event) => setEmail(event.target.value)} required />
          <button type="submit">Request code</button>
        </form>
      </div>

      <div className="card">
        <h2>Verify code</h2>
        <form onSubmit={verifyCode} className="grid">
          <input placeholder="ABC123" value={code} onChange={(event) => setCode(event.target.value)} required />
          <button type="submit">Verify</button>
        </form>
        {status ? <p>{status}</p> : null}
      </div>
    </main>
  );
}
