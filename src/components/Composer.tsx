"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { contentReady, emptyContent } from "@/domain/content";
import { FLOWER_VARIETIES, PETAL_HINT, PETAL_LABEL, SURPRISE_KINDS, type PetalContent, type PetalType, type PublicPetal } from "@/domain/types";
import { formatWhen } from "@/domain/time";
import { ApiError, api } from "@/lib/api";
import { uploadMedia } from "@/lib/media";
import { PetalView } from "./PetalView";

type Step = "choose" | "compose" | "preview" | "done" | "uncertain";

export function Composer({ timezone, partnerName }: { timezone: string; partnerName: string }) {
  const [step, setStep] = useState<Step>("choose");
  const [type, setType] = useState<PetalType>("note");
  const [content, setContent] = useState<PetalContent>(emptyContent("note"));
  const [random, setRandom] = useState(false);
  const [later, setLater] = useState(false);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [fade, setFade] = useState<1 | 3 | 7 | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [result, setResult] = useState<PublicPetal | null>(null);
  const attempt = useRef<{ key: string; body: string } | null>(null);

  function choose(next: PetalType) {
    setType(next);
    setContent(emptyContent(next));
    setRandom(false);
    setError(null);
    setStep("compose");
  }

  async function surprise() {
    setSuggesting(true);
    setError(null);
    try {
      const suggestion = await api<{ type: PetalType; content: PetalContent }>(
        `/api/petals/suggest${type && random ? `?avoid=${type}` : ""}`,
      );
      setType(suggestion.type);
      setContent(suggestion.content);
      setRandom(true);
      setStep("compose");
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Nothing came to mind. Try again, or choose yourself.");
    } finally {
      setSuggesting(false);
    }
  }

  function payload() {
    let schedule: { year: number; month: number; day: number; hour: number; minute: number } | null = null;
    if (later) {
      const [year, month, day] = date.split("-").map(Number);
      const [hour, minute] = time.split(":").map(Number);
      if (!year || !month || !day || Number.isNaN(hour) || Number.isNaN(minute)) {
        throw new ApiError(400, "INVALID_TIME", "Choose a date and a time.", { schedule: "Choose a date and a time." });
      }
      schedule = { year, month, day, hour, minute };
    }
    return { type, content, schedule, expiresInDays: fade, random };
  }

  function goPreview() {
    setError(null);
    if (later && (!date || !time)) {
      setError("Choose when it should arrive.");
      return;
    }
    if (!contentReady(type, content)) {
      setError("It needs a little more before they can open it.");
      return;
    }
    setStep("preview");
  }

  async function send() {
    setPending(true);
    setError(null);
    let body: ReturnType<typeof payload>;
    try {
      body = payload();
    } catch (caught) {
      setPending(false);
      setError(caught instanceof ApiError ? caught.message : "Check the time.");
      setStep("compose");
      return;
    }
    const serialized = JSON.stringify(body);
    if (!attempt.current || attempt.current.body !== serialized) {
      attempt.current = { key: crypto.randomUUID(), body: serialized };
    }
    try {
      const response = await api<{ petal: PublicPetal }>("/api/petals", {
        method: "POST",
        body,
        idempotencyKey: attempt.current.key,
      });
      attempt.current = null;
      setResult(response.petal);
      setStep("done");
    } catch (caught) {
      if (caught instanceof ApiError && (caught.status === 0 || caught.status >= 500)) {
        setStep("uncertain");
        setError(caught.message);
      } else if (caught instanceof ApiError) {
        setError(caught.message);
        if (caught.code === "IDEMPOTENCY_CONFLICT") attempt.current = null;
        else setStep("compose");
      } else {
        setStep("uncertain");
        setError("We didn't get a confirmation.");
      }
    } finally {
      setPending(false);
    }
  }

  const previewPetal: PublicPetal | null = contentReady(type, content)
    ? {
        id: "preview",
        type,
        content,
        metadata: { source: random ? "random" : "chosen" },
        status: "sealed",
        fromYou: true,
        senderName: "You",
        createdAt: Date.now(),
        updatedAt: Date.now(),
        scheduledFor: null,
        openedAt: null,
        expiresAt: null,
        response: null,
      }
    : null;

  return (
    <main className="plain-page">
      <Link href="/home" className="quiet-link">
        Back to the garden
      </Link>
      {step === "choose" ? (
        <section className="stack">
          <h2>Give {partnerName} something.</h2>
          <p className="hint">Little things, for no reason.</p>
          {error ? (
            <p className="error" role="alert">
              {error}
            </p>
          ) : null}
          <button className="btn" type="button" onClick={surprise} disabled={suggesting}>
            {suggesting ? "Thinking…" : "Surprise them"}
          </button>
          <div className="choice-list">
            {(Object.keys(PETAL_LABEL) as PetalType[]).map((item) => (
              <button key={item} className="choice" type="button" onClick={() => choose(item)}>
                <strong>{PETAL_LABEL[item]}</strong>
                <span>{PETAL_HINT[item]}</span>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {step === "compose" ? (
        <section className="stack">
          <h2>{random ? `This felt right: ${PETAL_LABEL[type].toLowerCase()}` : PETAL_LABEL[type]}</h2>
          {random ? (
            <button className="text-btn" type="button" onClick={surprise}>
              Choose again
            </button>
          ) : (
            <button className="text-btn" type="button" onClick={() => setStep("choose")}>
              Choose something else
            </button>
          )}
          {error ? (
            <p className="error" role="alert">
              {error}
            </p>
          ) : null}
          <Editor type={type} content={content} onChange={setContent} />
          <label className="checks">
            <input type="checkbox" checked={later} onChange={(event) => setLater(event.target.checked)} />
            Let it arrive later
          </label>
          {later ? (
            <div className="form">
              <label className="field">
                <span>Date</span>
                <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
              </label>
              <label className="field">
                <span>Time</span>
                <input type="time" value={time} onChange={(event) => setTime(event.target.value)} />
              </label>
              <p className="hint">This uses your Bloom time, {timezone}.</p>
            </div>
          ) : null}
          <fieldset>
            <legend>If they don&apos;t open it</legend>
            <label className="checks">
              <input type="radio" name="fade" checked={fade === null} onChange={() => setFade(null)} /> It can wait
            </label>
            <label className="checks">
              <input type="radio" name="fade" checked={fade === 1} onChange={() => setFade(1)} /> Fade after a day
            </label>
            <label className="checks">
              <input type="radio" name="fade" checked={fade === 3} onChange={() => setFade(3)} /> Fade after three days
            </label>
            <label className="checks">
              <input type="radio" name="fade" checked={fade === 7} onChange={() => setFade(7)} /> Fade after a week
            </label>
          </fieldset>
          <button className="btn" type="button" onClick={goPreview}>
            See it first
          </button>
        </section>
      ) : null}

      {step === "preview" && previewPetal ? (
        <section className="stack">
          <p className="section-label">What they&apos;ll open</p>
          <div className="preview-frame">
            <PetalView petal={previewPetal} preview />
          </div>
          {later ? <p className="hint">It will wait until the time you chose, in {timezone}.</p> : null}
          {error ? (
            <p className="error" role="alert">
              {error}
            </p>
          ) : null}
          <button className="btn" type="button" onClick={send} disabled={pending} aria-busy={pending}>
            {pending ? "Leaving it…" : later ? "Let it arrive then" : "Leave it with them"}
          </button>
          <button className="text-btn" type="button" onClick={() => setStep("compose")} disabled={pending}>
            Change it
          </button>
        </section>
      ) : null}

      {step === "done" && result ? (
        <section className="stack">
          <h2>{result.status === "scheduled" && result.scheduledFor ? "It will arrive then." : "It's with them."}</h2>
          <p>
            {result.status === "scheduled" && result.scheduledFor
              ? `Arrives ${formatWhen(result.scheduledFor, timezone)}.`
              : `${partnerName} can open it whenever they like. There's nothing they need to send back.`}
          </p>
          <Link className="btn" href="/home">
            Back to the garden
          </Link>
        </section>
      ) : null}

      {step === "uncertain" ? (
        <section className="stack">
          <h2>We didn&apos;t get a confirmation.</h2>
          <p>It may still have been left for them. Trying again uses the same attempt, so it won&apos;t be sent twice.</p>
          {error ? (
            <p className="error" role="alert">
              {error}
            </p>
          ) : null}
          <button className="btn" type="button" onClick={send} disabled={pending}>
            {pending ? "Trying…" : "Try again"}
          </button>
          <Link className="quiet-link" href="/home">
            Check the garden
          </Link>
        </section>
      ) : null}
    </main>
  );
}

function Editor({ type, content, onChange }: { type: PetalType; content: PetalContent; onChange: (content: PetalContent) => void }) {
  if (type === "note" && "text" in content) {
    return (
      <label className="field">
        <span>Your note</span>
        <textarea value={content.text} maxLength={2000} placeholder="A small thing, in your words" onChange={(event) => onChange({ text: event.target.value })} />
      </label>
    );
  }
  if (type === "flower" && "variety" in content) {
    return (
      <div className="form">
        <label className="field">
          <span>Flower</span>
          <select value={content.variety} onChange={(event) => onChange({ ...content, variety: event.target.value as typeof content.variety })}>
            {FLOWER_VARIETIES.map((variety) => (
              <option key={variety} value={variety}>
                {variety}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>A line inside, if you want</span>
          <textarea value={content.note} maxLength={280} onChange={(event) => onChange({ ...content, note: event.target.value })} />
        </label>
      </div>
    );
  }
  if (type === "memory" && "title" in content && "place" in content) {
    return (
      <div className="form">
        <label className="field">
          <span>What you remember</span>
          <input value={content.title} maxLength={120} onChange={(event) => onChange({ ...content, title: event.target.value })} />
        </label>
        <label className="field">
          <span>Date</span>
          <input type="date" value={content.date} onChange={(event) => onChange({ ...content, date: event.target.value })} />
        </label>
        <label className="field">
          <span>Place</span>
          <input value={content.place} maxLength={120} onChange={(event) => onChange({ ...content, place: event.target.value })} />
        </label>
        <label className="field">
          <span>A few words</span>
          <textarea value={content.text} maxLength={2000} onChange={(event) => onChange({ ...content, text: event.target.value })} />
        </label>
        <MediaField
          label="A photo, if you have one"
          accept="image/*"
          onId={(mediaId) => onChange({ ...content, mediaId })}
        />
      </div>
    );
  }
  if (type === "photo" && "caption" in content && !("title" in content)) {
    return (
      <div className="form">
        <MediaField label="Photo" accept="image/*" required onId={(mediaId) => onChange({ ...content, mediaId: mediaId ?? "" })} />
        <label className="field">
          <span>Caption</span>
          <textarea value={content.caption} maxLength={280} onChange={(event) => onChange({ ...content, caption: event.target.value })} />
        </label>
      </div>
    );
  }
  if (type === "song" && "artist" in content) {
    return (
      <div className="form">
        <label className="field">
          <span>Song</span>
          <input value={content.title} maxLength={160} onChange={(event) => onChange({ ...content, title: event.target.value })} />
        </label>
        <label className="field">
          <span>Artist</span>
          <input value={content.artist} maxLength={160} onChange={(event) => onChange({ ...content, artist: event.target.value })} />
        </label>
        <label className="field">
          <span>A link, if you want</span>
          <input value={content.url} maxLength={500} placeholder="https://" onChange={(event) => onChange({ ...content, url: event.target.value })} />
        </label>
        <label className="field">
          <span>Why this one</span>
          <textarea value={content.note} maxLength={500} onChange={(event) => onChange({ ...content, note: event.target.value })} />
        </label>
        <MediaField label="Or a short recording" accept="audio/*" onId={(mediaId) => onChange({ ...content, mediaId })} />
      </div>
    );
  }
  if (type === "question" && "prompt" in content) {
    return (
      <div className="form">
        <label className="field">
          <span>Question</span>
          <textarea value={content.prompt} maxLength={280} onChange={(event) => onChange({ ...content, prompt: event.target.value })} />
        </label>
        <label className="field">
          <span>A note beside it</span>
          <textarea value={content.senderNote} maxLength={500} onChange={(event) => onChange({ ...content, senderNote: event.target.value })} />
        </label>
      </div>
    );
  }
  if (type === "surprise" && "kind" in content && "message" in content) {
    return (
      <div className="form">
        <label className="field">
          <span>How it opens</span>
          <select value={content.kind} onChange={(event) => onChange({ ...content, kind: event.target.value as typeof content.kind })}>
            {SURPRISE_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {kind === "hold" ? "Hold a bud" : kind === "stars" ? "Touch the stars" : "Break a seal"}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>What they find</span>
          <textarea value={content.message} maxLength={1000} onChange={(event) => onChange({ ...content, message: event.target.value })} />
        </label>
      </div>
    );
  }
  return null;
}

function MediaField({
  label,
  accept,
  required = false,
  onId,
}: {
  label: string;
  accept: string;
  required?: boolean;
  onId: (id: string | null) => void;
}) {
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  return (
    <label className="field">
      <span>
        {label}
        {required ? "" : " (optional)"}
      </span>
      <input
        type="file"
        accept={accept}
        onChange={async (event) => {
          const file = event.target.files?.[0];
          if (!file) return;
          setError(null);
          setStatus("Adding it…");
          try {
            const saved = await uploadMedia(file);
            onId(saved.id);
            setStatus("It's attached.");
          } catch (caught) {
            setStatus(null);
            setError(caught instanceof Error ? caught.message : "That file could not be kept.");
          }
        }}
      />
      {status ? <span className="hint">{status}</span> : null}
      {error ? <span className="error">{error}</span> : null}
    </label>
  );
}
