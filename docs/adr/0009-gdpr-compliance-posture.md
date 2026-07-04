# ADR-0009: GDPR compliance posture

## Status

Decided — 2026-05-24

## Context

The EU's General Data Protection Regulation (GDPR) and the German Bundesdatenschutzgesetz (BDSG) apply to Yawaragi because the service is reachable in the EU and processes personal data of EU-resident visitors (even on the EN-only deployment). Compliance is not an end-state; it is a discipline that has to be visible in every architectural decision and merge gate.

Personal-data touch points the project will have once it grows past Phase 0:

| Touch point | Personal data | Lawful basis | Vendor / location |
|---|---|---|---|
| Clerk auth (Phase 2+) | email, name, OAuth tokens | contract (Art. 6(1)(b)) | Clerk, US — DPF + SCCs |
| Supabase (Phase 2+) | taste profiles, corrections, ratings | consent / contract | Supabase, `eu-central-1` Frankfurt |
| Label scan (Phase 3) | uploaded bottle images | consent (Art. 6(1)(a)) | Anthropic Claude vision, US — SCCs; Yawaragi does not persist past inference, but Anthropic retains up to 7 days (see §9) |
| Chat (Phase 4) | message content, may include incidentally personal info | consent | Anthropic, US — SCCs; 7d provider retention |
| Langfuse traces | redacted prompts + completions | legitimate interest (Art. 6(1)(f)) — operational debugging | Langfuse Cloud, `eu-west-1` Ireland |
| Analytics (Phase 7+) | usage events, no identifiers | consent (Art. 6(1)(a)) | provider TBD; only if user opts in via cookie banner |
| Cookies (today) | age-gate, locale, consent flags | (necessary) / consent | self |

None of the integrations beyond cookies are wired up yet. This ADR is the prospective rulebook that every later phase compiles against.

## Decision

1. **Privacy by default.** Every new feature starts from \"no personal data collected\" and adds processing only when justified, documented, and minimised.

2. **Documented lawful basis per processing operation.** Every record type that holds personal data carries a `lawfulBasis` field in its Zod schema **or** is documented in the RoPA (Records of Processing Activities) section of this ADR, kept in sync with the code. Acceptable values: `consent`, `contract`, `legitimate_interest`, `legal_obligation`. No other values without an ADR update.

