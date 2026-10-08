"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";

export function OnlineBanner() {
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    const sync = () => setOffline(!navigator.onLine);
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);
  if (!offline) return null;
  return (
    <p className="banner" role="status">
      You&apos;re offline. What&apos;s already here will stay. Sending can wait.
    </p>
  );
}

export function RefreshOnFocus() {
  const pathname = usePathname();
  const router = useRouter();
  useEffect(() => {
    let last = 0;
    const tick = () => {
      if (document.visibilityState !== "visible") return;
      const now = Date.now();
      if (now - last < 8000) return;
      last = now;
      if (pathname === "/home" || pathname === "/garden") router.refresh();
    };
    const id = window.setInterval(tick, 45000);
    window.addEventListener("focus", tick);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("focus", tick);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [pathname, router]);
  return null;
}

export function Nav() {
  const pathname = usePathname();
  const items = [
    { href: "/home", label: "Garden" },
    { href: "/send", label: "Give" },
    { href: "/garden", label: "Path" },
  ];
  return (
    <nav className="nav" aria-label="Primary">
      {items.map((item) => (
        <Link key={item.href} href={item.href} aria-current={pathname === item.href ? "page" : undefined}>
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
