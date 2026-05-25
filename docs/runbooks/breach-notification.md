# Breach notification runbook

> **Not a legal opinion.** A German IT/data-protection lawyer must review this document — specifically the competent-authority selection, the Art. 34 "high risk" threshold language, and the vendor contact list — **before the Clerk integration ships** (Phase 2). Until that review lands, treat this runbook as the working draft the maintainer will execute *while* coordinating with counsel, not as legally vetted instructions. See [ADR-0009 §"Lawyer review"](../adr/0009-gdpr-compliance-posture.md).

This runbook documents what the Yawaragi maintainer does when a personal-data breach is suspected or confirmed. It exists to satisfy [ADR-0009 §"Breach notification process exists before any user-account feature ships"](../adr/0009-gdpr-compliance-posture.md) and is referenced from [PRE-GO-LIVE §7.1](../PRE-GO-LIVE.md#71-legal--compliance).

A **personal-data breach** under GDPR Art. 4(12) is "a breach of security leading to the accidental or unlawful destruction, loss, alteration, unauthorised disclosure of, or access to, personal data". This includes:

- Credential compromise (Clerk session leak, Supabase service role key in a public log).
- Misconfigured access (RLS policy regression, public Supabase bucket).
- Vendor incident affecting Yawaragi data (Clerk/Supabase/Anthropic/Vercel/Langfuse breach notification received).
- Code path leaking another user's data (cross-tenant bug).
- Lost or stolen device with production credentials.
- Ransomware / wiper destroying production data without a recoverable backup.

It does **not** include: a self-discovered bug fixed before any user data was actually exposed, or a near-miss caught in CR/CI. Log those in the incident log anyway (see §5) — pattern visibility matters.

---

## 0. The 72-hour clock

Per GDPR Art. 33(1), notification to the supervisory authority is required **within 72 hours of becoming aware** of the breach. "Aware" means a reasonable degree of certainty that a breach has occurred — not "fully understood". A partial notification is required if the full picture isn't ready by hour 72 (Art. 33(4)); supplement with the rest later.

> **The clock starts when you suspect, not when you confirm.** If hour 70 arrives without certainty, file a partial Art. 33 report anyway and follow up.

For Art. 34 (notification to affected data subjects), the standard is "without undue delay" — typically interpreted as same-day-to-72-hour for high-risk breaches, faster if active exploitation is ongoing.

---

## 1. Detection → action (first 60 minutes)

Solo-maintained project: "who pages who" is "the maintainer notices, the maintainer files". This section exists so a future contributor or Claude session inherits the muscle memory.

### Triggers that start the clock

- Vendor incident email (Vercel, Clerk, Supabase, Anthropic, Langfuse) naming Yawaragi's account or a service Yawaragi depends on.
- User report ("I see someone else's data", "my account was accessed", "I got an email I shouldn't have").
- Security researcher disclosure (`security@` style email, GitHub security advisory).
- Anomaly in Langfuse traces or Vercel logs (cross-user data in a trace, unexpected admin access).
- Self-discovery during development (RLS regression visible in a query, secret in a commit).

### First 60 minutes — stop the bleed

Run these in parallel where you can. Don't optimise for tidiness; optimise for stopping the leak.

1. **Note the wall-clock time of awareness.** Write it down. This is hour 0 of the 72-hour window.
2. **Stop the leak.**
   - If a credential is compromised: rotate it immediately (Clerk, Supabase service role, `CRON_SECRET`, `ANTHROPIC_API_KEY`, Vercel deploy tokens). Revoke before you investigate.
   - If a code path is leaking: revert the deploy on Vercel (Deployments → previous good deploy → Promote to Production).
   - If a vendor is the source: follow their incident page; throttle or disable the integration if the runbook there permits.
3. **Freeze deploys.** Disable auto-deploy on Vercel (Project Settings → Git → Production Branch → pause), or push a `.vercelignore`-style freeze. Resume only after the cause is understood.
4. **Snapshot evidence before it rotates out.**
   - Vercel: download relevant request logs and runtime logs (`vercel logs <deployment>` or dashboard export). Vercel's log retention is short on Pro; pull while they exist.
   - Langfuse: export the relevant traces (their UI supports JSON export).
   - Supabase: capture `pg_stat_statements`, recent `auth.audit_log_entries`, and any relevant table rows.
   - GitHub: if a secret leaked, capture the commit SHA and the file:line. Then [revoke + rotate](https://docs.github.com/en/code-security/secret-scanning).
5. **Open an incident log entry** at `docs/incidents/YYYY-MM-DD-short-slug.md` using the template in §5. Fill in what you know; iterate.

The order above is deliberate: **rotate credentials before investigating**. Investigation can wait an hour; an open credential cannot.

### Special handling: Clerk incidents

Clerk's contract says "without undue delay" with no hour count. Treat any unconfirmed Clerk incident report (vendor email, status page anomaly, user report) as starting an internal 24h clock — if Clerk hasn't given a definitive yes/no within 24h, begin drafting the BayLDA Art. 33 notification on the assumption it's real. The 72h regulatory clock is yours, not theirs.

See also [ADR-0009 §10 "Clerk-specific handling"](../adr/0009-gdpr-compliance-posture.md) for the controlling decision.

---

## 2. Article 33 — notify the supervisory authority (within 72 hours)

### Which authority

The supervisory authority is determined by where the controller's main establishment sits — for a solo maintainer, that's the maintainer's habitual place of residence.

| Maintainer location | Competent authority | Contact |
|---|---|---|
| **Bavaria** (current default — maintainer in Munich) | Bayerisches Landesamt für Datenschutzaufsicht (BayLDA), Ansbach | <https://www.lda.bayern.de/> — has a Datenpannenmeldung (breach report) form under their Service section |
| Outside Bavaria, within Germany | The Land's data protection authority (e.g. BlnBDI for Berlin, LfDI Baden-Württemberg, HmbBfDI for Hamburg) | Directory of Länder authorities is maintained by the BfDI at <https://www.bfdi.bund.de/> |
| Outside Germany, within EU | Member-state supervisory authority where the maintainer is established | EDPB list at <https://edpb.europa.eu/about-edpb/about-edpb/members_en> |
| Cross-border processing | One-stop-shop lead authority per Art. 56 | Determined with the lead authority |

> **Confirm with counsel before filing.** Selecting the wrong authority delays the response and is itself a procedural issue. The maintainer's current residence is the working assumption; verify on the day.

BayLDA also accepts paper and email filings, but the online form is faster and produces a structured record they can act on. The BfDI (federal commissioner) is **not** the right authority for a private-sector controller in Bavaria — the BfDI's remit is federal bodies, postal/telecom, and federally-regulated sectors. The Bayerischer Landesbeauftragter für den Datenschutz (BayLfD) is also **not** correct — that office is for Bavarian public-sector bodies (state ministries, municipalities). Private-sector = BayLDA.

### What the Art. 33 report must contain

GDPR Art. 33(3) — file each of these as fully as known:

1. **Nature of the breach.** Categories and approximate number of data subjects affected; categories and approximate number of personal-data records affected.
2. **Contact point.** Name + email of the maintainer (the data subject rights contact in the privacy policy).
3. **Likely consequences** of the breach for affected data subjects.
4. **Measures taken / proposed** to address the breach and mitigate adverse effects.

If any field is "not yet known": say so explicitly and file supplementary information without undue delay (Art. 33(4)).

### Filing checklist

- [ ] Authority selected (per the table above, confirmed with counsel if available).
- [ ] All four Art. 33(3) fields filled with what's known by hour 72.
- [ ] Filing receipt / reference number captured in the incident log.
- [ ] Calendar reminder set for any commitments made in the filing (e.g. "we will update you by X").

---

## 3. Article 34 — notify affected data subjects (when "high risk")

Art. 34(1) requires notification of affected data subjects when the breach is **likely to result in a high risk to the rights and freedoms of natural persons**. The Art. 29 Working Party / EDPB guidance treats the following as high-risk indicators (non-exhaustive):

- Special-category data (Art. 9) exposed — Yawaragi explicitly does not process Art. 9 data per ADR-0009, so this should never trigger for us.
- Authentication credentials exposed (passwords, session tokens, OAuth tokens via Clerk).
- Data enabling identity fraud (combination of name + email + behaviour, especially with auth context).
- Data revealing political/religious/sexual life. Yawaragi processes alcohol-preference data — in some jurisdictions (not Germany), this can raise sensitivity concerns; document the reasoning either way.
- Inability to access one's own data (ransomware on the only copy).
- Children's data — Yawaragi is age-gated 18+ but the gate is self-declared; document the reasoning.

Art. 34(3) exemptions — when notification to data subjects is **not** required:
- Data was encrypted with appropriate, current state-of-the-art crypto and the key remains uncompromised.
- Subsequent measures have eliminated the high risk.
- Notification would involve disproportionate effort — and a public communication is made instead.

> **The "high risk" call is a legal judgement, not a technical one.** Document the reasoning either way; if in any doubt, notify. Over-notifying is allowed; under-notifying is a fine.

### What the Art. 34 notification must contain

Per Art. 34(2):

1. The nature of the breach, in **clear and plain language**.
2. Contact point for more information (the maintainer email).
3. Likely consequences.
4. Measures taken / proposed.

### How to communicate to data subjects

- **Channel.** Email via the address Clerk holds for each affected account. If email delivery is unreliable (e.g. for users with bouncing addresses), supplement with an in-app banner on next sign-in.
- **Locales.** Send in **both English and German** until ADR-0008's EN-first launch posture is lifted — Yawaragi's German-speaking users may have signed up via the EN deployment, and we cannot reliably infer their preferred language for a high-criticality communication. Lead with the user's stored locale; include the other below a separator. Templates live in `messages/{en,de}.json` under a `breach.*` namespace **(to be added when Phase 2 lands Clerk)**.
- **Tone.** Direct, not promotional, no euphemisms. "Your account email and the sake preference data you saved on Yawaragi may have been accessed by an unauthorised party between X and Y" — not "we recently experienced a security event affecting some users".
- **No promotional content piggy-backed on the notification.** Doing so would violate the Art. 5(1)(b) purpose limitation and also fail the JMStV non-promotion stance.

### Filing checklist

- [ ] High-risk determination documented in the incident log with reasoning.
- [ ] If notification required: drafted in EN + DE, reviewed against the four Art. 34(2) elements.
- [ ] Email send mechanism verified before the broadcast (test send to maintainer first).
- [ ] In-app banner deployed if email reliability is a concern.
- [ ] Send timestamp captured in the incident log.

---

## 4. Vendor breach coordination

Every vendor Yawaragi integrates with that processes personal data has a DPA-defined obligation to notify us of breaches "without undue delay". Yawaragi as controller is then responsible for onward notification under Art. 33 / 34.

> **Vendor SLAs and contact channels change.** Treat this table as a starting point. The authoritative source on the day of an incident is each vendor's current DPA + their security/status page. Re-verify the contact channel before sending.

| Vendor | Role | Where they notify us | Where we notify them | Notes |
|---|---|---|---|---|
| **Vercel** | Hosting, build, edge logs | Account email on file; status page at <https://www.vercel-status.com> | <https://vercel.com/contact> → Security; also a security disclosure programme | Pro plan retains logs longer — useful during investigation |
| **Clerk** | Auth (email, OAuth tokens) | Account email; <https://status.clerk.com> | <https://clerk.com/support> → Security | Highest-impact vendor: a Clerk breach exposes auth credentials → likely Art. 34 trigger |
| **Supabase** | Postgres, RLS, optional storage | Account email; <https://status.supabase.com> | <https://supabase.com/support> → Security | EU region selected per ADR-0009; verify region in incident scope |
| **Anthropic** | Claude API (chat, vision) | Account email; <https://status.anthropic.com> | <https://support.anthropic.com> → Security | Label-scan images are process-and-discard per ADR-0009; trace content in Langfuse is the actual exposure surface |
| **Langfuse** | LLM tracing | Account email; their status page | Their support contact | EU region; we control PII redaction in our trace payloads |

### What to ask the vendor

When a vendor notifies us:

- **Scope.** Is Yawaragi's account / project / region in the affected set? Get this in writing.
- **Categories of data.** What types of data they hold for us were touched?
- **Timeline.** Window of compromise. We need this for Art. 33's "approximate number of data subjects affected" estimate.
- **Their notification status.** Have they notified their own supervisory authority? This does not relieve us of our own Art. 33 obligation.
- **Their remediation.** Have they rotated whatever needs rotating on their side?

### Our chain to them

When we discover an issue that implicates a vendor:

- Contact via their security channel (the table above; verify on the day).
- Provide enough technical detail for them to investigate without leaking actual personal data.
- Note their case/ticket number in the incident log.

---

## 5. Incident log template

Every incident — confirmed breach OR near-miss — gets a log entry at `docs/incidents/YYYY-MM-DD-short-slug.md`. Pattern visibility is the point; the directory will start empty and ideally stay sparse.

```markdown
# Incident YYYY-MM-DD — <short title>

## Classification
- [ ] Suspected breach
- [ ] Confirmed breach
- [ ] Near-miss (no personal data actually exposed)
- [ ] Vendor incident (no Yawaragi-controlled data affected)

## Timeline (Europe/Berlin)
- **T+0 (awareness):** YYYY-MM-DD HH:MM — <how detected>
- **T+nh (containment):** <what was rotated / reverted / disabled>
- **T+nh (Art. 33 filing):** <ref number, authority>
- **T+nh (Art. 34 notification, if required):** <send timestamp, channels>
- **T+nh (resolved):** <state>

## Scope
- **Data categories affected:** <e.g. email, OAuth refresh token, taste-profile rows>
- **Number of data subjects (estimate):** <count or range>
- **Number of records:** <count or range>
- **Window of exposure:** <start–end>
- **Vendor(s) involved:** <list>

## Root cause
<1–3 paragraphs. Be honest. "Misread the RLS policy" beats "configuration anomaly".>

## Containment
<What was done to stop the leak. Credentials rotated, deploys frozen, code reverted.>

## Notification decisions
- **Art. 33 (supervisory authority):** filed / not filed — <reasoning, especially if not filed>
- **Art. 34 (data subjects):** notified / not notified — <reasoning, with reference to the high-risk indicators in §3>
- **Vendor coordination:** <tickets opened, responses received>

## Remediation
<What changed to prevent recurrence. Code, process, monitoring, schema, RLS.>

## Lessons
<What did the runbook get right? What did it get wrong? Update this runbook in the same commit.>
```

The log entry is committed to the repo. **Redact personal data before committing** — user emails, account IDs, raw trace content. The point of the log is the *shape* of the incident, not the contents.

---

## 6. After every incident — runbook maintenance

If the runbook missed something — wrong authority, stale vendor contact, a category of incident not anticipated — fix the runbook in the same PR that ships the post-incident remediation. The runbook is code; it gets PRs.

Open questions and pending tasks (track in `docs/incidents/` as they accumulate):

- Lawyer review of the authority selection, Art. 34 threshold language, and vendor contact list — gated alongside the first Phase 2 Clerk PR per ADR-0009.
- `messages/{en,de}.json` `breach.*` namespace — adds when Clerk integration lands.
- Cron / monitoring on Supabase RLS regressions (Phase 2 follow-up).
- Decision on whether to subscribe to a vendor-incident-status aggregator (StatusGator, etc.) — Phase 7 polish item.

### Sub-processor notification subscriptions

Every vendor DPA grants Yawaragi an objection window when the vendor adds or changes a sub-processor — but silence equals consent across all of them. A missed notification is a silently-accepted sub-processor change, which can be a breach of the controller's transparency obligation downstream. Subscribe to each vendor's notification mechanism at integration time and check the inbox on the cadence below.

| Vendor | Notification mechanism | Objection window |
|---|---|---|
| **Vercel** | Subscribe via `privacy@vercel.com` (opt-in; default = no notice) | 5 days |
| **Supabase** | Legal notices via dashboard + inbox filter | 5 days |
| **Clerk** | Status / security mailing list + quarterly manual page diff at <https://clerk.com/legal/subprocessors> | 10 days |
| **Anthropic** | Page watch on <https://trust.anthropic.com/subprocessors> | 15 days |
| **Langfuse** | Vendor notification email | 30 days |

**Silence = consent in all five DPAs.** When a notification arrives, log it in `docs/incidents/` as a near-miss-shaped vendor-change entry (even if no objection is filed) so the trail exists at audit time.

---

## References

- GDPR Art. 4(12) — definition of "personal data breach"
- GDPR Art. 33 — Notification of a personal data breach to the supervisory authority
- GDPR Art. 34 — Communication of a personal data breach to the data subject
- [EDPB Guidelines 9/2022 on personal data breach notification under GDPR](https://edpb.europa.eu/our-work-tools/our-documents/guidelines/guidelines-92022-personal-data-breach-notification-under_en)
- [BayLDA — Bayerisches Landesamt für Datenschutzaufsicht (homepage; Datenpannenmeldung under Service)](https://www.lda.bayern.de/)
- ADR-0009 (GDPR compliance posture) — the controlling decision
- PRE-GO-LIVE §7.1 — the launch gate this runbook satisfies
- deploying.md §4 — vendor DPA matrix
