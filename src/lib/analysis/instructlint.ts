import type {
  AnalysisCounts,
  AnalysisFinding,
  AnalysisMode,
  AnalysisReport,
  Evidence,
  FindingCategory,
  FindingSeverity,
  GuidanceFile,
  GuidanceFileKind,
  GuidanceInventory,
  RepositoryFile,
} from "../guidance/contracts";

type ExtractedCommand = {
  manager: string;
  script: string;
  text: string;
  evidence: Evidence;
};

type ExtractedPath = {
  path: string;
  explicit: boolean;
  relativeToGuidance: boolean;
  evidence: Evidence;
};

const GUIDANCE_MATCHERS: Array<{
  kind: GuidanceFileKind;
  test: (path: string) => boolean;
  scope: (path: string) => string;
}> = [
  { kind: "agents", test: (path) => basename(path) === "AGENTS.md", scope: dirname },
  {
    kind: "agents-override",
    test: (path) => basename(path) === "AGENTS.override.md",
    scope: dirname,
  },
  { kind: "claude", test: (path) => basename(path) === "CLAUDE.md", scope: dirname },
  { kind: "gemini", test: (path) => basename(path) === "GEMINI.md", scope: dirname },
  {
    kind: "copilot",
    test: (path) => path === ".github/copilot-instructions.md",
    scope: () => ".github",
  },
  {
    kind: "github-instructions",
    test: (path) => path.startsWith(".github/instructions/") && path.endsWith(".instructions.md"),
    scope: () => ".github",
  },
  {
    kind: "cursor-rule",
    test: (path) =>
      path.startsWith(".cursor/rules/") && (path.endsWith(".md") || path.endsWith(".mdc")),
    scope: () => ".cursor/rules",
  },
  { kind: "windsurf", test: (path) => path === ".windsurfrules", scope: () => "." },
];

const LOCKFILE_MANAGERS: Record<string, string> = {
  "package-lock.json": "npm",
  "npm-shrinkwrap.json": "npm",
  "pnpm-lock.yaml": "pnpm",
  "yarn.lock": "yarn",
  "bun.lock": "bun",
  "bun.lockb": "bun",
};

const DEPLOYMENT_CONFIG_FILES = new Set([
  "vercel.json",
  "netlify.toml",
  "wrangler.toml",
  "fly.toml",
  "render.yaml",
  "firebase.json",
  "app.yaml",
  "railway.json",
]);

const FINDING_ORDER: Record<FindingCategory, number> = {
  "missing-guidance": 0,
  "package-manager-mismatch": 1,
  "missing-script": 2,
  "missing-path": 3,
  "deployment-approval": 4,
  "placeholder-guidance": 5,
  "nested-scope": 6,
};

const SEVERITY_ORDER: Record<FindingSeverity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

const SEVERITY_PENALTY: Record<FindingSeverity, number> = {
  critical: 25,
  high: 15,
  medium: 8,
  low: 4,
};

export function analyzeInstructions(
  inputFiles: RepositoryFile[],
  options: { mode?: AnalysisMode } = {},
): AnalysisReport {
  const mode = options.mode ?? "full";
  const files = normalizeFiles(inputFiles);
  const inventory = buildInventory(files);
  const findings = sortFindings([
    ...findMissingGuidance(inventory),
    ...findPackageManagerMismatches(inventory),
    ...findMissingScripts(inventory, files),
    ...findMissingPaths(inventory, files),
    ...findDeploymentApprovalGaps(inventory),
    ...findPlaceholderGuidance(inventory),
    ...findNestedScopeAnomalies(inventory),
  ]);
  const visibleFindings = mode === "preview" ? findings.slice(0, 2) : findings;

  return {
    mode,
    inventory,
    findings: visibleFindings,
    counts: countFindings(findings),
    score: scoreFindings(findings),
    truncated: visibleFindings.length !== findings.length,
  };
}

