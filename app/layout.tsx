import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";

const siteUrl = new URL("https://instructlint.vercel.app");
const description =
  "Audit repository AI instructions against implementation reality, preview public GitHub drift for free, and unlock evidence plus suggested patches for $1 USDC.";

export const metadata: Metadata = {
  metadataBase: siteUrl,
  title: {
    default: "InstructLint | Agent instruction drift audits",
    template: "%s | InstructLint",
  },
  description,
  applicationName: "InstructLint",
  category: "developer tools",
  keywords: [
    "AGENTS.md audit",
    "CLAUDE.md audit",
    "AI coding agent instructions",
    "repository instruction drift",
    "x402 developer API",
  ],
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    url: "/",
    siteName: "InstructLint",
    title: "InstructLint | Agent instruction drift audits",
    description,
  },
  twitter: {
    card: "summary",
    title: "InstructLint | Agent instruction drift audits",
    description,
  },
  robots: {
    index: true,
    follow: true,
  },
};

export const viewport: Viewport = {
  themeColor: "#07100e",
  colorScheme: "dark",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
