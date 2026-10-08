"use client";

import { FormEvent, useState } from "react";
import { ApiError, api } from "@/lib/api";

export function Pairing({ pending }: { pending: boolean }) {
  const [code, setCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState(false);
  const [copied, setCopied] = useState(false);

  async function makeCode() {
    setPendingAction(true);
    setError(null);
    try {
      const result = await api<{ invite: { code: string } }>("/api/relationship/invite", { method: "POST", body: {} });
      setCode(result.invite.code);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "The code could not be made.");
    } finally {
      setPendingAction(false);
    }
  }

  async function join(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPendingAction(true);
    setError(null);
    try {
      await api("/api/relationship/join", { body: { code: String(form.get("code") ?? "") } });
      window.location.assign("/home");
    } catch (caught) {
      setPendingAction(false);
      setError(caught instanceof ApiError ? caught.message : "That didn't work.");
    }
  }

  async function copy() {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <main className="plain-page">
      <p className="word">Bloom</p>
      <h2>Bloom is for two.</h2>
      <p className="lede">Invite one person. When they join, this becomes a private garden. Nobody else can see it.</p>
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
      {code ? (
        <div className="paper-note stack">
          <p className="section-label">Their code</p>
          <p className="note-text" aria-label="Invite code">
            {code}
          </p>
          <p className="hint">Show them this once, somewhere private. If you leave this page, make a new one. The old one stops working when you do.</p>
          <button className="btn-ghost" type="button" onClick={copy}>
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      ) : (
        <button className="btn" type="button" onClick={makeCode} disabled={pendingAction}>
          {pending ? "Make a fresh code" : "Make a code"}
        </button>
      )}
      {code ? (
        <button className="text-btn" type="button" onClick={makeCode} disabled={pendingAction}>
          Make a fresh code
        </button>
      ) : null}
      <form className="form" method="post" onSubmit={join}>
        <label className="field">
          <span>Their code</span>
          <input name="code" type="text" autoCapitalize="characters" autoComplete="one-time-code" placeholder="ABCD-EFGH" />
        </label>
        <button className="btn" type="submit" disabled={pendingAction}>
          Join them
        </button>
      </form>
    </main>
  );
}
