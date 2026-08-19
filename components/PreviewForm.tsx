"use client";

import type { FormEvent } from "react";
import { useEffect, useId, useRef, useState } from "react";

type PreviewFinding = {
  id: string;
  severity: string;
  title: string;
  detail: string;
};

type PreviewPayload = {
  ok: true;
  repository: {
    owner: string;
    name: string;
    url: string;
  };
  audit: {
    score: number;
    counts: { total: number };
    inventory: { guidanceFiles: Array<{ path: string }> };
    findings: PreviewFinding[];
    truncated: boolean;
  };
};

type PreviewState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; data: PreviewPayload }
  | { status: "error"; message: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isPreviewPayload(value: unknown): value is PreviewPayload {
  if (!isRecord(value) || value.ok !== true) {
    return false;
  }

  const repository = value.repository;
  const audit = value.audit;
  if (!isRecord(repository) || !isRecord(audit)) {
    return false;
  }

  const counts = audit.counts;
  const inventory = audit.inventory;
  return (
    typeof repository.owner === "string" &&
    typeof repository.name === "string" &&
    typeof repository.url === "string" &&
    typeof audit.score === "number" &&
    isRecord(counts) &&
    typeof counts.total === "number" &&
    isRecord(inventory) &&
    Array.isArray(inventory.guidanceFiles) &&
    Array.isArray(audit.findings) &&
    typeof audit.truncated === "boolean"
  );
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "Preview request failed. Check the repository URL and try again.";
}

function getResponseError(data: unknown) {
  if (!isRecord(data) || !("error" in data)) {
    return null;
  }

  const error = data.error;
  if (typeof error === "string") {
    return error;
  }
  if (isRecord(error) && typeof error.message === "string") {
    return error.message;
  }
  return null;
}

export function PreviewForm() {
  const [repoUrl, setRepoUrl] = useState("");
  const [preview, setPreview] = useState<PreviewState>({ status: "idle" });
  const inputId = useId();
  const statusId = useId();
  const outcomeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (preview.status === "success" || preview.status === "error") {
      outcomeRef.current?.focus();
    }
  }, [preview.status]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedUrl = repoUrl.trim();

    if (!trimmedUrl) {
      setPreview({
        status: "error",
        message: "Enter a public GitHub repository URL.",
      });
      return;
    }

    setPreview({ status: "loading" });

    try {
      const response = await fetch("/api/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repoUrl: trimmedUrl }),
      });
      const contentType = response.headers.get("content-type") ?? "";
      const data = contentType.includes("application/json")
        ? await response.json()
        : await response.text();

      if (!response.ok) {
        throw new Error(
          getResponseError(data) ?? `Preview failed with HTTP ${response.status}.`,
        );
      }
      if (!isPreviewPayload(data)) {
        throw new Error("Preview returned an unexpected response.");
      }

      setPreview({ status: "success", data });
    } catch (error) {
      setPreview({ status: "error", message: getErrorMessage(error) });
    }
  }

  const statusMessage =
    preview.status === "loading"
      ? "Scanning repository instructions."
      : preview.status === "success"
        ? "Preview ready."
        : preview.status === "error"
          ? "Preview failed."
          : "Ready for a public GitHub repository URL.";

  return (
    <form
      className="preview-card"
      onSubmit={handleSubmit}
      aria-busy={preview.status === "loading"}
    >
      <label htmlFor={inputId}>Repository URL</label>
      <div className="input-row">
        <input
          id={inputId}
          name="repoUrl"
          type="url"
          inputMode="url"
          autoComplete="url"
          placeholder="https://github.com/org/repo"
          value={repoUrl}
          onChange={(event) => setRepoUrl(event.target.value)}
          aria-describedby={statusId}
          aria-invalid={preview.status === "error"}
          required
        />
        <button type="submit" disabled={preview.status === "loading"}>
          {preview.status === "loading" ? "Scanning" : "Preview audit"}
        </button>
      </div>

      <p id={statusId} className="sr-only" aria-live="polite">
        {statusMessage}
      </p>

      {preview.status === "idle" ? (
        <div className="preview-output">
          <p className="muted">
            See the score, detected instruction files, finding counts, and top
            drift signals. Evidence and repair patches stay in the paid report.
          </p>
        </div>
      ) : null}

      {preview.status === "loading" ? (
        <div className="preview-output">
          <p className="muted">Scanning instruction files and repo signals…</p>
        </div>
      ) : null}

      {preview.status === "error" ? (
        <div className="preview-output" ref={outcomeRef} tabIndex={-1}>
          <p className="error" role="alert">
            {preview.message}
          </p>
        </div>
      ) : null}

      {preview.status === "success" ? (
        <div
          className="preview-output preview-result"
          ref={outcomeRef}
          tabIndex={-1}
          aria-labelledby="preview-result-title"
        >
          <div className="result-heading">
            <div>
              <p className="eyebrow">Preview ready</p>
              <h3 id="preview-result-title">
                {preview.data.repository.owner}/{preview.data.repository.name}
              </h3>
            </div>
            <span className="score" aria-label={`${preview.data.audit.score} out of 100`}>
              {preview.data.audit.score}
            </span>
          </div>

          <div className="preview-metrics" aria-label="Audit summary">
            <div>
              <strong>{preview.data.audit.counts.total}</strong>
              <span>findings</span>
            </div>
            <div>
              <strong>{preview.data.audit.inventory.guidanceFiles.length}</strong>
              <span>instruction files</span>
            </div>
            <div>
              <strong>{preview.data.audit.truncated ? "Yes" : "No"}</strong>
              <span>preview truncated</span>
            </div>
          </div>

          {preview.data.audit.findings.length > 0 ? (
            <ul className="preview-findings" aria-label="Top findings">
              {preview.data.audit.findings.map((finding) => (
                <li key={finding.id}>
                  <span className="severity">{finding.severity}</span>
                  <div>
                    <strong>{finding.title}</strong>
                    <p>{finding.detail}</p>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="result-clear">
              No supported drift was detected by the bounded rule set.
            </p>
          )}

          <div className="result-actions">
            <a className="button button-primary" href="#paid-api">
              Unlock evidence + patch · $1
            </a>
          </div>

          <details className="raw-preview">
            <summary>View preview JSON</summary>
            <pre>
              <code>{JSON.stringify(preview.data, null, 2)}</code>
            </pre>
          </details>
        </div>
      ) : null}
    </form>
  );
}