function findMissingGuidance(inventory: GuidanceInventory): AnalysisFinding[] {
  if (inventory.guidanceFiles.length > 0) {
    return [];
  }

  return [
    finding({
      category: "missing-guidance",
      severity: "high",
      key: "repository",
      title: "No supported agent instruction file was found",
      detail:
        "The repository has no AGENTS.md, CLAUDE.md, Copilot instructions, Cursor rules, GEMINI.md, or Windsurf guidance to verify.",
      evidence: [evidence(".", 1, "No supported guidance file in repository tree")],
      suggestion: {
        file: "AGENTS.md",
        description:
          "Add a root instruction file with verified commands and safety boundaries.",
        patch:
          "Add AGENTS.md with the repository's package manager, validation commands, scope rules, and deployment approval boundary.",
      },
    }),
  ];
}

export function discoverGuidanceFiles(files: RepositoryFile[]): GuidanceFile[] {
  return normalizeFiles(files)
    .flatMap((file) => {
      const matcher = GUIDANCE_MATCHERS.find(({ test }) => test(file.path));
      return matcher
        ? [{ ...file, kind: matcher.kind, scope: normalizePath(matcher.scope(file.path)) }]
        : [];
    })
    .sort(compareGuidanceFiles);
}

export function extractMarkdownPaths(file: RepositoryFile): ExtractedPath[] {
  const paths = new Map<string, ExtractedPath>();
  const lines = file.content.split(/\r?\n/);
  lines.forEach((line, index) => {
    const candidates = [
      ...[...line.matchAll(/`([^`\n]+)`/g)].map((match) => ({
        raw: match[1],
        explicit: /^\.{1,2}\//.test(match[1]),
        relativeToGuidance: /^\.{1,2}\//.test(match[1]),
      })),
      ...[...line.matchAll(/\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)].map(
        (match) => ({
          raw: match[1],
          explicit: true,
          relativeToGuidance: true,
        }),
      ),
    ];

    for (const candidateMatch of candidates) {
      const raw = candidateMatch.raw.trim();
      for (const candidate of splitPathCandidates(raw)) {
        if (!looksLikePathReference(candidate)) {
          continue;
        }
        const normalized = normalizeReferencedPath(
          candidate,
          file.path,
          candidateMatch.relativeToGuidance,
        );
        const current = paths.get(normalized);
        if (!current || (candidateMatch.explicit && !current.explicit)) {
          paths.set(normalized, {
            path: normalized,
            explicit: candidateMatch.explicit,
            relativeToGuidance: candidateMatch.relativeToGuidance,
            evidence: evidence(file.path, index + 1, line),
          });
        }
      }
    }
  });

  return [...paths.values()].sort((a, b) => a.path.localeCompare(b.path));
}

export function extractPackageScriptCommands(file: RepositoryFile): ExtractedCommand[] {
  const commands: ExtractedCommand[] = [];
  const lines = file.content.split(/\r?\n/);
  let inCodeFence = false;

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (/^(```|~~~)/.test(trimmed)) {
      inCodeFence = !inCodeFence;
      return;
    }

    const segments = [
      ...[...line.matchAll(/`([^`\n]+)`/g)].map((match) => match[1]),
      ...(inCodeFence ? [line] : []),
      ...(/^\s*\$\s+/.test(line) ? [line.replace(/^\s*\$\s+/, "")] : []),
    ];

    for (const segment of segments) {
      const commandMatches = [
        ...segment.matchAll(
          /\b(npm|pnpm|yarn|bun)(?:\s+--[A-Za-z0-9_-]+(?:=|\s+)?[^\s]*)*\s+run\s+([A-Za-z0-9][A-Za-z0-9:_-]*)\b/g,
        ),
        ...segment.matchAll(
          /\b(npm|pnpm|yarn|bun)\s+([A-Za-z0-9][A-Za-z0-9:_-]*)\b/g,
        ),
      ];
      for (const match of commandMatches) {
        const manager = match[1];
        const script = normalizeScriptName(manager, match[2], match[0]);
        if (!script) {
          continue;
        }
        commands.push({
          manager,
          script,
          text: match[0],
          evidence: evidence(file.path, index + 1, line),
        });
      }
    }
  });

  return uniqueBy(
    commands.sort(
      (a, b) => a.text.localeCompare(b.text) || compareEvidence(a.evidence, b.evidence),
    ),
    (command) => `${command.text}:${command.evidence.file}:${command.evidence.line}`,
  );
}

function buildInventory(files: RepositoryFile[]): GuidanceInventory {
  const guidanceFiles = discoverGuidanceFiles(files);
  const packageJson = files.find((file) => file.path === "package.json");
  const packageData = parsePackageJson(packageJson);
  const lockfileManagers = uniqueSorted(
    files.flatMap((file) => LOCKFILE_MANAGERS[basename(file.path)] ?? []),
  );

  return {
    totalFiles: files.length,
    guidanceFiles,
    packageManager: packageData.packageManager,
    lockfileManagers,
    packageScripts: packageData.scripts,
    deploymentConfigFiles: files
      .filter((file) => DEPLOYMENT_CONFIG_FILES.has(basename(file.path)))
      .map((file) => file.path)
      .sort(),
  };
}

function findPackageManagerMismatches(inventory: GuidanceInventory): AnalysisFinding[] {
  const declaredManager = inventory.packageManager?.split("@")[0];
  if (!declaredManager) {
    return [];
  }
  const findings: AnalysisFinding[] = [];
  const mismatched = inventory.lockfileManagers.filter((manager) => manager !== declaredManager);
  if (mismatched.length > 0) {
    findings.push(
      finding({
        category: "package-manager-mismatch",
        severity: "high",
        key: `${declaredManager}-${mismatched.join("-")}`,
        title: "Package manager declaration conflicts with lockfiles",
        detail: `packageManager declares ${declaredManager}, but lockfiles indicate ${mismatched.join(", ")}.`,
        evidence: [
          evidence("package.json", 1, `"packageManager": "${inventory.packageManager}"`),
          ...mismatched.map((manager) =>
            evidence(lockfileNameForManager(manager), 1, `${manager} lockfile present`),
          ),
        ],
        suggestion: {
          file: "package.json",
          description:
            "Align packageManager and committed lockfiles to one package manager.",
          patch: `Keep only ${declaredManager} lockfiles, or update packageManager after migrating intentionally.`,
        },
      }),
    );
  }

  for (const file of inventory.guidanceFiles) {
    for (const command of extractPackageScriptCommands(file)) {
      if (command.manager === declaredManager) {
        continue;
      }
      findings.push(
        finding({
          category: "package-manager-mismatch",
          severity: "high",
          key: `${file.path}-${command.evidence.line}-${command.manager}`,
          title: `Guidance uses ${command.manager}, but package.json declares ${declaredManager}`,
          detail: `${command.text} conflicts with the repository's declared ${declaredManager} package manager.`,
          evidence: [
            command.evidence,
            evidence(
              "package.json",
              1,
              `"packageManager": "${inventory.packageManager}"`,
            ),
          ],
          suggestion: {
            file: file.path,
            description: `Use the declared ${declaredManager} package manager in agent commands.`,
            patch: `Replace "${command.text}" with the equivalent ${declaredManager} command.`,
          },
        }),
      );
    }
  }

  return uniqueBy(findings, (item) => item.id);
}

