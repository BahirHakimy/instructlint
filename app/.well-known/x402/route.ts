import { NextResponse } from "next/server";

const discovery = {
  version: 1,
  resources: ["https://instructlint.vercel.app/api/report"],
  instructions:
    "POST JSON with repoUrl set to a canonical public GitHub repository URL.",
} as const;

export function GET() {
  return NextResponse.json(discovery, {
    headers: {
      "Cache-Control": "public, max-age=3600",
    },
  });
}
