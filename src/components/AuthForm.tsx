"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { browserTimeZone } from "@/domain/time";
import { ApiError, api } from "@/lib/api";

export function AuthForm({ mode }: { mode: "sign-in" | "sign-up" }) {
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  const signUp = mode === "sign-up";

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError(null);
    setFields({});
    try {
      if (signUp) {
        await api("/api/auth/sign-up", {
          body: {
            displayName: String(form.get("displayName") ?? ""),
            email: String(form.get("email") ?? ""),
            password: String(form.get("password") ?? ""),
            timezone: browserTimeZone(),
          },
        });
        window.location.assign("/pair");
      } else {
        await api("/api/auth/sign-in", {
          body: {
            email: String(form.get("email") ?? ""),
            password: String(form.get("password") ?? ""),
          },
        });
        window.location.assign("/home");
      }
    } catch (caught) {
      setPending(false);
      if (caught instanceof ApiError) {
        setError(caught.message);
        setFields(caught.fields ?? {});
      } else {
        setError("Something went wrong. Please try again.");
      }
    }
  }

  return (
    <main className="auth-screen">
      <Link href="/" className="word">
        Bloom
      </Link>
      <h2>{signUp ? "A place for two." : "Welcome back."}</h2>
      <form className="form" method="post" onSubmit={onSubmit} noValidate>
        {error ? (
          <p className="error" role="alert">
            {error}
          </p>
        ) : null}
        {signUp ? (
          <label className="field">
            <span>What should they call you?</span>
            <input name="displayName" type="text" autoComplete="nickname" required maxLength={40} aria-invalid={Boolean(fields.displayName)} />
            {fields.displayName ? <span className="error">{fields.displayName}</span> : null}
          </label>
        ) : null}
        <label className="field">
          <span>Email</span>
          <input name="email" type="email" autoComplete="email" required maxLength={254} aria-invalid={Boolean(fields.email)} />
          {fields.email ? <span className="error">{fields.email}</span> : null}
        </label>
        <label className="field">
          <span>Password</span>
          <input
            name="password"
            type="password"
            autoComplete={signUp ? "new-password" : "current-password"}
            required
            minLength={10}
            maxLength={200}
            aria-invalid={Boolean(fields.password)}
          />
          {fields.password ? <span className="error">{fields.password}</span> : <span className="hint">At least 10 characters.</span>}
        </label>
        <button className="btn" type="submit" disabled={pending}>
          {pending ? "One moment…" : signUp ? "Create your place" : "Come in"}
        </button>
      </form>
      {signUp ? (
        <Link href="/sign-in">I already have a place</Link>
      ) : (
        <Link href="/sign-up">Begin</Link>
      )}
    </main>
  );
}