3. **Consent is granular, withdrawable, and recorded.** The cookie banner (ADR-0006 sibling; implemented in Slice 4) collects per-category consent (analytics, marketing) with no pre-ticked boxes and equal-prominence Accept/Reject buttons. A persistent footer link reopens the banner pre-filled with the current decision (\"withdraw as easily as you gave it\" — Art. 7(3)). Consent is versioned; bumping the version re-prompts.

4. **Data minimisation as the default architectural question.** When designing a feature, the FIRST design question is \"what is the smallest set of personal data this needs to function?\" not \"what would be useful to collect?\". A feature that wants more data than necessary is a redesign signal.

5. **Vendor DPAs are blocking dependencies.** A third-party SaaS vendor cannot be integrated until a Data Processing Agreement (DPA) is signed AND, for non-EU vendors, Standard Contractual Clauses (SCCs) are in place. This is checklist-gated in PRE-GO-LIVE §7.1.

6. **Data residency: EU-preferred where the vendor offers choice.** Supabase, Langfuse, and any future analytics provider must be configured with EU region selection where available.

7. **No special-category data.** Yawaragi does not collect or infer GDPR Article 9 special categories (health, religion, race, biometric identifiers, sexual orientation). The label scan flow must not be repurposed for biometric processing — if a future scan-related feature would ever extract face/identity signals, that triggers a DPIA and is out of scope of this ADR.

8. **User rights are implementable, not just promised.** Before the DACH launch (and ideally before any public launch with user accounts), the following must be reachable and tested end-to-end:
   - Access: a user can export the personal data we hold on them.
   - Rectification: a user can correct stored fields.
   - Erasure: a user can delete their account; cascade is verified.
   - Portability: export is in a structured machine-readable format (JSON).
   - Objection / restriction: a user can pause processing.
   - Withdrawal of consent: the cookie banner withdraw flow ✓ (Slice 4).

9. **Retention is documented per data type.** No data lives forever by default. Retention rules live in the RoPA below and in schema comments. Label-scan images: Yawaragi does not persist label-scan images past the inference call. The inference provider (Anthropic) retains inputs/outputs for up to 7 days for trust-and-safety purposes per their standard Commercial Terms (reduced from 30 days on 2025-09-14; an organization may opt into 30-day retention via DPA addendum for audit purposes — we do not). This is disclosed in the privacy policy and the label-scan UI. Note that the September 2025 Anthropic Consumer Terms / Privacy Policy update introducing **5-year retention with training opt-in for Free/Pro/Max accounts does NOT apply to Commercial Terms / API usage** — Yawaragi consumes Anthropic exclusively via the API and is therefore unaffected. Pre-DACH-launch action: negotiate Zero Data Retention (ZDR) with Anthropic sales. Langfuse traces: 30 days. Account data: until deletion or 24 months of inactivity, whichever first.

10. **Breach notification process exists before any user-account feature ships.** A runbook at [`docs/runbooks/breach-notification.md`](../runbooks/breach-notification.md) documents the 72-hour notification path to the supervisory authority (Art. 33), the high-risk-threshold notification path to data subjects (Art. 34), the vendor breach-coordination chain, and the post-incident log template. Drafted 2026-05-24; the maintainer + a German IT/data-protection lawyer must complete an end-to-end review before the first Phase 2 PR that introduces user accounts (Clerk integration) merges.

    **Clerk-specific handling.** Clerk's DPA commits to notification "without undue delay" with no concrete hour SLA. Yawaragi's BayLDA Art. 33 clock is 72h from awareness, so a slow vendor confirmation eats the regulator-facing budget. Any unconfirmed Clerk incident (vendor email, status-page anomaly, user report) starts an internal **self-imposed 24h clock**: if Clerk has not given a definitive yes/no within 24h, the maintainer begins drafting the BayLDA notification on the assumption it's real. See [`docs/runbooks/breach-notification.md` §1 "Special handling: Clerk incidents"](../runbooks/breach-notification.md#1-detection--action-first-60-minutes) for the operational steps.

## Per-PR GDPR review questions

Every PR that introduces or modifies a feature touching user data answers these in the PR body before merge. If the answer to any question is \"yes\" and the PR doesn't address the follow-up, the PR doesn't merge.

1. **Does this PR introduce new personal-data processing?** If yes:
   - What's the lawful basis? (Cite the GDPR article.)
   - Is the privacy policy updated to reflect the new processing?
   - Is the data minimised? (Why are we collecting it; what's the smallest sufficient subset?)
   - What's the retention period? (Documented where?)
   - Where is it stored? Who has access?
2. **Does this PR add a new third-party vendor?** If yes:
   - Is a DPA signed and on file?
   - Where does the vendor process data (EU/US/elsewhere)? For non-EU, are SCCs in place?
   - Is the privacy policy updated to name the vendor?
3. **Does this PR expose stored personal data to users?** If yes:
   - Can the user export it? (Access / portability rights.)
   - Can the user correct it? (Rectification.)
   - Can the user delete it? (Erasure with cascade.)
4. **Does this PR add a new consent prompt or modify an existing one?** If yes:
   - Are Accept/Reject equally prominent?
   - Is the choice unbundled (no \"accept all or nothing\")?
   - Can consent be withdrawn as easily as given?
5. **Does this PR add data-collection that should be opt-in?** Default to opt-in for analytics, marketing, and any non-functional category.

These questions also belong in any ADR that touches user data. The ADR's \"Consequences\" section should answer them explicitly.

## Records of Processing Activities (RoPA) — current state

### Phase 0 cookies (live today)

| Cookie | Data | Lawful basis | Retention | Notes |
|---|---|---|---|---|
| `yawaragi_age_gate` | `{v, ts}` — no identifiers | legitimate interest (JMStV compliance, Art. 6(1)(f)) | 1 year | Not strictly personal data, but documented for transparency. |
| `NEXT_LOCALE` | locale code | legitimate interest (UX) | 1 year | next-intl default. |
| `yawaragi_consent` | per-category flags + version | not personal data per se; records consent | 1 year | Used to remember and prove consent (Art. 7(1)). |
| `yawaragi_session` | signed `{v, ts, sid}` — opaque random sid, no identifiers | legitimate interest (cost protection of paid AI APIs, Art. 6(1)(f)) | 24h from issuance | Phase 3 / S2 (#107); writer moved from server actions to the proxy middleware in Phase 4 / S5 (#161) so RSC-invoked actions can stay read-only. Pairs with a transient salted SHA-256 of the visitor IP (kept only as a KV query key under the same 24h TTL — never written to a DB or log) to cap per-visitor calls on the vision-scan and suggestions surfaces. Post-#161 the cookie is stamped by the proxy on a visitor's first request to any gated route (previously: issued on first paid-API call); scope of processing (rate-limit budget key) is unchanged. Cookie is signed (HMAC-SHA256, `SESSION_COOKIE_SECRET`) so a forged sid can't reset the budget. Vendor: Upstash, Inc. (EU region, e.g. eu-central-1 Frankfurt) — see vendor row below. |

### Vendor processing operations (Phase 2+; from the 2026-05-25 DPA review)

These rows describe the processing posture each vendor will enter at the point they go live. Status as of Phase 2 Slice 4 (Brand tracer bullet — Supabase reference mirror): **Vercel** is live (current deployment); **Supabase** is live with the Sakenowa reference mirror only (no personal data; documented for transparency); the rest remain forward-looking. The table is the gating spec for each vendor's go-live.

| Vendor | Role | Data categories | Location | Transfer mechanism | Retention | Sub-processor list |
|---|---|---|---|---|---|---|
| **Vercel** | processor (Customer Data) + independent controller (Service-Generated Data) | request logs, build artefacts, edge runtime logs | US | DPF + SCCs (fallback) | ~1 day Pro runtime-log retention; indefinite build logs | <https://security.vercel.com> |
| **Supabase** | processor (DB) + independent controller (Usage Data) | Phase 2 today: Sakenowa reference mirror (brand/brewery/flavor-chart/rankings — **no personal data**, documented for transparency). Phase 2.5+: account-linked rows (taste profiles, corrections, ratings) and service usage metrics. Per [ADR-0010](./0010-pg-direct-vs-supabase-js-for-user-data.md) user-scoped reads route through supabase-js + Clerk JWT (RLS enforced); pg-direct stays for admin / ingest / public data. Per [ADR-0011](./0011-per-env-data-isolation.md) Production and Preview share one Supabase project today; the first user-scoped slice triggers Pro upgrade + Branches enablement so per-PR DBs isolate Preview from Production. | `eu-central-1` Frankfurt | SCCs Module 2/3 | 7-day backup retention on Pro tier (Free has no managed PITR — upgrade is a pre-launch gate per PRE-GO-LIVE §7.7) | DPA Schedule 3 |
| **Clerk** | processor | email, name, OAuth tokens, session metadata | US (no EU region) | DPF + SCCs (fallback) | 90-day post-termination delete | <https://clerk.com/legal/subprocessors> |
| **Anthropic** | processor | label-scan images, chat messages, redacted prompts/completions | US (no EU region on direct API) | SCCs only (no DPF) | **7 days default since 2025-09-14 (was 30); opt-in 30-day audit retention available via DPA addendum — we do not opt in. ZDR still pending sales negotiation.** | <https://trust.anthropic.com/subprocessors> |
| **Langfuse** | processor | redacted prompts + completions, trace metadata | `eu-west-1` Ireland | SCC fallback unused at residency | 30 days (configured at project level) | <https://langfuse.com/security/subprocessors> |
| **Upstash** | processor | rate-limit budget store: salted SHA-256 of visitor IP + opaque `yawaragi_session.sid` — both keyed only (never plaintext); no account identifiers | EU region (e.g. `eu-central-1` Frankfurt) — selected at database provisioning time | EU SCCs (data does not leave the EU region) | 24h (TTL applied on every write; abandoned sessions garbage-collect at the window boundary) | <https://upstash.com/trust> — **DPA: pending signature before Production deployment** (see consequences below) |

This table is updated every time a new processing operation is introduced or a vendor's posture changes (region, retention, sub-processor list, transfer mechanism). Treat it as code: it gets PRs.

## Consequences

- **Every PR that touches user data has GDPR review questions in its body.** Captured as a recurring checklist in `CLAUDE.md`.
- **Every new vendor integration is gated on a DPA.** PRE-GO-LIVE §7.1 enumerates the current vendor list with a checkbox per DPA.
- **Privacy policy is maintained alongside features**, not back-filled. Lives in `messages/{en,de}.json` under a `privacy` namespace once Slice 3 lands; updated in the same PR that introduces a new processing operation.
- **Architectural decisions document GDPR impact in their Consequences section.** ADR-0006 (age gate), ADR-0007 (i18n), ADR-0008 (EN-first launch) already touch GDPR-adjacent surfaces; future ADRs answer the per-PR questions above where applicable.
- **The author is not a lawyer.** Before the DACH launch, a German IT/data-protection lawyer must review the privacy policy, the cookie banner copy, the RoPA, and the DPA chain (~€200–400 for a flat-fee review).
- **Schrems-III watch item.** All three US vendors in the current stack — Vercel, Clerk, Anthropic — rely on the EU–US Data Privacy Framework with SCCs as the fallback transfer mechanism. A Schrems-III-style invalidation of the DPF would force a simultaneous re-evaluation of all three at once: SCC supplementary measures, in-scope data minimisation, or substitution by an EU-resident alternative. Track as a Phase 7 watch item; revisit if EU–US adequacy litigation reaches the CJEU.

## References

- Regulation (EU) 2016/679 (GDPR) — primary text
- Bundesdatenschutzgesetz (BDSG) — German implementation
- EDPB Guidelines 05/2020 on consent — for the cookie banner UX
- Schrems II (C-311/18) — basis for SCCs for US vendors
- ADR-0006 (age gate), ADR-0007 (i18n), ADR-0008 (EN-first launch) — sibling decisions
