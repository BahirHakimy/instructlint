import { describe, expect, it, vi } from "vitest";

import { AppError } from "../contracts";
import { fetchGitHubSnapshot, normalizeGitHubRepositoryUrl } from "./github";

const metadata = {
  private: false,
  default_branch: "main",
  html_url: "https://github.com/acme/widgets",
  owner: { login: "acme" },
  name: "widgets",
};
const commitSha = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}

function textResponse(body: string, init?: ResponseInit): Response {
  return new Response(body, { status: 200, ...init });
}

type FetchMock = ReturnType<typeof vi.fn> & typeof fetch;

function createFetchMock(responses: readonly Response[]): FetchMock {
  const queue = [...responses];

  return vi.fn(async () => {
    const response = queue.shift();
    if (!response) {
      throw new Error("Unexpected fetch call");
    }

    return response;
  }) as unknown as FetchMock;
}

describe("normalizeGitHubRepositoryUrl", () => {
  it.each([
    ["https://github.com/acme/widgets", "acme", "widgets"],
    ["https://github.com/acme/widgets.git", "acme", "widgets"],
    ["https://github.com/acme/widgets/", "acme", "widgets"],
  ])("accepts canonical public repository URL %s", (url, owner, repo) => {
    expect(normalizeGitHubRepositoryUrl(url)).toEqual({
      owner,
      repo,
      htmlUrl: `https://github.com/${owner}/${repo}`,
    });
  });

  it.each([
    "http://github.com/acme/widgets",
    "https://gitlab.com/acme/widgets",
    "https://www.github.com/acme/widgets",
    "https://user@github.com/acme/widgets",
    "https://github.com:443/acme/widgets",
    "https://github.com/acme/widgets/tree/main",
    "https://github.com/acme/widgets?tab=readme",
    "https://github.com/acme/widgets#readme",
    "https://github.com/acme",
  ])("rejects non-canonical repository URL %s", (url) => {
    expect(() => normalizeGitHubRepositoryUrl(url)).toThrow(AppError);
  });
});

