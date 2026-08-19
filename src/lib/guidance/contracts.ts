export type GuidanceFileKind =
  | "agents"
  | "agents-override"
  | "claude"
  | "gemini"
  | "copilot"
  | "github-instructions"
  | "cursor-rule"
  | "windsurf";

export type RepositoryFile = {
  path: string;
  content: string;
};

export type GuidanceFile = RepositoryFile & {
  kind: GuidanceFileKind;
  scope: string;
};

export type FindingSeverity = "critical" | "high" | "medium" | "low";

export type FindingCategory =
  | "missing-guidance"
  | "missing-path"
  | "package-manager-mismatch"
  | "missing-script"
  | "placeholder-guidance"
  | "deployment-approval"
  | "nested-scope";

export type Evidence = {
  file: string;
  line: number;
  excerpt: string;
};

export type PatchSuggestion = {
  file: string;
  description: string;
  patch: string;
};

export type AnalysisFinding = {
  id: string;
  category: FindingCategory;
  severity: FindingSeverity;
  title: string;
  detail: string;
  evidence: Evidence[];
  suggestion: PatchSuggestion;
};

export type GuidanceInventory = {
  totalFiles: number;
  guidanceFiles: GuidanceFile[];
  packageManager?: string;
  lockfileManagers: string[];
  packageScripts: string[];
  deploymentConfigFiles: string[];
};

export type AnalysisCounts = Record<FindingSeverity, number> & {
  total: number;
};

export type AnalysisMode = "preview" | "full";

export type AnalysisReport = {
  mode: AnalysisMode;
  inventory: GuidanceInventory;
  findings: AnalysisFinding[];
  counts: AnalysisCounts;
  score: number;
  truncated: boolean;
};
