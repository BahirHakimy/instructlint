import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { analyzeInstructions } from "./instructlint";

const fixture = [
  {
    path: "package.json",
    content: JSON.stringify({
      packageManager: "npm@10.9.3",
      scripts: { lint: "eslint .", test: "vitest run" },
    }),
  },
  { path: "package-lock.json", content: "{}" },
  { path: "vercel.json", content: "{}" },
  { path: "src/index.ts", content: "export const ready = true;" },
  {
    path: "AGENTS.md",
    content: [
      "# Agent instructions",
      "Run `pnpm test` and `npm run deploy` before handoff.",
      "Read `src/retired.ts` before changing the entrypoint.",
      "Deploy with `npm run deploy`.",
      "TODO: replace this placeholder with the real release checklist.",
    ].join("\n"),
  },
];

describe("published sample report", () => {
  it("stays reproducible from the production analyzer", () => {
    const published = JSON.parse(
      readFileSync(
        new URL("../../../public/sample-report.json", import.meta.url),
        "utf8",
      ),
    ) as { audit: unknown };
    const report = analyzeInstructions(fixture, { mode: "full" });

    expect(published.audit).toEqual({
      mode: report.mode,
      score: report.score,
      counts: report.counts,
      inventory: {
        totalFiles: report.inventory.totalFiles,
        guidanceFiles: report.inventory.guidanceFiles.map(
          ({ path, kind, scope }) => ({ path, kind, scope }),
        ),
        packageManager: report.inventory.packageManager,
        lockfileManagers: report.inventory.lockfileManagers,
        packageScripts: report.inventory.packageScripts,
        deploymentConfigFiles: report.inventory.deploymentConfigFiles,
      },
      findings: report.findings,
      truncated: report.truncated,
    });
  });
});
