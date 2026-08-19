import Image from "next/image";

import { PreviewForm } from "@/components/PreviewForm";
import { resolvePaymentConfig } from "@/src/lib/payment/config";

const sampleFindings = [
  {
    level: "High",
    title: "Instruction promises tests that do not exist",
    detail:
      "AGENTS.md requires regression coverage before cleanup, but the repo has no test target for the modified package.",
  },
  {
    level: "Medium",
    title: "CLAUDE.md references a retired deploy path",
    detail:
      "The documented release checklist still points agents at a removed Vercel project and stale environment names.",
  },
  {
    level: "Low",
    title: "Cursor rule conflicts with package scripts",
    detail:
      "The editor instruction says to run pnpm, while package metadata declares npm as the package manager.",
  },
];

const methodology = [
  "Discover agent-facing instructions: AGENTS.md, CLAUDE.md, Copilot, Cursor, and nested overrides.",
  "Map supported claims to repo evidence: paths, package scripts, package manager, lockfiles, deploy config, and nested scope.",
  "Score deterministic findings by severity before suggesting the smallest instruction repair.",
  "Return a free public preview first; the paid report unlocks evidence trails and a suggested instruction patch.",
];

const faqs = [
  {
    question: "Is the preview really free?",
    answer:
      "Yes. Public GitHub repositories can request a free preview with stable findings. The full report costs $1 USDC.",
  },
  {
    question: "What happens to the repository data?",
    answer:
      "The service reads a bounded snapshot from fixed GitHub origins, returns the audit, and stores neither the repository snapshot nor the result in a database.",
  },
  {
    question: "What does the paid report include?",
    answer:
      "Full evidence, confidence notes, drift severity, and a suggested patch for the instruction files.",
  },
  {
    question: "Do you change my repository?",
    answer:
      "No. The product returns findings and patches for review. Applying them remains your decision.",
  },
  {
    question: "When does the $1 payment settle?",
    answer:
      "The x402 client authorizes one USDC payment. Settlement happens only after the full report handler returns successfully; invalid requests and failed audits are not settled.",
  },
  {
    question: "What if GitHub rate-limits the scan?",
    answer:
      "The API returns a retryable rate-limit error. No paid report is settled when repository retrieval fails.",
  },
];

const structuredData = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "InstructLint",
  url: "https://instructlint.vercel.app",
  applicationCategory: "DeveloperApplication",
  operatingSystem: "Web",
  isAccessibleForFree: true,
  description:
    "A deterministic audit for drift between repository coding-agent instructions and observable repository evidence.",
};