describe("fetchGitHubSnapshot", () => {
  it("fetches metadata, tree, then selected files from the hardcoded GitHub API origin", async () => {
    const fetchMock = createFetchMock([
      jsonResponse(metadata),
      jsonResponse({
        sha: commitSha,
        truncated: false,
        tree: [
          { path: "package.json", type: "blob", size: 16, sha: "pkg" },
          { path: "AGENTS.md", type: "blob", size: 12, sha: "agents" },
          { path: "src/index.ts", type: "blob", size: 8, sha: "src" },
        ],
      }),
      textResponse('{"ok":true}\n'),
      textResponse("agent rules\n"),
    ]);

    const snapshot = await fetchGitHubSnapshot("https://github.com/acme/widgets.git/", {
      fetchImpl: fetchMock,
      token: "token-123",
    });

    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "https://api.github.com/repos/acme/widgets",
      "https://api.github.com/repos/acme/widgets/git/trees/main?recursive=1",
      `https://raw.githubusercontent.com/acme/widgets/${commitSha}/package.json`,
      `https://raw.githubusercontent.com/acme/widgets/${commitSha}/AGENTS.md`,
    ]);
    expect(fetchMock.mock.calls[0]?.[1]?.headers).toMatchObject({
      Accept: "application/vnd.github+json",
      Authorization: "Bearer token-123",
    });
    expect(snapshot.files).toEqual([
      { path: "package.json", kind: "evidence", size: 16, content: '{"ok":true}\n' },
      { path: "AGENTS.md", kind: "instruction", size: 12, content: "agent rules\n" },
    ]);
  });

  it("does not fetch arbitrary hosts embedded in repository content paths", async () => {
    const fetchMock = createFetchMock([
      jsonResponse(metadata),
      jsonResponse({
        sha: commitSha,
        truncated: false,
        tree: [
          {
            path: ".github/instructions/https://evil.example/check.instructions.md",
            type: "blob",
            size: 5,
          },
        ],
      }),
      textResponse("safe\n"),
    ]);

    await fetchGitHubSnapshot("https://github.com/acme/widgets", { fetchImpl: fetchMock });

    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "https://api.github.com/repos/acme/widgets",
      "https://api.github.com/repos/acme/widgets/git/trees/main?recursive=1",
      `https://raw.githubusercontent.com/acme/widgets/${commitSha}/.github/instructions/https%3A//evil.example/check.instructions.md`,
    ]);
  });

  it("requests raw content at the resolved commit with redirects rejected", async () => {
    const fetchMock = createFetchMock([
      jsonResponse(metadata),
      jsonResponse({
        sha: commitSha,
        truncated: false,
        tree: [{ path: "AGENTS.md", type: "blob", size: 5 }],
      }),
      textResponse("rules"),
    ]);

    await fetchGitHubSnapshot("https://github.com/acme/widgets", { fetchImpl: fetchMock });

    expect(fetchMock.mock.calls[2]?.[0]).toBe(
      `https://raw.githubusercontent.com/acme/widgets/${commitSha}/AGENTS.md`,
    );
    expect(fetchMock.mock.calls[2]?.[1]).toMatchObject({
      redirect: "error",
      headers: { Accept: "text/plain" },
    });
  });

  it("rejects tree responses that do not resolve to a commit hash", async () => {
    const fetchMock = createFetchMock([
      jsonResponse(metadata),
      jsonResponse({
        sha: "refs/heads/main",
        truncated: false,
        tree: [{ path: "AGENTS.md", type: "blob", size: 1 }],
      }),
    ]);

    await expect(fetchGitHubSnapshot("https://github.com/acme/widgets", { fetchImpl: fetchMock })).rejects.toMatchObject({
      code: "INVALID_GITHUB_RESPONSE",
      status: 502,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("rejects private repositories", async () => {
    const fetchMock = createFetchMock([jsonResponse({ ...metadata, private: true })]);

    await expect(fetchGitHubSnapshot("https://github.com/acme/widgets", { fetchImpl: fetchMock })).rejects.toMatchObject({
      code: "PRIVATE_REPOSITORY",
      status: 403,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("maps not found responses", async () => {
    const fetchMock = createFetchMock([jsonResponse({ message: "Not Found" }, { status: 404 })]);

    await expect(fetchGitHubSnapshot("https://github.com/acme/widgets", { fetchImpl: fetchMock })).rejects.toMatchObject({
      code: "REPOSITORY_NOT_FOUND",
      status: 404,
    });
  });

  it("maps rate limit responses", async () => {
    const fetchMock = createFetchMock([
      jsonResponse(
        { message: "rate limited" },
        {
          status: 403,
          headers: { "x-ratelimit-remaining": "0" },
        },
      ),
    ]);

    await expect(fetchGitHubSnapshot("https://github.com/acme/widgets", { fetchImpl: fetchMock })).rejects.toMatchObject({
      code: "GITHUB_RATE_LIMITED",
      status: 429,
    });
  });

  it("maps aborts to timeout errors", async () => {
    const fetchMock = vi.fn(async () => {
      throw new DOMException("Timeout", "TimeoutError");
    }) as unknown as FetchMock;

    await expect(fetchGitHubSnapshot("https://github.com/acme/widgets", { fetchImpl: fetchMock })).rejects.toMatchObject({
      code: "GITHUB_TIMEOUT",
      status: 504,
    });
  });

  it("rejects truncated trees", async () => {
    const fetchMock = createFetchMock([
      jsonResponse(metadata),
      jsonResponse({
        sha: commitSha,
        truncated: true,
        tree: [{ path: "AGENTS.md", type: "blob", size: 1 }],
      }),
    ]);

    await expect(fetchGitHubSnapshot("https://github.com/acme/widgets", { fetchImpl: fetchMock })).rejects.toMatchObject({
      code: "REPOSITORY_TOO_LARGE",
      status: 413,
    });
  });

  it("rejects trees above the entry limit", async () => {
    const tree = Array.from({ length: 20_001 }, (_, index) => ({
      path: `docs/file-${index}.md`,
      type: "blob",
      size: 1,
    }));
    const fetchMock = createFetchMock([
      jsonResponse(metadata),
      jsonResponse({ sha: commitSha, truncated: false, tree }),
    ]);

    await expect(fetchGitHubSnapshot("https://github.com/acme/widgets", { fetchImpl: fetchMock })).rejects.toMatchObject({
      code: "REPOSITORY_TOO_LARGE",
      status: 413,
    });
  });

  it("selects at most 30 files in deterministic order", async () => {
    const tree = [
      { path: "package.json", type: "blob", size: 2 },
      ...Array.from({ length: 40 }, (_, index) => ({
        path: `section-${String(index).padStart(2, "0")}/AGENTS.md`,
        type: "blob",
        size: 2,
      })),
    ];
    const fileResponses = Array.from({ length: 30 }, () =>
      textResponse("x\n"),
    );
    const fetchMock = createFetchMock([
      jsonResponse(metadata),
      jsonResponse({ sha: commitSha, truncated: false, tree }),
      ...fileResponses,
    ]);

    const snapshot = await fetchGitHubSnapshot("https://github.com/acme/widgets", { fetchImpl: fetchMock });

    expect(snapshot.files).toHaveLength(30);
    expect(snapshot.files.map((file) => file.path)).toEqual([
      "package.json",
      ...tree.slice(1, 30).map((entry) => entry.path),
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(32);
  });

  it("skips oversized tree entries before fetching content", async () => {
    const fetchMock = createFetchMock([
      jsonResponse(metadata),
      jsonResponse({
        sha: commitSha,
        truncated: false,
        tree: [
          { path: "AGENTS.md", type: "blob", size: 64 * 1024 + 1 },
          { path: "package.json", type: "blob", size: 3 },
        ],
      }),
      textResponse("{}\n"),
    ]);

    const snapshot = await fetchGitHubSnapshot("https://github.com/acme/widgets", { fetchImpl: fetchMock });

    expect(snapshot.files).toEqual([{ path: "package.json", kind: "evidence", size: 3, content: "{}\n" }]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("rejects content responses above the per-file limit", async () => {
    const fetchMock = createFetchMock([
      jsonResponse(metadata),
      jsonResponse({
        sha: commitSha,
        truncated: false,
        tree: [{ path: "AGENTS.md", type: "blob", size: 1 }],
      }),
      textResponse("x".repeat(64 * 1024 + 1)),
    ]);

    await expect(fetchGitHubSnapshot("https://github.com/acme/widgets", { fetchImpl: fetchMock })).rejects.toMatchObject({
      code: "FILE_TOO_LARGE",
      status: 413,
    });
  });

  it("rejects oversized raw content-length before reading the body", async () => {
    const rawResponse = textResponse("", {
      headers: { "content-length": String(64 * 1024 + 1) },
    });
    const readBody = vi.spyOn(rawResponse, "arrayBuffer");
    const fetchMock = createFetchMock([
      jsonResponse(metadata),
      jsonResponse({
        sha: commitSha,
        truncated: false,
        tree: [{ path: "AGENTS.md", type: "blob", size: 1 }],
      }),
      rawResponse,
    ]);

    await expect(fetchGitHubSnapshot("https://github.com/acme/widgets", { fetchImpl: fetchMock })).rejects.toMatchObject({
      code: "FILE_TOO_LARGE",
      status: 413,
    });
    expect(readBody).not.toHaveBeenCalled();
  });

  it("rejects selected files above the total snapshot limit", async () => {
    const tree = Array.from({ length: 9 }, (_, index) => ({
      path: `section-${index}/AGENTS.md`,
      type: "blob",
      size: 60 * 1024,
    }));
    const fetchMock = createFetchMock([
      jsonResponse(metadata),
      jsonResponse({ sha: commitSha, truncated: false, tree }),
    ]);

    await expect(fetchGitHubSnapshot("https://github.com/acme/widgets", { fetchImpl: fetchMock })).rejects.toMatchObject({
      code: "SNAPSHOT_TOO_LARGE",
      status: 413,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
