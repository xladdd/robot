"use client";

import { FormEvent, useState } from "react";

export default function LoginPage() {
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const submittedUsername = String(formData.get("username") ?? "").trim();
    const submittedPassword = String(formData.get("password") ?? "");
    setWorking(true);
    setError("");
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: submittedUsername,
          password: submittedPassword,
        }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error || "Could not sign in.");
      const requested =
        new URLSearchParams(window.location.search).get("returnTo") || "/";
      window.location.href =
        requested.startsWith("/") && !requested.startsWith("//")
          ? requested
          : "/";
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not sign in.");
      setWorking(false);
    }
  }

  return (
    <main className="login-screen">
      <form className="login-panel" method="post" onSubmit={signIn}>
        <span className="login-mark" aria-hidden="true">
          {Array.from({ length: 9 }, (_, index) => (
            <i key={index} />
          ))}
        </span>
        <div className="login-kicker">TAKTIK / ACCESS</div>
        <h1>ROBOT</h1>
        <label>
          USERNAME
          <input name="username" autoComplete="username" autoFocus required />
        </label>
        <label>
          PASSWORD
          <input
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
        </label>
        {error && <p role="alert">{error}</p>}
        <button disabled={working}>
          {working ? "CONNECTING…" : "ENTER"}
          <span>→</span>
        </button>
        <small>SESSION RESETS AT MIDNIGHT / PRAGUE</small>
      </form>
    </main>
  );
}
