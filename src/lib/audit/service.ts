import { analyzeInstructions } from "../analysis/instructlint";
import type {
  AnalysisFinding,
  AnalysisMode,
  GuidanceFileKind,
} from "../guidance/contracts";
import {
  fetchGitHubSnapshot,
  normalizeGitHubRepositoryUrl,
} from "../repo";

type Snapshot = Awaited<ReturnType<typeof fetchGitHubSnapshot>>;

const inFlightSnapshots = new Map<string, Promise<Snapshot>>();

export type PublicGuidanceFile = {
  path: string;
  kind: GuidanceFileKind;
  scope: string;
};

export type PublicFinding = Omit<
  AnalysisFinding,
  "evidence" | "suggestion"
> & {
  evidence?: AnalysisFinding["evidence"];
  suggestion?: AnalysisFinding["suggestion"];
};

export type AuditResult = {
  ok: true;
  repository: {
    owner: string;
    name: string;
    url: string;
    defaultBranch: string;
    commitSha: string;
  };
  audit: {
    mode: AnalysisMode;
    score: number;
    counts: {
      total: number;
      critical: number;
      high: number;
      medium: number;
      low: number;
    };
    inventory: {
      totalFiles: number;
      guidanceFiles: PublicGuidanceFile[];
      packageManager?: string;
      lockfileManagers: string[];
      packageScripts: string[];
      deploymentConfigFiles: string[];
    };
    findings: PublicFinding[];
    truncated: boolean;
  };
};

export async function auditPublicRepository(
  repoUrl: string,
  mode: AnalysisMode,
): Promise<AuditResult> {
  const snapshot = await fetchSnapshotOnce(repoUrl);
  const selectedContents = new Map(
    snapshot.files.map((file) => [file.path, file.content] as const),
  );

  // Include the full tree as empty-content entries so path checks use repository
  // reality, while only the bounded allowlist of selected files contributes text.
  const repositoryFiles = snapshot.tree
    .filter((entry) => entry.type === "blob")
    .map((entry) => ({
      path: entry.path,
      content: selectedContents.get(entry.path) ?? "",
    }));
  const report = analyzeInstructions(repositoryFiles, { mode });

  return {
    ok: true,
    repository: {
      owner: snapshot.metadata.owner,
      name: snapshot.metadata.repo,
      url: snapshot.metadata.htmlUrl,
      defaultBranch: snapshot.metadata.defaultBranch,
      commitSha: snapshot.commitSha,
    },
    audit: {
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
      findings:
        mode === "preview"
          ? report.findings.map(toPreviewFinding)
          : report.findings,
      truncated: report.truncated,
    },
  };
}

function fetchSnapshotOnce(repoUrl: string): Promise<Snapshot> {
  const canonicalUrl = normalizeGitHubRepositoryUrl(repoUrl).htmlUrl;
  const key = canonicalUrl.toLowerCase();
  const existing = inFlightSnapshots.get(key);
  if (existing) {
    return existing;
  }

  const request = fetchGitHubSnapshot(canonicalUrl).finally(() => {
    if (inFlightSnapshots.get(key) === request) {
      inFlightSnapshots.delete(key);
    }
  });
  inFlightSnapshots.set(key, request);
  return request;
}

function toPreviewFinding(finding: AnalysisFinding): PublicFinding {
  return {
    id: finding.id,
    category: finding.category,
    severity: finding.severity,
    title: finding.title,
    detail: finding.detail,
  };
}
