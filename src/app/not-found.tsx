import Link from "next/link";

export default function NotFound() {
  return (
    <main className="plain-page" id="content">
      <h2>This isn&apos;t here.</h2>
      <Link className="btn" href="/home">
        Back to the garden
      </Link>
    </main>
  );
}
