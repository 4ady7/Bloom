"use client";

import { FormEvent, useRef, useState } from "react";
import { ApiError, api } from "@/lib/api";

export function AnswerClient({ petalId }: { petalId: string }) {
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const key = useRef(crypto.randomUUID());

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      await api(`/api/petals/${petalId}/answer`, {
        method: "POST",
        body: { body },
        idempotencyKey: key.current,
      });
      window.location.assign(`/petal/${petalId}`);
    } catch (caught) {
      setPending(false);
      setError(caught instanceof ApiError ? caught.message : "That didn't go through. You can try again.");
    }
  }

  return (
    <form className="form" method="post" onSubmit={onSubmit}>
      <label className="field">
        <span>If you feel like answering</span>
        <textarea value={body} maxLength={1000} onChange={(event) => setBody(event.target.value)} />
      </label>
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
      <button className="btn" type="submit" disabled={pending || body.trim().length === 0}>
        {pending ? "Leaving it…" : "Leave an answer"}
      </button>
    </form>
  );
}
