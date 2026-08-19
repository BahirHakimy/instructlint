import { describe, expect, it } from "vitest";

import {
  analyzeInstructions,
  discoverGuidanceFiles,
  extractMarkdownPaths,
  extractPackageScriptCommands,
} from "./instructlint";

import type { RepositoryFile } from "../guidance/contracts";

const cleanPackage = JSON.stringify(
  {
    packageManager: "npm@11.5.2",
    scripts: {
      build: "next build",
      lint: "eslint .",
      test: "vitest run",
      typecheck: "tsc --noEmit",
    },
  },
  null,
  2,
);

describe("InstructLint deterministic analysis engine", () => {
  it("discovers all supported guidance files with stable ordering and scopes", () => {
    const files: RepositoryFile[] = [
      { path: "src/AGENTS.override.md", content: "override" },
      { path: ".cursor/rules/style.mdc", content: "cursor" },
      { path: ".github/instructions/review.instructions.md", content: "review" },
      { path: ".github/copilot-instructions.md", content: "copilot" },
      { path: ".windsurfrules", content: "windsurf" },
      { path: "GEMINI.md", content: "gemini" },
      { path: "CLAUDE.md", content: "claude" },
      { path: "AGENTS.md", content: "agents" },
      { path: "notes.md", content: "not guidance" },
    ];

    expect(discoverGuidanceFiles(files).map(({ path, kind, scope }) => ({ path, kind, scope }))).toEqual([
      { path: ".cursor/rules/style.mdc", kind: "cursor-rule", scope: ".cursor/rules" },
      { path: ".github/copilot-instructions.md", kind: "copilot", scope: ".github" },
      {
        path: ".github/instructions/review.instructions.md",
        kind: "github-instructions",
        scope: ".github",
      },
      { path: ".windsurfrules", kind: "windsurf", scope: "." },
      { path: "AGENTS.md", kind: "agents", scope: "." },
      { path: "CLAUDE.md", kind: "claude", scope: "." },
      { path: "GEMINI.md", kind: "gemini", scope: "." },
      { path: "src/AGENTS.override.md", kind: "agents-override", scope: "src" },
    ]);
  });

  it("extracts markdown path references and package script commands without dependencies", () => {
    const file: RepositoryFile = {
      path: "AGENTS.md",
      content: [
        "Read `src/lib/guidance/contracts.ts` and [review rules](.github/instructions/review.instructions.md).",
        "Run `npm run lint`, `pnpm test`, `yarn build`, and `npm ci`.",
        "Ignore https://example.com/src/missing.ts and shell $VARS.",
      ].join("\n"),
    };

    expect(extractMarkdownPaths(file).map(({ path }) => path)).toEqual([
      ".github/instructions/review.instructions.md",
      "src/lib/guidance/contracts.ts",
    ]);
    expect(extractPackageScriptCommands(file).map(({ manager, script, text }) => ({ manager, script, text }))).toEqual([
      { manager: "npm", script: "lint", text: "npm run lint" },
      { manager: "pnpm", script: "test", text: "pnpm test" },
      { manager: "yarn", script: "build", text: "yarn build" },
    ]);
  });

  it("does not treat ordinary slash-separated prose as repository paths", () => {
    const file: RepositoryFile = {
      path: "AGENTS.md",
      content: [
        "Review accessibility/UX concerns and actions/setup-node behavior.",
        "Read [`CONTRIBUTING.md`](./CONTRIBUTING.md#testing) and `packages/core`.",
      ].join("\n"),
    };

    expect(extractMarkdownPaths(file).map(({ path }) => path)).toEqual([
      "CONTRIBUTING.md",
      "packages/core",
    ]);
  });

  it("does not extract external URLs or URL fragments as repository paths", () => {
    const file: RepositoryFile = {
      path: "AGENTS.md",
      content: [
        "Read [remote docs](https://docs.example.com/src/missing.ts#setup).",
        "Keep `https://github.com/acme/widgets/blob/main/src/index.ts` out of path checks.",
        "Read [`CONTRIBUTING.md`](./CONTRIBUTING.md#testing).",
      ].join("\n"),
    };

    expect(extractMarkdownPaths(file).map(({ path }) => path)).toEqual([
      "CONTRIBUTING.md",
    ]);
  });

  it("does not flag URL-like guidance as missing repository paths", () => {
    const report = analyzeInstructions([
      { path: "package.json", content: cleanPackage },
      { path: "package-lock.json", content: "{}" },
      {
        path: "AGENTS.md",
        content: [
          "Run `npm run lint`.",
          "Do not deploy without explicit approval.",
          "See [external setup](https://docs.example.com/src/missing.ts#install).",
        ].join("\n"),
      },
    ]);

    expect(report.findings).toEqual([]);
  });

  it("only extracts package commands from command-shaped code", () => {
    const file: RepositoryFile = {
      path: "AGENTS.md",
      content: [
        "pnpm is enforced and pnpm applies publish settings.",
        "Run `pnpm lint`, `npm test`, and `pnpm run custom:check`.",
        "```sh",
        "yarn build",
        "```",
      ].join("\n"),
    };

    expect(
      extractPackageScriptCommands(file).map(({ manager, script }) => ({
        manager,
        script,
      })),
    ).toEqual([
      { manager: "npm", script: "test" },
      { manager: "pnpm", script: "lint" },
      { manager: "pnpm", script: "custom:check" },
      { manager: "yarn", script: "build" },
    ]);
  });

  it("flags guidance commands that use a different declared package manager", () => {
    const report = analyzeInstructions([
      { path: "package.json", content: cleanPackage },
      { path: "package-lock.json", content: "{}" },
      { path: "AGENTS.md", content: "Run `pnpm lint` before handoff." },
    ]);

    expect(report.findings).toHaveLength(1);
    expect(report.findings[0]).toMatchObject({
      category: "package-manager-mismatch",
      severity: "high",
      title: "Guidance uses pnpm, but package.json declares npm",
    });
  });

  it("does not extract package names or action identifiers as package scripts", () => {
    const file: RepositoryFile = {
      path: "AGENTS.md",
      content: [
        "This repo uses pnpm workspaces and github/actions/setup-node.",
        "The package npm/package-json is reference documentation only.",
      ].join("\n"),
    };

    expect(extractPackageScriptCommands(file)).toEqual([]);
  });

  it("reports missing paths, missing scripts, placeholders, deployment approval gaps, and lockfile mismatch", () => {
    const report = analyzeInstructions(
      [
        { path: "package.json", content: cleanPackage },
        { path: "yarn.lock", content: "# yarn" },
        { path: "vercel.json", content: "{}" },
        {
          path: "AGENTS.md",
          content: [
            "# Agent Rules",
            "TODO replace this with your project rules.",
            "Run `npm run lint` and `npm run e2e`.",
            "Check `./src/missing/file.ts` before edits.",
            "Deploy with Vercel when ready.",
          ].join("\n"),
        },
      ],
      { mode: "full" },
    );

    expect(report.findings.map(({ category }) => category)).toEqual([
      "deployment-approval",
      "package-manager-mismatch",
      "missing-script",
      "missing-path",
      "placeholder-guidance",
    ]);
    expect(report.counts).toEqual({ total: 5, critical: 1, high: 2, medium: 1, low: 1 });
    expect(report.score).toBe(33);
    expect(report.findings.every((finding) => finding.evidence.length > 0)).toBe(true);
    expect(report.findings.every((finding) => finding.suggestion.patch.length > 0)).toBe(true);
  });

  it("limits preview to inventory plus two top findings while keeping full counts", () => {
    const report = analyzeInstructions(
      [
        { path: "package.json", content: cleanPackage },
        { path: "pnpm-lock.yaml", content: "lockfileVersion: '9.0'" },
        { path: "netlify.toml", content: "[build]" },
        {
          path: "AGENTS.md",
          content: [
            "TODO placeholder.",
            "Run `npm run missing`.",
            "Reference `./docs/absent.md`.",
          ].join("\n"),
        },
      ],
      { mode: "preview" },
    );

    expect(report.mode).toBe("preview");
    expect(report.findings).toHaveLength(2);
    expect(report.truncated).toBe(true);
    expect(report.counts.total).toBe(5);
    expect(report.inventory.guidanceFiles.map((file) => file.path)).toEqual(["AGENTS.md"]);
  });

  it("detects nested scope anomalies for orphan overrides and standalone nested agents", () => {
    const report = analyzeInstructions([
      { path: "package.json", content: cleanPackage },
      { path: "src/AGENTS.override.md", content: "Override local rules." },
      { path: "app/feature/AGENTS.md", content: "Feature rules." },
    ]);

    expect(report.findings.map(({ id }) => id)).toEqual([
      "nested-scope:override-without-agents-src-agents-override-md",
      "nested-scope:nested-without-parent-app-feature-agents-md",
    ]);
  });

  it("does not flag nested AGENTS.md when a parent scope exists", () => {
    const report = analyzeInstructions([
      { path: "package.json", content: cleanPackage },
      { path: "AGENTS.md", content: "Root rules." },
      { path: "app/feature/AGENTS.md", content: "Feature rules." },
    ]);

    expect(report.findings).toEqual([]);
  });

  it("resolves explicit nested guidance paths relative to that guidance file", () => {
    const report = analyzeInstructions([
      { path: "package.json", content: cleanPackage },
      { path: "package-lock.json", content: "{}" },
      { path: "AGENTS.md", content: "Root rules." },
      {
        path: "packages/foo/AGENTS.md",
        content:
          "Read [the sibling guide](../bar/README.md) and `./src/missing.ts`.",
      },
      { path: "packages/bar/README.md", content: "Sibling guide." },
    ]);

    expect(report.findings.map(({ title }) => title)).toEqual([
      'Guidance references missing path "packages/foo/src/missing.ts"',
    ]);
  });

  it("returns a perfect score when guidance is aligned", () => {
    const report = analyzeInstructions([
      { path: "package.json", content: cleanPackage },
      { path: "package-lock.json", content: "{}" },
      { path: "src/lib/guidance/contracts.ts", content: "export {};" },
      {
        path: "AGENTS.md",
        content: [
          "Run `npm run lint`, `npm run typecheck`, and `npm run test`.",
          "Deployment rule: do not deploy without explicit approval.",
          "Read `src/lib/guidance/contracts.ts`.",
        ].join("\n"),
      },
    ]);

    expect(report.findings).toEqual([]);
    expect(report.counts).toEqual({ total: 0, critical: 0, high: 0, medium: 0, low: 0 });
    expect(report.score).toBe(100);
    expect(report.truncated).toBe(false);
  });

  it("flags repositories with no supported agent guidance", () => {
    const report = analyzeInstructions([
      { path: "package.json", content: cleanPackage },
      { path: "src/index.ts", content: "export {};" },
    ]);

    expect(report.findings).toHaveLength(1);
    expect(report.findings[0]).toMatchObject({
      category: "missing-guidance",
      severity: "high",
      suggestion: { file: "AGENTS.md" },
    });
    expect(report.score).toBe(85);
  });
});