function findMissingScripts(inventory: GuidanceInventory, files: RepositoryFile[]): AnalysisFinding[] {
  const scripts = new Set(inventory.packageScripts);
  if (scripts.size === 0) {
    return [];
  }

  return uniqueBy(
    inventory.guidanceFiles.flatMap((file) =>
      extractPackageScriptCommands(file)
        .filter((command) => !scripts.has(command.script))
        .map((command) =>
          finding({
            category: "missing-script",
            severity: "high",
            key: `${file.path}-${command.script}`,
            title: `Guidance references missing package script "${command.script}"`,
            detail: `${command.text} is documented, but package.json does not define a ${command.script} script.`,
            evidence: [command.evidence, packageJsonEvidence(files)],
            suggestion: {
              file: file.path,
              description: "Use an existing package.json script or add the missing script intentionally.",
              patch: `Replace "${command.text}" with a defined script such as ${scriptList(inventory.packageScripts)}.`,
            },
          }),
        ),
    ),
    (item) => item.id,
  );
}

function findMissingPaths(inventory: GuidanceInventory, files: RepositoryFile[]): AnalysisFinding[] {
  const existing = new Set(files.map((file) => file.path));
  const dirs = new Set<string>();
  for (const file of files) {
    for (const dir of parentDirs(file.path)) {
      dirs.add(dir);
    }
  }
  const topLevelDirectories = new Set(
    [...dirs].filter((dir) => !dir.includes("/")),
  );

  return uniqueBy(
    inventory.guidanceFiles.flatMap((file) =>
      extractMarkdownPaths(file)
        .filter(({ path }) => !isExternalPath(path))
        .filter(
          ({ path, explicit }) =>
            explicit || topLevelDirectories.has(path.split("/", 1)[0]),
        )
        .filter(({ path }) => !existing.has(path) && !dirs.has(path))
        .map(({ path, evidence: pathEvidence }) =>
          finding({
            category: "missing-path",
            severity: "medium",
            key: `${file.path}-${path}`,
            title: `Guidance references missing path "${path}"`,
            detail: `${file.path} points to ${path}, but that path is not present in the repository inventory.`,
            evidence: [pathEvidence],
            suggestion: {
              file: file.path,
              description: "Remove stale path guidance or update it to the current repository path.",
              patch: `Replace or delete the reference to ${path}.`,
            },
          }),
        ),
    ),
    (item) => item.id,
  );
}

