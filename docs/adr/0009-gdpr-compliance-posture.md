# ADR-0009: GDPR compliance posture

## Status

Decided — 2026-05-24

## Context

The EU's General Data Protection Regulation (GDPR) and the German Bundesdatenschutzgesetz (BDSG) apply to Yawaragi because the service is reachable in the EU and processes personal data of EU-resident visitors (even on the EN-only deployment). Compliance is not an end-state; it is a discipline that has to be visible in every architectural decision and merge gate.

Personal-data touch points the project will have once it grows past Phase 0:

| Touch point | Personal data | Lawful basis | Vendor / location |
|---|---|---|---|
| Clerk auth (Phase 2+) | email, name, OAuth tokens | contract (Art. 6(1)(b)) | Clerk, US — needs SCCs |
| Supabase (Phase 2+) | taste profiles, corrections, ratings | consent / contract | Supabase, region TBD — pick EU region |
| Label scan (Phase 3) | uploaded bottle images | consent (Art. 6(1)(a)) | Anthropic Claude vision, US — needs SCCs; do not retain past inference |
| Chat (Phase 4) | message content, may include incidentally personal info | consent | Anthropic, US |
| Langfuse traces | redacted prompts + completions | legitimate interest (Art. 6(1)(f)) — operational debugging | Langfuse Cloud, EU region |
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

9. **Retention is documented per data type.** No data lives forever by default. Retention rules live in the RoPA below and in schema comments. Label-scan images: discarded after inference completes (no persistence). Langfuse traces: 30 days. Account data: until deletion or 24 months of inactivity, whichever first.

10. **Breach notification process exists before any user-account feature ships.** A runbook at [`docs/runbooks/breach-notification.md`](../runbooks/breach-notification.md) documents the 72-hour notification path to the supervisory authority (Art. 33), the high-risk-threshold notification path to data subjects (Art. 34), the vendor breach-coordination chain, and the post-incident log template. Drafted 2026-05-24; the maintainer + a German IT/data-protection lawyer must complete an end-to-end review before the first Phase 2 PR that introduces user accounts (Clerk integration) merges.

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

Today the project processes only the following personal-data-relevant items, all in cookies:

| Cookie | Data | Lawful basis | Retention | Notes |
|---|---|---|---|---|
| `yawaragi_age_gate` | `{v, ts}` — no identifiers | legitimate interest (JMStV compliance, Art. 6(1)(f)) | 1 year | Not strictly personal data, but documented for transparency. |
| `NEXT_LOCALE` | locale code | legitimate interest (UX) | 1 year | next-intl default. |
| `yawaragi_consent` | per-category flags + version | not personal data per se; records consent | 1 year | Used to remember and prove consent (Art. 7(1)). |

This table is updated every time a new processing operation is introduced. Treat it as code: it gets PRs.

## Consequences

- **Every PR that touches user data has GDPR review questions in its body.** Captured as a recurring checklist in `CLAUDE.md`.
- **Every new vendor integration is gated on a DPA.** PRE-GO-LIVE §7.1 enumerates the current vendor list with a checkbox per DPA.
- **Privacy policy is maintained alongside features**, not back-filled. Lives in `messages/{en,de}.json` under a `privacy` namespace once Slice 3 lands; updated in the same PR that introduces a new processing operation.
- **Architectural decisions document GDPR impact in their Consequences section.** ADR-0006 (age gate), ADR-0007 (i18n), ADR-0008 (EN-first launch) already touch GDPR-adjacent surfaces; future ADRs answer the per-PR questions above where applicable.
- **The author is not a lawyer.** Before the DACH launch, a German IT/data-protection lawyer must review the privacy policy, the cookie banner copy, the RoPA, and the DPA chain (~€200–400 for a flat-fee review).

## References

- Regulation (EU) 2016/679 (GDPR) — primary text
- Bundesdatenschutzgesetz (BDSG) — German implementation
- EDPB Guidelines 05/2020 on consent — for the cookie banner UX
- Schrems II (C-311/18) — basis for SCCs for US vendors
- ADR-0006 (age gate), ADR-0007 (i18n), ADR-0008 (EN-first launch) — sibling decisions
