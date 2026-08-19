import type { RepositoryTreeEntry, SnapshotFileKind } from "../contracts";

export const MAX_SELECTED_FILES = 30;
export const MAX_FILE_BYTES = 64 * 1024;
export const MAX_TOTAL_BYTES = 512 * 1024;

const INSTRUCTION_FILE_NAMES = new Set([
  "agents.md",
  "agents.override.md",
  "claude.md",
  "gemini.md",
  "copilot-instructions.md",
  "readme.md",
]);

function normalizedPath(path: string): string {
  return path.replaceAll("\\", "/").replace(/^\/+/, "");
}

export function classifySnapshotPath(path: string): SnapshotFileKind | null {
  const normalized = normalizedPath(path);
  const lower = normalized.toLowerCase();
  const baseName = lower.split("/").at(-1) ?? lower;

  if (
    INSTRUCTION_FILE_NAMES.has(baseName) ||
    lower === ".cursorrules" ||
    lower.startsWith(".cursor/rules/") ||
    lower.startsWith(".github/instructions/")
  ) {
    return "instruction";
  }

  if (lower === "package.json") {
    return "evidence";
  }

  return null;
}

export function selectSnapshotEntries(
  entries: readonly RepositoryTreeEntry[],
  maxFiles = MAX_SELECTED_FILES,
): readonly (RepositoryTreeEntry & { readonly kind: SnapshotFileKind })[] {
  return entries
    .filter((entry): entry is RepositoryTreeEntry & { readonly type: "blob"; readonly size: number } => {
      return entry.type === "blob" && typeof entry.size === "number" && entry.size <= MAX_FILE_BYTES;
    })
    .flatMap((entry): (RepositoryTreeEntry & { readonly kind: SnapshotFileKind })[] => {
      const kind = classifySnapshotPath(entry.path);
      return kind === null ? [] : [{ ...entry, kind }];
    })
    .sort((left, right) => {
      return (
        selectionRank(left.path) - selectionRank(right.path) ||
        left.path.localeCompare(right.path)
      );
    })
    .slice(0, maxFiles);
}

function selectionRank(path: string): number {
  const normalized = normalizedPath(path).toLowerCase();
  if (normalized === "package.json") {
    return 0;
  }
  return 1;
}
