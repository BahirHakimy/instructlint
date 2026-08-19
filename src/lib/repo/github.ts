import {
  AppError,
  type NormalizedGitHubRepository,
  type RepositoryMetadata,
  type RepositorySnapshot,
  type RepositorySnapshotFile,
  type RepositoryTreeEntry,
} from "../contracts";
import {
  MAX_FILE_BYTES,
  MAX_SELECTED_FILES,
  MAX_TOTAL_BYTES,
  selectSnapshotEntries,
} from "../safety/selection";

const GITHUB_API_ORIGIN = "https://api.github.com";
const GITHUB_RAW_ORIGIN = "https://raw.githubusercontent.com";
const MAX_TREE_ENTRIES = 20_000;
const DEFAULT_TIMEOUT_MS = 10_000;

export interface FetchGitHubSnapshotOptions {
  readonly token?: string;
  readonly timeoutMs?: number;
  readonly signal?: AbortSignal;
  readonly fetchImpl?: typeof fetch;
}

interface GitHubRepositoryResponse {
  readonly private?: unknown;
  readonly default_branch?: unknown;
  readonly html_url?: unknown;
  readonly owner?: { readonly login?: unknown };
  readonly name?: unknown;
}

interface GitHubTreeResponse {
  readonly sha?: unknown;
  readonly tree?: unknown;
  readonly truncated?: unknown;
}

type ResolvedTree = {
  commitSha: string;
  entries: readonly RepositoryTreeEntry[];
};

