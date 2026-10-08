"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { PublicUser } from "@/domain/types";
import { ApiError, api } from "@/lib/api";

export function SettingsForm({ user, partnerName }: { user: PublicUser; partnerName: string | null }) {
  const router = useRouter();
  const [name, setName] = useState(user.displayName);
  const [timezone, setTimezone] = useState(user.timezone);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [push, setPush] = useState<"unknown" | "off" | "ready" | "on">("unknown");
  const [leaveSure, setLeaveSure] = useState(false);
  const [deleteSure, setDeleteSure] = useState(false);

  useEffect(() => {
    api<{ enabled: boolean }>("/api/push")
      .then((config) => setPush(config.enabled ? "ready" : "off"))
      .catch(() => setPush("off"));
  }, []);

  async function saveProfile(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    try {
      await api("/api/account", { method: "PATCH", body: { displayName: name, timezone } });
      setMessage("Saved.");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "That didn't save.");
    }
  }

  async function savePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setError(null);
    setMessage(null);
    try {
      await api("/api/auth/password", {
        body: {
          currentPassword: String(form.get("current") ?? ""),
          newPassword: String(form.get("next") ?? ""),
        },
      });
      event.currentTarget.reset();
      setMessage("Password changed. Other sessions were signed out.");
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "That password didn't change.");
    }
  }

  async function enablePush() {
    setError(null);
    try {
      const config = await api<{ enabled: boolean; publicKey: string | null }>("/api/push");
      if (!config.enabled || !config.publicKey) {
        setPush("off");
        return;
      }
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setError("You can leave notifications off. Bloom will keep things here.");
        return;
      }
      const registration = await navigator.serviceWorker.register("/sw.js");
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(config.publicKey),
      });
      const json = subscription.toJSON();
      await api("/api/push", { body: json });
      setPush("on");
      setMessage("We'll tap once, quietly, when something is waiting.");
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Notifications stayed off.");
    }
  }

  return (
    <main className="plain-page">
      <h2>You</h2>
      {message ? <p role="status">{message}</p> : null}
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
      <form className="form" method="post" onSubmit={saveProfile}>
        <label className="field">
          <span>Your name</span>
          <input value={name} maxLength={40} onChange={(event) => setName(event.target.value)} />
        </label>
        <label className="field">
          <span>Timezone</span>
          <input value={timezone} onChange={(event) => setTimezone(event.target.value)} />
          <span className="hint">An IANA name, like Europe/London or America/New_York. Scheduling uses this, not the server clock.</span>
        </label>
        <button className="btn" type="submit">
          Save
        </button>
      </form>
      <form className="form" method="post" onSubmit={savePassword}>
        <h3 className="serif">Password</h3>
        <label className="field">
          <span>Current password</span>
          <input name="current" type="password" autoComplete="current-password" required />
        </label>
        <label className="field">
          <span>New password</span>
          <input name="next" type="password" autoComplete="new-password" minLength={10} required />
        </label>
        <button className="btn-ghost" type="submit">
          Change password
        </button>
      </form>
      <section className="stack">
        <h3 className="serif">A quiet tap</h3>
        {push === "off" ? (
          <p className="hint">On this server, Bloom keeps things inside the app. Nothing is sent to your lock screen.</p>
        ) : null}
        {push === "ready" ? (
          <button className="btn-ghost" type="button" onClick={enablePush}>
            Tell me when something is waiting
          </button>
        ) : null}
        {push === "on" ? <p>We&apos;ll only say that something is waiting. Never what it is.</p> : null}
      </section>
      <button className="text-btn" type="button" onClick={() => api("/api/auth/sign-out", { method: "POST", body: {} }).then(() => window.location.assign("/"))}>
        Sign out
      </button>
      {partnerName ? (
        <section className="stack">
          {!leaveSure ? (
            <button className="text-btn" type="button" onClick={() => setLeaveSure(true)}>
              Leave this garden
            </button>
          ) : (
            <>
              <p>Leaving closes the garden for both of you. What was shared stays stored, but neither of you can open it here.</p>
              <button
                className="btn-ghost"
                type="button"
                onClick={async () => {
                  await api("/api/relationship/leave", { method: "POST", body: {} });
                  window.location.assign("/pair");
                }}
              >
                Yes, leave
              </button>
            </>
          )}
        </section>
      ) : null}
      <section className="stack">
        {!deleteSure ? (
          <button className="text-btn" type="button" onClick={() => setDeleteSure(true)}>
            Delete your account
          </button>
        ) : (
          <form
            className="form"
            method="post"
            onSubmit={async (event) => {
              event.preventDefault();
              const password = String(new FormData(event.currentTarget).get("password") ?? "");
              try {
                await api("/api/account", { method: "DELETE", body: { password } });
                window.location.assign("/");
              } catch (caught) {
                setError(caught instanceof ApiError ? caught.message : "The account is still here.");
              }
            }}
          >
            <p>This signs you out and closes the garden. Type your password to confirm.</p>
            <label className="field">
              <span>Password</span>
              <input name="password" type="password" autoComplete="current-password" required />
            </label>
            <button className="btn-ghost" type="submit">
              Delete account
            </button>
          </form>
        )}
      </section>
    </main>
  );
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let index = 0; index < raw.length; index += 1) output[index] = raw.charCodeAt(index);
  return output;
}