function findDeploymentApprovalGaps(inventory: GuidanceInventory): AnalysisFinding[] {
  if (inventory.deploymentConfigFiles.length === 0) {
    return [];
  }
  const guidanceText = inventory.guidanceFiles.map((file) => file.content).join("\n").toLowerCase();
  const hasDeploymentTopic =
    /\b(deploy|deployment|production|vercel|netlify|cloudflare|fly\.io|render)\b/.test(guidanceText);
  const hasExplicitApprovalRule =
    /\b(no[-\s]?deploy|do not deploy|approval required|explicit approval|ask before deploy|production approval|never deploy)\b/.test(
      guidanceText,
    );

  if (hasDeploymentTopic && hasExplicitApprovalRule) {
    return [];
  }

  return [
    finding({
      category: "deployment-approval",
      severity: "critical",
      key: inventory.deploymentConfigFiles.join("-"),
      title: "Deployment config lacks an explicit no-deploy or approval rule",
      detail: `${inventory.deploymentConfigFiles.join(", ")} exists, but guidance does not explicitly block or require approval for deployment.`,
      evidence: inventory.deploymentConfigFiles.map((file) => evidence(file, 1, "deployment config present")),
      suggestion: {
        file: inventory.guidanceFiles[0]?.path ?? "AGENTS.md",
        description: "Add a deployment safety rule to the agent guidance.",
        patch: "Add: Do not deploy or modify production deployment state without explicit user approval.",
      },
    }),
  ];
}

function findPlaceholderGuidance(inventory: GuidanceInventory): AnalysisFinding[] {
  const placeholderPattern =
    /\b(todo|tbd|lorem ipsum|placeholder|replace this|your project|example only|fill this in)\b/i;

  return inventory.guidanceFiles.flatMap((file) =>
    file.content
      .split(/\r?\n/)
      .map((line, index) => ({ line, lineNumber: index + 1 }))
      .filter(({ line }) => placeholderPattern.test(line))
      .map(({ line, lineNumber }) =>
        finding({
          category: "placeholder-guidance",
          severity: "low",
          key: `${file.path}-${lineNumber}`,
          title: "Guidance contains placeholder text",
          detail: "Placeholder guidance weakens deterministic agent behavior.",
          evidence: [evidence(file.path, lineNumber, line)],
          suggestion: {
            file: file.path,
            description: "Replace placeholder text with repository-specific operating instructions.",
            patch: "Write the concrete command, boundary, or rule this placeholder was meant to capture.",
          },
        }),
      ),
  );
}