export function normalizeGitHubRepositoryUrl(input: string): NormalizedGitHubRepository {
  let url: URL;

  try {
    url = new URL(input);
  } catch (error) {
    throw new AppError("BAD_REPOSITORY_URL", "Repository URL must be a valid GitHub HTTPS URL.", 400, error);
  }

  const explicitAuthority = input.match(/^https:\/\/([^/?#]+)/i)?.[1];
  const hasExplicitPort = explicitAuthority?.includes(":") ?? false;

  if (
    url.protocol !== "https:" ||
    url.hostname !== "github.com" ||
    url.username !== "" ||
    url.password !== "" ||
    url.port !== "" ||
    hasExplicitPort ||
    url.search !== "" ||
    url.hash !== ""
  ) {
    throw new AppError("BAD_REPOSITORY_URL", "Only canonical public GitHub HTTPS repository URLs are allowed.", 400);
  }

  const segments = url.pathname.split("/").filter(Boolean);
  if (segments.length !== 2) {
    throw new AppError("BAD_REPOSITORY_URL", "Repository URL must be https://github.com/owner/repo.", 400);
  }

  const [owner, rawRepo] = segments;
  const repo = rawRepo.endsWith(".git") ? rawRepo.slice(0, -4) : rawRepo;

  if (!isValidOwner(owner) || !isValidRepo(repo)) {
    throw new AppError("BAD_REPOSITORY_URL", "Repository owner or name is not valid.", 400);
  }

  return {
    owner,
    repo,
    htmlUrl: `https://github.com/${owner}/${repo}`,
  };
}

export async function fetchGitHubSnapshot(
  repositoryUrl: string,
  options: FetchGitHubSnapshotOptions = {},
): Promise<RepositorySnapshot> {
  const repository = normalizeGitHubRepositoryUrl(repositoryUrl);
  const request = createGitHubRequester(options);

  const metadata = await fetchRepositoryMetadata(request, repository);
  if (metadata.isPrivate) {
    throw new AppError("PRIVATE_REPOSITORY", "Private repositories are not supported.", 403);
  }

  const resolvedTree = await fetchRepositoryTree(
    request,
    repository,
    metadata.defaultBranch,
  );
  const selectedEntries = selectSnapshotEntries(
    resolvedTree.entries,
    MAX_SELECTED_FILES,
  );
  let totalBytes = 0;

  for (const entry of selectedEntries) {
    if (typeof entry.size !== "number") {
      continue;
    }

    if (entry.size > MAX_FILE_BYTES) {
      throw new AppError("FILE_TOO_LARGE", `Selected file exceeds ${MAX_FILE_BYTES} bytes: ${entry.path}`, 413);
    }

    totalBytes += entry.size;
    if (totalBytes > MAX_TOTAL_BYTES) {
      throw new AppError("SNAPSHOT_TOO_LARGE", `Selected files exceed ${MAX_TOTAL_BYTES} bytes.`, 413);
    }

  }

  const files: RepositorySnapshotFile[] = await Promise.all(
    selectedEntries.map(async (entry) => ({
      path: entry.path,
      kind: entry.kind,
      size: entry.size as number,
      content: await fetchRepositoryFile(
        repository,
        entry.path,
        resolvedTree.commitSha,
        options,
      ),
    })),
  );

  return {
    metadata,
    commitSha: resolvedTree.commitSha,
    tree: resolvedTree.entries,
    files,
  };
}

function isValidOwner(owner: string): boolean {
  return /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(owner);
}

function isValidRepo(repo: string): boolean {
  return /^[A-Za-z0-9._-]+$/.test(repo) && repo.length > 0 && repo !== "." && repo !== "..";
}

function createGitHubRequester(options: FetchGitHubSnapshotOptions): (path: string) => Promise<unknown> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const token = options.token ?? process.env.GITHUB_TOKEN;

  return async (path: string): Promise<unknown> => {
    if (!path.startsWith("/")) {
      throw new AppError("INVALID_GITHUB_RESPONSE", "GitHub API path must be absolute.", 500);
    }

    const response = await fetchImpl(`${GITHUB_API_ORIGIN}${path}`, {
      headers: {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      signal: requestSignal(options),
    }).catch((error: unknown) => {
      if (isAbortError(error)) {
        throw new AppError("GITHUB_TIMEOUT", "GitHub request timed out.", 504, error);
      }

      throw new AppError("GITHUB_REQUEST_FAILED", "GitHub request failed.", 502, error);
    });

    if (!response.ok) {
      throw await mapGitHubResponseError(response);
    }

    try {
      return await response.json();
    } catch (error) {
      throw new AppError("INVALID_GITHUB_RESPONSE", "GitHub returned invalid JSON.", 502, error);
    }
  };
}

async function fetchRepositoryMetadata(
  request: (path: string) => Promise<unknown>,
  repository: NormalizedGitHubRepository,
): Promise<RepositoryMetadata> {
  const data = (await request(`/repos/${encodeURIComponent(repository.owner)}/${encodeURIComponent(repository.repo)}`)) as
    | GitHubRepositoryResponse
    | undefined;

  if (
    typeof data?.default_branch !== "string" ||
    typeof data.private !== "boolean" ||
    typeof data.html_url !== "string" ||
    typeof data.name !== "string" ||
    typeof data.owner?.login !== "string"
  ) {
    throw new AppError("INVALID_GITHUB_RESPONSE", "GitHub repository metadata response is invalid.", 502);
  }

  return {
    owner: data.owner.login,
    repo: data.name,
    defaultBranch: data.default_branch,
    htmlUrl: data.html_url,
    isPrivate: data.private,
  };
}

async function fetchRepositoryTree(
  request: (path: string) => Promise<unknown>,
  repository: NormalizedGitHubRepository,
  ref: string,
): Promise<ResolvedTree> {
  const data = (await request(
    `/repos/${encodeURIComponent(repository.owner)}/${encodeURIComponent(repository.repo)}/git/trees/${encodeURIComponent(ref)}?recursive=1`,
  )) as GitHubTreeResponse | undefined;

  if (
    typeof data?.sha !== "string" ||
    !/^[0-9a-f]{40}$/i.test(data.sha) ||
    !Array.isArray(data.tree) ||
    typeof data.truncated !== "boolean"
  ) {
    throw new AppError("INVALID_GITHUB_RESPONSE", "GitHub repository tree response is invalid.", 502);
  }

  if (data.truncated || data.tree.length > MAX_TREE_ENTRIES) {
    throw new AppError("REPOSITORY_TOO_LARGE", `Repository tree exceeds ${MAX_TREE_ENTRIES} entries.`, 413);
  }

  return {
    commitSha: data.sha,
    entries: data.tree
      .map((entry) => normalizeTreeEntry(entry))
      .filter((entry): entry is RepositoryTreeEntry => entry !== null)
      .sort((left, right) => left.path.localeCompare(right.path)),
  };
}

async function fetchRepositoryFile(
  repository: NormalizedGitHubRepository,
  path: string,
  commitSha: string,
  options: FetchGitHubSnapshotOptions,
): Promise<string> {
  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  const rawUrl = `${GITHUB_RAW_ORIGIN}/${encodeURIComponent(repository.owner)}/${encodeURIComponent(repository.repo)}/${commitSha}/${encodedPath}`;
  const fetchImpl = options.fetchImpl ?? fetch;
  let response: Response;
  try {
    response = await fetchImpl(rawUrl, {
      headers: { Accept: "text/plain" },
      redirect: "error",
      signal: requestSignal(options),
    });
  } catch (error) {
    if (isAbortError(error)) {
      throw new AppError("GITHUB_TIMEOUT", "GitHub request timed out.", 504, error);
    }
    throw new AppError("GITHUB_REQUEST_FAILED", "GitHub request failed.", 502, error);
  }

  if (!response.ok) {
    throw new AppError(
      "GITHUB_REQUEST_FAILED",
      `GitHub raw content failed with status ${response.status}.`,
      502,
    );
  }

  const declaredSize = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredSize) && declaredSize > MAX_FILE_BYTES) {
    throw new AppError(
      "FILE_TOO_LARGE",
      `Selected file exceeds ${MAX_FILE_BYTES} bytes: ${path}`,
      413,
    );
  }

  const bytes = await response.arrayBuffer();
  if (bytes.byteLength > MAX_FILE_BYTES) {
    throw new AppError(
      "FILE_TOO_LARGE",
      `Selected file exceeds ${MAX_FILE_BYTES} bytes: ${path}`,
      413,
    );
  }

  return new TextDecoder().decode(bytes);
}

function requestSignal(options: FetchGitHubSnapshotOptions): AbortSignal {
  const timeout = AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  return options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
}

function normalizeTreeEntry(entry: unknown): RepositoryTreeEntry | null {
  if (typeof entry !== "object" || entry === null) {
    return null;
  }

  const candidate = entry as {
    readonly path?: unknown;
    readonly type?: unknown;
    readonly size?: unknown;
    readonly sha?: unknown;
  };

  if (typeof candidate.path !== "string" || (candidate.type !== "blob" && candidate.type !== "tree")) {
    return null;
  }

  return {
    path: candidate.path,
    type: candidate.type,
    ...(typeof candidate.size === "number" ? { size: candidate.size } : {}),
    ...(typeof candidate.sha === "string" ? { sha: candidate.sha } : {}),
  };
}

async function mapGitHubResponseError(response: Response): Promise<AppError> {
  if (response.status === 404) {
    return new AppError("REPOSITORY_NOT_FOUND", "GitHub repository was not found.", 404);
  }

  if (response.status === 403 && isRateLimited(response)) {
    return new AppError("GITHUB_RATE_LIMITED", "GitHub API rate limit exceeded.", 429);
  }

  return new AppError("GITHUB_REQUEST_FAILED", `GitHub request failed with status ${response.status}.`, 502);
}

function isRateLimited(response: Response): boolean {
  return (
    response.headers.get("x-ratelimit-remaining") === "0" ||
    response.headers.get("x-ratelimit-resource") !== null ||
    response.headers.get("retry-after") !== null
  );
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException
    ? error.name === "AbortError" || error.name === "TimeoutError"
    : error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError");
}
