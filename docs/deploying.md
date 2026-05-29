# Deploying Yawaragi

The default deployment target is **Vercel** (Next.js's home platform; zero-config for the App Router). This doc covers the practical steps + the GDPR/plan-tier guardrails captured in ADR-0008, ADR-0009, and the pre-go-live checklist.

> **Status:** as of 2026-05-24, Yawaragi is publicly shippable under the EN-first launch strategy (ADR-0008). `/de/*` renders a coming-soon page until the Impressum (§5 DDG) is in place; the project can ship to a non-`.de` domain immediately.

## 1. First-time Vercel setup

1. Sign in to <https://vercel.com> with the GitHub account that owns the repo.
2. **Add new project** → import `yawaragi-dev/yawaragi`. Vercel detects Next.js automatically — leave the framework preset alone.
3. **Environment variables** (Project Settings → Environment Variables). Set per [§3](#3-environment-variables) below. For the first deploy with no integrations wired up, only `NEXT_TELEMETRY_DISABLED=1` is required.
4. Click **Deploy**. The first build takes ~3 min; subsequent builds are faster.
5. Note the auto-assigned URL (e.g. `yawaragi-<hash>.vercel.app`). This is the live deployment.

Every push to `main` → auto-deploy to production. Every PR → a preview deployment with its own URL (linked from the PR's CI checks).

## 2. Custom domain

Optional, but recommended once you're ready to share publicly.

1. Buy a domain. Per ADR-0008, **prefer `.dev` / `.app` / `.com` over `.de`** — a `.de` domain materially strengthens the §5 DDG "directed at Germany" hook and would require an Impressum even without other DACH-targeting signals.
2. Vercel dashboard → Project → Settings → Domains → Add. Vercel walks you through the DNS records to set at your registrar.
3. SSL is automatic (Let's Encrypt via Vercel).

## 3. Environment variables

Set these in **Vercel → Project Settings → Environment Variables** for the `Production`, `Preview`, and `Development` scopes as appropriate. The local-dev counterpart is `.env.local` (gitignored); the source-of-truth shape is `src/env.ts`.

### Required today (Phase 0 state)

| Variable | Why |
|---|---|
| `NEXT_TELEMETRY_DISABLED=1` | Per ADR-0009 § "data minimisation": no anonymised build telemetry to Vercel. Already set in the GitHub Actions workflow; also set it here so Vercel's build runner inherits the opt-out. |

### Wired in later (Phase 2+, when the matching integration lands)

| Variable | Lands with |
|---|---|
| `ANTHROPIC_API_KEY` | First LLM call (Phase 3 label scan, Phase 4 chat) |
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` | First Supabase integration (Phase 2 data foundation) |
| `CLERK_SECRET_KEY` / `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | First user account feature (Phase 2+) |
| `LANGFUSE_PUBLIC_KEY` / `LANGFUSE_SECRET_KEY` / `LANGFUSE_HOST` | First LLM trace target |
| `CRON_SECRET` (≥16 chars) | First cron-protected endpoint (`pnpm ingest`) |

`src/env.ts` declares every field as `.optional()` today (#17). When a PR introduces an integration, that PR tightens its field(s) back to `.min(1)` in the schema so a missing secret fails at import time.

## 4. GDPR and vendor obligations (per ADR-0009)

Before serving any non-trivial traffic — especially any traffic that could include EU residents — sign the vendor DPAs. Don't skip this for a portfolio piece if the deployment URL is publicly shareable.

| Vendor | DPA where | SCCs needed? | Data residency |
|---|---|---|---|
| Vercel (hosting, build) | <https://vercel.com/legal/dpa> — accept in account settings | yes (US-based) | global edge; build runs in US by default |
| Anthropic (Claude API) | <https://www.anthropic.com/legal/dpa> — request via support | yes (US-based) | US |
| Supabase | configurable in account settings | depends on region | **select EU region** at project creation; cannot be changed later |
| Clerk | <https://clerk.com/legal/dpa> | yes (US-based) | US |
| Langfuse | EU region available; verify before signup | no (if EU region) | EU when configured |

Update ADR-0009's RoPA table as each vendor is integrated.

### What NOT to enable on Vercel without an ADR-0009 review

- **Vercel Analytics** (`@vercel/analytics`) — tracks page visits; the existing `/_vercel/` allowlist entry in `isGatedPath` is forward-looking but the SDK itself triggers a vendor-integration review (new data processing → privacy policy update → consent integration).
- **Vercel Web Analytics** (Speed Insights) — same.
- **Vercel KV / Postgres / Edge Config** — new processing surface, same review.

## 5. Plan tiers — "Hobby" vs "Professional"

> **TL;DR:** Most service free tiers are explicitly *non-commercial / personal-use-only*. The moment Yawaragi shifts from a portfolio artefact to anything resembling a real product, audit every vendor's tier against their terms.

Triggers that typically force the switch:

- Project is featured in a CV / interview as live software you're actively maintaining for users.
- Project has any monetisation (donations, ads, affiliate links, paid features).
- Project is used by anyone other than you in any sustained way.
- Vendor's free-tier resource cap is consistently being hit.
- The deployment URL appears in a commercial context (employer, agency, client).

For each vendor, the practical rule of thumb:

| Vendor | Free / Hobby tier | When to upgrade | Upgraded tier |
|---|---|---|---|
| **Vercel** | "Hobby Plan is intended for **personal, non-commercial use only**" ([fair use](https://vercel.com/docs/limits/fair-use-guidelines)) | Any commercial or production-grade use | **Pro** (~$20/user/mo) |
| **GitHub** | Public repos: unlimited free use. Private repos on Free plan: 2,000 Actions min/mo | Action minute cap, advanced features, or >3 collaborators | **Pro** ($4/mo) or **Team** ($4/user/mo) |
| **Supabase** | Free tier supports commercial use but with resource limits (500 MB db, 1 GB storage, 50k MAU) | Resource caps or production SLAs needed | **Pro** ($25/mo/project) |
| **Clerk** | Free up to 10k monthly active users | >10k MAU, or production support needed | **Pro** ($25/mo + per-MAU) |
| **Cloudflare** (if used) | Generous free tier supports commercial use | Custom rules / WAF / higher Workers limits | **Pro** ($25/mo) |
| **Sentry** (if added later) | Developer tier free up to ~5k events/mo | Higher volume, team features | **Team** ($26/mo) |
| **Langfuse** | Hobby tier free with strict limits | Production volume, longer trace retention | **Core** / **Pro** |
| **Anthropic** | No tiers — pay per token | n/a | n/a |

**Vercel is the most likely first violator** — its Hobby plan is explicitly non-commercial, where most other free tiers permit commercial use up to resource caps.

When you cross any of these thresholds, **the Pre-Go-Live checklist (§7.7) is the forcing function** — that section now lists each vendor and the tier audit as a hard gate before any production-grade launch.

## 6. Deploy smoke check (`.github/workflows/vercel-smoke.yml`)

A `pull_request` + `push: main` workflow polls GitHub's deployments API until Vercel reports a successful preview/production deploy for the current SHA, then curls a handful of key paths (`/`, `/en`, `/de`, `/en/sake/1`, an unknown-path 404) against that URL, asserting **none return 5xx**. 200, 3xx, 401, and 404 are all acceptable; 500/502/503/504 fail the check.

Catches the failure mode that builds successfully but crashes at runtime — exactly the `/sake/[id]` → 500 we hit when DATABASE_URL was missing on the first Vercel preview.

### One-time setup

1. **Generate a bypass secret** so the smoke can skip Vercel's SSO on previews.
   - Vercel project → **Settings → Deployment Protection** → look for **"Protection Bypass for Automation"** (or the modern label).
   - Click **"Add Secret"** (or **"Create Token"**), name it something like `github-actions-smoke`.
   - Copy the value once it's shown — Vercel won't show it again.
2. **Add the secret to GitHub.**
   - GitHub repo → **Settings → Secrets and variables → Actions → New repository secret**.
   - Name: `VERCEL_BYPASS_TOKEN`. Value: the secret you just copied.
3. **Verify.** Push a commit or open a PR. Actions tab → "Vercel deploy smoke" → the job's first step polls for up to 10 minutes for Vercel's deploy to be `success`, then runs the smoke. One `✓` line per smoked path on success; clear `✘` line with the offending status on failure.

### Why polling instead of `deployment_status`

GitHub's `deployment_status` trigger only fires from the workflow file on the **default branch**, so a PR that introduces or modifies the smoke workflow can't smoke-check its own preview. Polling on `pull_request` events sidesteps that — the workflow file from the PR branch runs, polls the deployments API, and smokes whatever URL Vercel registers. Costs ~30-60s of polling per run (Vercel's typical deploy time) but works on the very PR that adds the workflow.

### Limitations

- Vercel's SSO bypass is per-project; rotating the secret in Vercel without updating the GitHub secret breaks the smoke until both sides match.
- The smoke is HTTP-only. It catches runtime crashes and missing-env-var failures, not visual regressions, perf regressions, or a11y issues. Those are tracked separately under PRE-GO-LIVE §7.4 (Lighthouse pass) and remain manual until a follow-up.
- If Vercel skips the build (paths-ignored config, ignored-build-step), no deployment exists → the smoke times out and fails. Treat this as a config issue, not a code issue.

### Manual re-run

Actions tab → **Vercel deploy smoke** → **Run workflow** → paste a deployment URL → **Run**. Useful for debugging the smoke script itself, or for re-running after fixing a flaky 5xx.

## 7. Promotion-to-production checklist

Once you're ready to take this beyond a portfolio piece, work through:

1. [`docs/PRE-GO-LIVE.md`](./PRE-GO-LIVE.md) — the full gate list (legal, GDPR, i18n, a11y, evals, community, technical, portfolio).
2. The DACH launch sub-checklist (PRE-GO-LIVE §7.1) — subscribe to an Impressum service, fill `messages/{en,de}.json` legal namespaces, flip `'de'` into `LAUNCHED_LOCALES` in `src/app/[locale]/page.tsx`.
3. The plan-tier audit above (PRE-GO-LIVE §7.7).
4. A 30-min consult with a German IT/data-protection lawyer (~€100–200 flat fee) for the privacy policy + RoPA review (ADR-0009 explicitly punts the legal sign-off to a human).
