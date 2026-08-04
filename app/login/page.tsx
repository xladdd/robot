"use client";

import { FormEvent, useState } from "react";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);

  async function signIn(event: FormEvent) {
    event.preventDefault();
    setWorking(true);
    setError("");
    try {
      const response = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, password }) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "Could not sign in.");
      const requested = new URLSearchParams(window.location.search).get("returnTo") || "/";
      window.location.href = requested.startsWith("/") && !requested.startsWith("//") ? requested : "/";
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not sign in.");
      setWorking(false);
    }
  }

  return (
    <main className="login-screen">
      <form className="login-panel" onSubmit={signIn}>
        <span className="login-mark" aria-hidden="true">{Array.from({ length: 9 }, (_, index) => <i key={index} />)}</span>
        <div className="login-kicker">TAKTIK / ACCESS</div>
        <h1>AUTOMAT</h1>
        <label>USERNAME<input autoComplete="username" autoFocus value={username} onChange={(event) => setUsername(event.target.value)} /></label>
        <label>PASSWORD<input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
        {error && <p role="alert">{error}</p>}
        <button disabled={working || !username || !password}>{working ? "CONNECTING…" : "ENTER"}<span>→</span></button>
        <small>SESSION RESETS AT MIDNIGHT / PRAGUE</small>
      </form>
    </main>
  );
}
