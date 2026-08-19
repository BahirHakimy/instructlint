export type AppErrorCode =
  | "BAD_REPOSITORY_URL"
  | "REPOSITORY_NOT_FOUND"
  | "PRIVATE_REPOSITORY"
  | "GITHUB_RATE_LIMITED"
  | "GITHUB_REQUEST_FAILED"
  | "GITHUB_TIMEOUT"
  | "REPOSITORY_TOO_LARGE"
  | "FILE_TOO_LARGE"
  | "SNAPSHOT_TOO_LARGE"
  | "INVALID_GITHUB_RESPONSE";

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly status: number;
  readonly cause?: unknown;

  constructor(code: AppErrorCode, message: string, status: number, cause?: unknown) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = status;
    this.cause = cause;
  }
}

export interface NormalizedGitHubRepository {
  readonly owner: string;
  readonly repo: string;
  readonly htmlUrl: `https://github.com/${string}/${string}`;
}

export interface RepositoryMetadata {
  readonly owner: string;
  readonly repo: string;
  readonly defaultBranch: string;
  readonly htmlUrl: string;
  readonly isPrivate: boolean;
}

export interface RepositoryTreeEntry {
  readonly path: string;
  readonly type: "blob" | "tree";
  readonly size?: number;
  readonly sha?: string;
}

export type SnapshotFileKind = "instruction" | "evidence";

export interface RepositorySnapshotFile {
  readonly path: string;
  readonly kind: SnapshotFileKind;
  readonly size: number;
  readonly content: string;
}

export interface RepositorySnapshot {
  readonly metadata: RepositoryMetadata;
  readonly commitSha: string;
  readonly tree: readonly RepositoryTreeEntry[];
  readonly files: readonly RepositorySnapshotFile[];
}