function findNestedScopeAnomalies(inventory: GuidanceInventory): AnalysisFinding[] {
  const findings: AnalysisFinding[] = [];
  const agentsByScope = new Map(
    inventory.guidanceFiles
      .filter((file) => file.kind === "agents")
      .map((file) => [file.scope, file]),
  );

  for (const override of inventory.guidanceFiles.filter((file) => file.kind === "agents-override")) {
    if (!agentsByScope.has(override.scope)) {
      findings.push(
        finding({
          category: "nested-scope",
          severity: "medium",
          key: `override-without-agents-${override.path}`,
          title: "Override guidance has no sibling AGENTS.md",
          detail: `${override.path} is an override file, but ${joinPath(override.scope, "AGENTS.md")} is missing.`,
          evidence: [evidence(override.path, 1, "AGENTS.override.md present")],
          suggestion: {
            file: override.path,
            description: "Pair overrides with a sibling AGENTS.md or rename this file if it is the primary guidance.",
            patch: `Add ${joinPath(override.scope, "AGENTS.md")} or move the rules into an existing parent AGENTS.md.`,
          },
        }),
      );
    }
  }

  const scopedAgents = inventory.guidanceFiles.filter((file) => file.kind === "agents" && file.scope !== ".");
  for (const child of scopedAgents) {
    const parent = nearestParentAgents(child.scope, agentsByScope);
    if (!parent) {
      findings.push(
        finding({
          category: "nested-scope",
          severity: "low",
          key: `nested-without-parent-${child.path}`,
          title: "Nested AGENTS.md has no parent AGENTS.md",
          detail: `${child.path} scopes a nested directory without a repository-level or parent AGENTS.md baseline.`,
          evidence: [evidence(child.path, 1, "nested AGENTS.md present")],
          suggestion: {
            file: child.path,
            description: "Add parent guidance or make this file clearly self-contained.",
            patch: "Add a parent AGENTS.md with shared rules, or state that this nested guidance is intentionally standalone.",
          },
        }),
      );
    }
  }

  return findings;
}

function parsePackageJson(file?: RepositoryFile): { packageManager?: string; scripts: string[] } {
  if (!file) {
    return { scripts: [] };
  }
  try {
    const parsed = JSON.parse(file.content) as {
      packageManager?: unknown;
      scripts?: Record<string, unknown>;
    };
    return {
      packageManager: typeof parsed.packageManager === "string" ? parsed.packageManager : undefined,
      scripts: parsed.scripts
        ? Object.keys(parsed.scripts)
            .filter((script) => typeof parsed.scripts?.[script] === "string")
            .sort()
        : [],
    };
  } catch {
    return { scripts: [] };
  }
}

function normalizeFiles(files: RepositoryFile[]): RepositoryFile[] {
  return files
    .map((file) => ({ path: normalizePath(file.path), content: file.content }))
    .sort((a, b) => a.path.localeCompare(b.path));
}

function compareGuidanceFiles(a: GuidanceFile, b: GuidanceFile): number {
  return a.path.localeCompare(b.path) || a.kind.localeCompare(b.kind);
}

function sortFindings(findings: AnalysisFinding[]): AnalysisFinding[] {
  return [...findings].sort(
    (a, b) =>
      SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] ||
      FINDING_ORDER[a.category] - FINDING_ORDER[b.category] ||
      a.id.localeCompare(b.id),
  );
}

function countFindings(findings: AnalysisFinding[]): AnalysisCounts {
  const counts: AnalysisCounts = { total: findings.length, critical: 0, high: 0, medium: 0, low: 0 };
  for (const item of findings) {
    counts[item.severity] += 1;
  }
  return counts;
}

function scoreFindings(findings: AnalysisFinding[]): number {
  const penalty = findings.reduce((total, finding) => total + SEVERITY_PENALTY[finding.severity], 0);
  return Math.max(0, 100 - penalty);
}

function finding(input: {
  category: FindingCategory;
  severity: FindingSeverity;
  key: string;
  title: string;
  detail: string;
  evidence: Evidence[];
  suggestion: AnalysisFinding["suggestion"];
}): AnalysisFinding {
  const evidenceItems = [...input.evidence].sort(compareEvidence);
  return {
    id: `${input.category}:${slug(input.key)}`,
    category: input.category,
    severity: input.severity,
    title: input.title,
    detail: input.detail,
    evidence: evidenceItems,
    suggestion: input.suggestion,
  };
}

function evidence(file: string, line: number, excerpt: string): Evidence {
  return { file: normalizePath(file), line, excerpt: excerpt.trim() };
}

function compareEvidence(a: Evidence, b: Evidence): number {
  return a.file.localeCompare(b.file) || a.line - b.line || a.excerpt.localeCompare(b.excerpt);
}

