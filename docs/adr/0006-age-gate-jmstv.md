# Self-declared 18+ age gate (JMStV / JuSchG compliance)

A self-declared 18+ confirmation modal is shown on first visit and persisted in a cookie with a 1-year expiry. No flavor data, brand pages, recommendations, or label scans render before the user accepts. The gate lives in `src/components/legal/age-gate.tsx` and is enforced by `src/proxy.ts` (Next 16's renamed middleware), which consults the canonical allowlist in `src/lib/legal/age-gate-cookie.ts#isGatedPath`. The cookie banner (GDPR) is a separate component from the age gate (JMStV) — they answer different legal questions and must not be conflated.

We chose self-declaration rather than a KJM-approved Altersverifikationssystem (AVS) because Germany's JMStV §6(5) restricts alcohol advertising to minors, but the JuSchG / KJM framework distinguishes between **information / education products** (self-declaration sufficient) and **DTC sales or adult content** (AVS required). Yawaragi in its v1 form is an information and education tool — no checkout, no purchase, no adult content — so it sits on the lower threshold. This matches the de-facto German industry standard for wine/spirits information sites. The AVS path is preserved as a future escalation trigger, not a current requirement.

## Consequences

- All product copy throughout the app must be non-promotional. Forbidden phrases ("buy now", "don't miss", "limited time", "exclusive", "Vergiss nicht zu kaufen", "Nur heute", "Verpasse nicht") are enforced by manual review during the pre-go-live checklist and a `pnpm i18n:audit` grep. Allowed framing: "discover", "learn", "explore", "entdecken", "erfahren", "kennenlernen".
- The product must never depict drinking, never imply social/sexual/professional success from consumption, never imply medicinal benefit (JMStV §6(5), Deutscher Werberat guidelines).
- An Impressum page (§5 TMG) is required and lives at `/imprint`.
- The AVS escalation is triggered if Yawaragi later adds: direct purchase (DTC), affiliate checkout that completes inside the Yawaragi UI, or user-generated content that could be classified as advertising. None of these are in v1 scope.
