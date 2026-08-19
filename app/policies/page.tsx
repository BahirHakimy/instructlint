import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy, payment, and service terms",
  description:
    "How InstructLint handles public repository data, x402 payments, report delivery, support, and refunds.",
  alternates: { canonical: "/policies" },
};

const supportUrl =
  "https://github.com/BahirHakimy/instructlint/issues/new?title=Paid%20report%20delivery%20support";

export default function PoliciesPage() {
  return (
    <main className="policy-page">
      <div className="shell">
        <Link className="policy-back" href="/">
          ← Back to InstructLint
        </Link>
        <header className="policy-header">
          <p className="eyebrow">Service policy · updated August 20, 2026</p>
          <h1>Clear terms for a small, deterministic service.</h1>
          <p className="section-lede">
            InstructLint audits public GitHub repositories without changing
            them. These notes explain the data path, payment settlement, report
            delivery, and support process.
          </p>
        </header>

        <div className="policy-copy">
          <section aria-labelledby="scope-title">
            <h2 id="scope-title">Service scope</h2>
            <p>
              InstructLint reads a bounded snapshot of a public GitHub
              repository and compares agent-facing instruction files with
              observable repository evidence. It does not access private
              repositories, write to repositories, or apply suggested patches.
            </p>
            <p>
              Reports are deterministic, best-effort developer guidance. They
              may be incomplete or contain mistakes, so review every finding
              and patch before relying on it.
            </p>
          </section>

          <section aria-labelledby="payment-title">
            <h2 id="payment-title">Payment and delivery</h2>
            <p>
              The free preview requires no payment. The full report endpoint
              returns an x402 v2 challenge stating the exact USDC amount,
              recipient, and Base network before a compatible client authorizes
              payment. InstructLint never asks for a private key.
            </p>
            <p>
              Payment settles only after the full report handler returns a
              successful response. Invalid input, unsupported repositories,
              GitHub retrieval failures, and other error responses are not
              settled. A successful response includes the report and an x402
              payment receipt header.
            </p>
          </section>

          <section aria-labelledby="support-title">
            <h2 id="support-title">Delivery support and refunds</h2>
            <p>
              If an on-chain payment settles but your client does not receive a
              usable report, open a public support issue within 14 days. Include
              the transaction hash and public repository URL. Never post a
              private key, seed phrase, or payment signature.
            </p>
            <p>
              The operator will first reproduce or re-deliver the purchased
              report. If delivery cannot be restored after the payment is
              verified, the settled report price will be returned to the paying
              address. Third-party network fees are not refundable.
            </p>
            <a href={supportUrl}>Open a paid-report support issue →</a>
          </section>

          <section aria-labelledby="privacy-title">
            <h2 id="privacy-title">Privacy</h2>
            <h3>Data processed</h3>
            <p>
              A request contains a public GitHub repository URL. During the
              request, the service fetches a bounded set of public repository
              files and returns an audit. The application has no account system,
              cookies, advertising tracker, or analytics script.
            </p>
            <h3>Storage and providers</h3>
            <p>
              InstructLint does not intentionally persist repository snapshots
              or audit results in an application database. Hosting and upstream
              providers may process request metadata in their operational logs.
              The service relies on Vercel for hosting, GitHub for public source
              retrieval, PayAI for x402 facilitation, and Base for public USDC
              settlement. The Web3ToolLaunch directory serves the footer badge
              image and may receive ordinary request metadata when that image
              loads. On-chain transaction details are public by design.
            </p>
          </section>

          <section aria-labelledby="use-title">
            <h2 id="use-title">Acceptable use and changes</h2>
            <p>
              Use the service only for lawful analysis of public repositories.
              Do not attempt to bypass limits, interfere with the service, or
              submit private or secret material. The operator may restrict
              abusive traffic to protect availability.
            </p>
            <p>
              Material policy changes will be published on this page with an
              updated date. Continued use after a change means the current terms
              apply to that request.
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