function normalizeScriptName(
  manager: string,
  script: string,
  commandText: string,
): string | undefined {
  if (/\brun\s+/.test(commandText)) {
    return script;
  }

  const commonDirectScripts = /^(?:build|check(?::[A-Za-z0-9_-]+)?|ci|dev|e2e|format(?::[A-Za-z0-9_-]+)?|lint(?::[A-Za-z0-9_-]+)?|start|test(?::[A-Za-z0-9_-]+)?|type-?check|validate|verify)$/;
  if (!commonDirectScripts.test(script)) {
    return undefined;
  }

  if (manager === "npm" && !["start", "test"].includes(script)) {
    return undefined;
  }
  return script;
}

function splitPathCandidates(value: string): string[] {
  return value
    .split(/[,;]/)
    .map((candidate) => candidate.trim().replace(/^["']|["']$/g, ""))
    .filter(Boolean);
}

function looksLikePathReference(value: string): boolean {
  if (
    isExternalPath(value) ||
    value.startsWith("#") ||
    value.includes("$") ||
    value.includes("*") ||
    value.includes("<") ||
    value.includes(">") ||
    /\s/.test(value)
  ) {
    return false;
  }
  return (
    value.startsWith("./") ||
    value.startsWith("../") ||
    value.startsWith(".github/") ||
    value.startsWith(".cursor/") ||
    /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_./@-]+(?:#[A-Za-z0-9_.-]+)?$/.test(value) ||
    /^[A-Za-z_][A-Za-z0-9_-]*\.[A-Za-z][A-Za-z0-9_.-]*(?:#[A-Za-z0-9_.-]+)?$/.test(
      value,
    )
  );
}

function normalizeReferencedPath(
  value: string,
  guidancePath: string,
  relativeToGuidance: boolean,
): string {
  const cleaned = value
    .replace(/^<|>$/g, "")
    .split(/[?#]/, 1)[0]
    .replace(/[).,:;]+$/g, "");
  const base = relativeToGuidance ? dirname(normalizePath(guidancePath)) : ".";
  return normalizePath(base === "." ? cleaned : `${base}/${cleaned}`);
}

function isExternalPath(value: string): boolean {
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(value);
}

function parentDirs(path: string): string[] {
  const parts = path.split("/");
  const dirs: string[] = [];
  for (let index = 1; index < parts.length; index += 1) {
    dirs.push(parts.slice(0, index).join("/"));
  }
  return dirs;
}

function nearestParentAgents(scope: string, agentsByScope: Map<string, GuidanceFile>): GuidanceFile | undefined {
  const parents = parentDirs(`${scope}/placeholder`).slice(0, -1).reverse();
  return [...parents, "."].map((parent) => agentsByScope.get(parent === "" ? "." : parent)).find(Boolean);
}

function dirname(path: string): string {
  const index = path.lastIndexOf("/");
  return index === -1 ? "." : path.slice(0, index);
}

function basename(path: string): string {
  return path.split("/").pop() ?? path;
}

function joinPath(dir: string, file: string): string {
  return dir === "." ? file : `${dir}/${file}`;
}

function normalizePath(path: string): string {
  const parts: string[] = [];
  for (const part of path.replace(/\\/g, "/").split("/")) {
    if (!part || part === ".") {
      continue;
    }
    if (part === "..") {
      parts.pop();
      continue;
    }
    parts.push(part);
  }
  return parts.join("/") || ".";
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort();
}

function uniqueBy<T>(values: T[], key: (value: T) => string): T[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const id = key(value);
    if (seen.has(id)) {
      return false;
    }
    seen.add(id);
    return true;
  });
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function packageJsonEvidence(files: RepositoryFile[]): Evidence {
  const packageJson = files.find((file) => normalizePath(file.path) === "package.json");
  if (!packageJson) {
    return evidence("package.json", 1, "package.json missing from inventory");
  }
  const lineNumber =
    packageJson.content.split(/\r?\n/).findIndex((line) => line.includes('"scripts"')) + 1 || 1;
  return evidence("package.json", lineNumber, "package.json scripts");
}

function lockfileNameForManager(manager: string): string {
  const entry = Object.entries(LOCKFILE_MANAGERS).find(([, value]) => value === manager);
  return entry?.[0] ?? `${manager} lockfile`;
}

function scriptList(scripts: string[]): string {
  return scripts.length > 0 ? scripts.map((script) => `"${script}"`).join(", ") : "a package.json script";
}
