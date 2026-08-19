import { beforeEach, describe, expect, it, vi } from "vitest";

import { fetchGitHubSnapshot } from "../repo";
import { auditPublicRepository } from "./service";

vi.mock("../repo", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../repo")>()),
  fetchGitHubSnapshot: vi.fn(),
}));

const mockedFetchSnapshot = vi.mocked(fetchGitHubSnapshot);

describe("auditPublicRepository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedFetchSnapshot.mockResolvedValue({
      metadata: {
        owner: "acme",
        repo: "widgets",
        defaultBranch: "main",
        htmlUrl: "https://github.com/acme/widgets",
        isPrivate: false,
      },
      commitSha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      tree: [
        { path: "AGENTS.md", type: "blob", size: 48 },
        { path: "package-lock.json", type: "blob", size: 2 },
        { path: "package.json", type: "blob", size: 80 },
        { path: "src/existing.ts", type: "blob", size: 10 },
      ],
      files: [
        {
          path: "AGENTS.md",
          kind: "instruction",
          size: 48,
          content: "Run `npm run test`. Read `src/existing.ts`.",
        },
        {
          path: "package-lock.json",
          kind: "evidence",
          size: 2,
          content: "{}",
        },
        {
          path: "package.json",
          kind: "evidence",
          size: 80,
          content: JSON.stringify({
            packageManager: "npm@10.9.3",
            scripts: { test: "vitest run" },
          }),
        },
      ],
    });
  });

  it("uses the full tree for existence checks without exposing fetched contents", async () => {
    const result = await auditPublicRepository(
      "https://github.com/acme/widgets",
      "full",
    );

    expect(result.repository).toEqual({
      owner: "acme",
      name: "widgets",
      url: "https://github.com/acme/widgets",
      defaultBranch: "main",
      commitSha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    });
    expect(result.audit.findings).toEqual([]);
    expect(result.audit.inventory.guidanceFiles).toEqual([
      { path: "AGENTS.md", kind: "agents", scope: "." },
    ]);
    expect(JSON.stringify(result)).not.toContain("Read `src/existing.ts`");
  });

  it("preserves the preview boundary", async () => {
    mockedFetchSnapshot.mockResolvedValueOnce({
      metadata: {
        owner: "acme",
        repo: "widgets",
        defaultBranch: "main",
        htmlUrl: "https://github.com/acme/widgets",
        isPrivate: false,
      },
      commitSha: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      tree: [
        { path: "AGENTS.md", type: "blob", size: 30 },
        { path: "package.json", type: "blob", size: 40 },
      ],
      files: [
        {
          path: "AGENTS.md",
          kind: "instruction",
          size: 30,
          content: "Run `npm run absent`.",
        },
        {
          path: "package.json",
          kind: "evidence",
          size: 40,
          content: JSON.stringify({ scripts: { test: "vitest run" } }),
        },
      ],
    });

    const result = await auditPublicRepository(
      "https://github.com/acme/widgets",
      "preview",
    );

    expect(result.audit.mode).toBe("preview");
    expect(result.audit.findings).toHaveLength(1);
    expect(result.audit.findings[0]).not.toHaveProperty("evidence");
    expect(result.audit.findings[0]).not.toHaveProperty("suggestion");
    expect(mockedFetchSnapshot).toHaveBeenCalledOnce();
  });

  it("redacts evidence and suggestions from every preview finding", async () => {
    mockedFetchSnapshot.mockResolvedValueOnce({
      metadata: {
        owner: "acme",
        repo: "widgets",
        defaultBranch: "main",
        htmlUrl: "https://github.com/acme/widgets",
        isPrivate: false,
      },
      commitSha: "cccccccccccccccccccccccccccccccccccccccc",
      tree: [
        { path: "AGENTS.md", type: "blob", size: 120 },
        { path: "package.json", type: "blob", size: 80 },
        { path: "vercel.json", type: "blob", size: 2 },
      ],
      files: [
        {
          path: "AGENTS.md",
          kind: "instruction",
          size: 120,
          content: [
            "TODO replace this guidance.",
            "Run `npm run missing`.",
            "Read `./docs/private-plan.md`.",
            "Deploy with Vercel.",
          ].join("\n"),
        },
        {
          path: "package.json",
          kind: "evidence",
          size: 80,
          content: JSON.stringify({ scripts: { test: "vitest run" } }),
        },
        { path: "vercel.json", kind: "evidence", size: 2, content: "{}" },
      ],
    });

    const result = await auditPublicRepository(
      "https://github.com/acme/widgets",
      "preview",
    );

    expect(result.audit.findings).toHaveLength(2);
    expect(result.audit.counts.total).toBeGreaterThan(2);
    expect(result.audit.findings.every((finding) => !("evidence" in finding))).toBe(true);
    expect(result.audit.findings.every((finding) => !("suggestion" in finding))).toBe(true);
    expect(JSON.stringify(result.audit.findings)).not.toContain("docs/private-plan.md");
    expect(JSON.stringify(result.audit.findings)).not.toContain("Replace");
  });

  it("coalesces concurrent requests for the same canonical repository", async () => {
    type Snapshot = Awaited<ReturnType<typeof fetchGitHubSnapshot>>;
    let releaseSnapshot: (snapshot: Snapshot) => void = () => undefined;
    const pendingSnapshot = new Promise<Snapshot>((resolve) => {
      releaseSnapshot = resolve;
    });
    mockedFetchSnapshot.mockReturnValueOnce(pendingSnapshot);

    const first = auditPublicRepository("https://github.com/acme/shared", "preview");
    const second = auditPublicRepository(
      "https://github.com/acme/shared.git/",
      "full",
    );

    expect(mockedFetchSnapshot).toHaveBeenCalledOnce();
    releaseSnapshot({
      metadata: {
        owner: "acme",
        repo: "shared",
        defaultBranch: "main",
        htmlUrl: "https://github.com/acme/shared",
        isPrivate: false,
      },
      commitSha: "dddddddddddddddddddddddddddddddddddddddd",
      tree: [],
      files: [],
    });

    const [preview, full] = await Promise.all([first, second]);
    expect(preview.repository.commitSha).toBe(
      "dddddddddddddddddddddddddddddddddddddddd",
    );
    expect(full.repository.commitSha).toBe(preview.repository.commitSha);
  });
});
