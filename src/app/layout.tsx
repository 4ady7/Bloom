import type { Metadata, Viewport } from "next";
import { Fraunces, Outfit } from "next/font/google";
import { OnlineBanner, RefreshOnFocus } from "@/components/Chrome";
import "./globals.css";

const serif = Fraunces({ subsets: ["latin"], variable: "--font-serif", display: "swap" });
const sans = Outfit({ subsets: ["latin"], variable: "--font-sans", display: "swap" });

export const metadata: Metadata = {
  title: "Bloom",
  description: "Little things, for no reason.",
  applicationName: "Bloom",
  robots: { index: false, follow: false },
  manifest: "/manifest.webmanifest",
  icons: { icon: "/favicon.svg" },
};

export const viewport: Viewport = {
  themeColor: "#f3eee6",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${serif.variable} ${sans.variable}`}>
      <body>
        <a className="skip" href="#content">
          Skip to content
        </a>
        <OnlineBanner />
        <RefreshOnFocus />
        {children}
        <noscript>
          <p className="banner">Bloom uses a little JavaScript for opening and leaving things. The words themselves stay plain.</p>
        </noscript>
      </body>
    </html>
  );
}