export default function Home() {
  const payment = resolvePaymentConfig();
  const paymentReady = payment.status === "ready";
  const productionPayment = paymentReady && payment.config.mainnet;
  const paymentLabel = productionPayment
    ? "$1 USDC on Base"
    : paymentReady
      ? "$1 test USDC on Base Sepolia"
      : "$1 USDC on Base · activation pending";

  return (
    <main>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(structuredData).replaceAll("<", "\\u003c"),
        }}
      />
      <section className="hero" aria-labelledby="hero-title">
        <div className="shell hero-grid">
          <div className="hero-copy">
            <p className="eyebrow">InstructLint · instruction drift verification</p>
            <h1 id="hero-title">
              Check whether your agent instructions match your repo.
            </h1>
            <p className="hero-subtitle">
              Audit AGENTS.md, CLAUDE.md, Copilot, and Cursor instructions
              against repository evidence. Preview public repos for free; unlock
              the full report for $1 USDC.
            </p>
            <div className="hero-actions" aria-label="Primary actions">
              <a href="#preview" className="button button-primary">
                Run free preview
              </a>
              <a href="#method" className="button button-secondary">
                See methodology
              </a>
            </div>
            <p className="trust-line">
              Public GitHub repositories only. Read-only, bounded, no repo
              changes, and no database persistence.
            </p>
          </div>

          <div className="console" aria-label="Verification console preview">
            <div className="console-top">
              <span className="status-dot" aria-hidden="true" />
              <span>verification.console</span>
            </div>
            <div className="console-body">
              <p>
                <span className="prompt">$</span> instructlint preview
                https://github.com/acme/repo
              </p>
              <p className="console-muted">scanning instruction surfaces...</p>
              <p>
                <span className="signal signal-high">HIGH</span> AGENTS.md
                requires tests, but no test command resolves
              </p>
              <p>
                <span className="signal signal-medium">MED</span> Cursor rules
                name pnpm; packageManager is npm@11.5.2
              </p>
              <p className="console-muted">
                preview ready. evidence + suggested patch unlock: $1 USDC
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="band compact" aria-label="Pricing promise">
        <div className="shell promise-row">
          <p>
            Public GitHub preview: <strong>free</strong>
          </p>
          <p>
            Full evidence + suggested patch: <strong>{paymentLabel}</strong>
          </p>
          <p>
            Output: <strong>drift findings with repo proof</strong>
          </p>
        </div>
      </section>

      <section id="preview" className="section" aria-labelledby="preview-title">
        <div className="shell split">
          <div>
            <p className="eyebrow">Client preview</p>
            <h2 id="preview-title">Paste a public GitHub repository URL.</h2>
            <p className="section-lede">
              Get the score, detected instruction files, finding counts, and
              top drift signals. Evidence and repair patches unlock only in the
              full report.
            </p>
          </div>
          <PreviewForm />
        </div>
      </section>

      <section className="section muted-section" aria-labelledby="findings-title">
        <div className="shell">
          <div className="section-head">
            <p className="eyebrow">Sample findings</p>
            <h2 id="findings-title">What InstructLint flags</h2>
          </div>
          <div className="findings-grid">
            {sampleFindings.map((finding) => (
              <article className="finding" key={finding.title}>
                <span className="severity">{finding.level}</span>
                <h3>{finding.title}</h3>
                <p>{finding.detail}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="method" className="section" aria-labelledby="method-title">
        <div className="shell method-grid">
          <div>
            <p className="eyebrow">Methodology</p>
            <h2 id="method-title">Evidence before recommendations</h2>
            <p className="section-lede">
              Supported claims are checked against repository structure,
              package metadata, scripts, deployment configuration, and
              instruction hierarchy. Unsupported prose is never guessed. Each
              response reports whether its bounded preview was truncated.
            </p>
          </div>
          <ol className="steps">
            {methodology.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </div>
      </section>

      <section
        id="paid-api"
        className="section muted-section"
        aria-labelledby="api-title"
      >
        <div className="shell api-grid">
          <div>
            <p className="eyebrow">x402 API</p>
            <h2 id="api-title">Pay only when the full report is worth it</h2>
            <p className="section-lede">
              The endpoint uses x402 v2. Your compatible client handles the
              challenge and USDC authorization; InstructLint never asks for a
              private key.
            </p>
            <ol className="x402-flow">
              <li>
                <strong>Request.</strong> POST the repository URL to the full
                report endpoint.
              </li>
              <li>
                <strong>Authorize.</strong> The 402 response describes exactly
                one USDC payment on the configured Base network.
              </li>
              <li>
                <strong>Receive.</strong> The x402 client retries with payment;
                a successful audit returns evidence and suggested patches.
              </li>
            </ol>
            <p className={paymentReady ? "payment-state ready" : "payment-state"}>
              {paymentReady
                ? `Endpoint ready: ${paymentLabel}.`
                : "Free previews are live. Mainnet payment activation is pending."}
            </p>
            <a className="sample-link" href="/sample-report.json">
              Inspect a reproducible sample full report →
            </a>
          </div>
          <pre className="code-block" aria-label="API example">
            <code>{`# Inspect the x402 challenge without paying
curl -i -X POST https://instructlint.vercel.app/api/report \\
  -H 'content-type: application/json' \\
  -d '{"repoUrl":"https://github.com/acme/repo"}'

HTTP/1.1 402 Payment Required
PAYMENT-REQUIRED: <x402-v2-challenge>

# Pay and receive the report with Coinbase Agentic Wallet
npx awal@2.12.1 x402 pay \\
  https://instructlint.vercel.app/api/report \\
  -X POST \\
  -d '{"repoUrl":"https://github.com/acme/repo"}'`}</code>
          </pre>
        </div>
        <div className="shell api-footnote">
          <p>
            The terminal command uses the official Coinbase Agentic Wallet
            client. Fund and configure that client on the same Base network
            shown by the endpoint before purchasing.
          </p>
          <a href="https://docs.cdp.coinbase.com/x402/agentic-accounts/agentic-wallet">
            Agentic Wallet setup documentation
          </a>
        </div>
      </section>

      <section className="section" aria-labelledby="pricing-title">
        <div className="shell pricing">
          <p className="eyebrow">Pricing</p>
          <h2 id="pricing-title">Simple by design</h2>
          <div className="price-panel">
            <div>
              <span className="price">$0</span>
              <p>Public GitHub preview with stable, high-signal drift summary.</p>
            </div>
            <div>
              <span className="price">$1 USDC</span>
              <p>Full evidence trail, confidence notes, and suggested patch.</p>
              <a className="button button-primary" href="#paid-api">
                View payment flow
              </a>
            </div>
          </div>
        </div>
      </section>

      <section className="section faq-section" aria-labelledby="faq-title">
        <div className="shell">
          <div className="section-head">
            <p className="eyebrow">FAQ</p>
            <h2 id="faq-title">Operational details</h2>
          </div>
          <div className="faq-list">
            {faqs.map((faq) => (
              <details key={faq.question}>
                <summary>{faq.question}</summary>
                <p>{faq.answer}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <footer className="site-footer">
        <div className="shell footer-row">
          <p>InstructLint · deterministic repository instruction audits</p>
          <nav aria-label="Product resources">
            <a href="https://github.com/BahirHakimy/instructlint">Source</a>
            <a href="/openapi.json">OpenAPI</a>
            <a href="/llms.txt">llms.txt</a>
            <a href="/api/health">Service status</a>
            <a href="/policies">Privacy &amp; terms</a>
            <a href="https://github.com/BahirHakimy/instructlint/issues/new?title=Paid%20report%20delivery%20support">
              Support
            </a>
          </nav>
          <a
            className="directory-badge"
            href="https://www.web3toollaunch.com/tool/instructlint/"
            target="_blank"
            rel="noopener"
          >
            <Image
              src="https://www.web3toollaunch.com/badge.svg"
              alt="InstructLint - Listed on Web3ToolLaunch"
              width="210"
              height="40"
              loading="lazy"
              unoptimized
            />
          </a>
        </div>
      </footer>
    </main>
  );
}
