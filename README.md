# InstructLint

InstructLint checks whether repository instructions for coding agents match observable repository evidence. It discovers files such as `AGENTS.md`, `CLAUDE.md`, Copilot instructions, Cursor rules, `GEMINI.md`, and Windsurf guidance, then compares supported claims with the repository tree, package metadata, scripts, lockfiles, and deployment configuration.

The public preview is free. The full evidence-linked report and suggested instruction patches cost `$1.00` in USDC through an x402 v2 API challenge.

- Live service: [instructlint.vercel.app](https://instructlint.vercel.app)
- OpenAPI description: [instructlint.vercel.app/openapi.json](https://instructlint.vercel.app/openapi.json)
- Machine-readable overview: [instructlint.vercel.app/llms.txt](https://instructlint.vercel.app/llms.txt)
- Reproducible sample report: [instructlint.vercel.app/sample-report.json](https://instructlint.vercel.app/sample-report.json)
- Readiness: [instructlint.vercel.app/api/health](https://instructlint.vercel.app/api/health)

## API

Preview a public GitHub repository:

```bash
curl -X POST https://your-deployment.example/api/preview \
  -H 'content-type: application/json' \
  -d '{"repoUrl":"https://github.com/owner/repository"}'
```

Inspect the payment challenge without paying:

```bash
curl -i -X POST https://instructlint.vercel.app/api/report \
  -H 'content-type: application/json' \
  -d '{"repoUrl":"https://github.com/owner/repository"}'
```

Pay and receive the report with the official Coinbase Agentic Wallet CLI:

```bash
npx awal@2.12.1 x402 pay https://instructlint.vercel.app/api/report \
  -X POST \
  -d '{"repoUrl":"https://github.com/owner/repository"}'
```

An unpaid request receives HTTP `402` with a `PAYMENT-REQUIRED` header. After a valid payment is verified, InstructLint runs the full audit. The x402 adapter settles only successful report responses; invalid requests and failed audits are not settled.

Configure and fund Agentic Wallet on the same Base network advertised by the endpoint before purchasing. Never paste a wallet private key into InstructLint; the payment client signs locally. See the [official Agentic Wallet documentation](https://docs.cdp.coinbase.com/x402/agentic-accounts/agentic-wallet).

Service readiness is available at `GET /api/health`.

## What is checked

- Missing agent instruction surfaces
- Declared package manager versus committed lockfiles
- Documented package scripts versus `package.json`
- Explicit repository path references versus the Git tree
- Placeholder instruction text
- Deployment configuration without an approval boundary
- Orphaned or standalone nested instruction scopes

The checker is deterministic and deliberately bounded. It does not infer intent from arbitrary prose, perform a vulnerability scan, mutate the submitted repository, or inspect private repositories.

## Data and safety boundaries

Only canonical `https://github.com/owner/repo` URLs are accepted. Repository metadata and trees come from the fixed GitHub API origin; selected text files come from a fixed `raw.githubusercontent.com` origin at the resolved commit, with redirects disabled. A snapshot is limited to 20,000 tree entries, 30 selected text files, 64 KiB per file, and 512 KiB total selected content. Responses omit fetched file bodies, and the service has no database or persistence layer.

## Local development

```bash
npm ci --legacy-peer-deps
npm run dev
```

Quality gate:

```bash
npm run check
```

## Payment configuration

Paid reports remain disabled until `X402_PAY_TO` is set to an EVM address controlled by the operator.

Base Sepolia test configuration:

```env
X402_PAY_TO=0x...
X402_NETWORK=eip155:84532
X402_FACILITATOR_URL=https://x402.org/facilitator
# Optional. Leave blank to use the built-in $1.00 default.
X402_PRICE=
```

Base mainnet configuration:

```env
X402_PAY_TO=0x...
X402_NETWORK=eip155:8453
X402_FACILITATOR_URL=https://facilitator.payai.network
# Optional. Leave blank to use the built-in $1.00 default.
X402_PRICE=
```

`GITHUB_TOKEN` is optional and increases GitHub API limits. Use a read-only token if one is configured.

## Operating model

The source is public so buyers can inspect the deterministic rules, data boundaries, and payment wiring. The hosted service charges for the convenient evidence-linked report; it does not require repository credentials or custody of a buyer wallet.
