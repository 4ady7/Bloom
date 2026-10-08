"use client";

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="plain-page" id="content">
      <h2>Something snagged.</h2>
      <p>The garden is still there. Try once more.</p>
      <button className="btn" type="button" onClick={() => reset()}>
        Try again
      </button>
    </main>
  );
}
