## Summary

<!-- One paragraph or short bullet list of what this PR changes and why. -->

## Closes

<!-- e.g. closes #21 -->

## Review checklist

### i18n
- [ ] All new user-facing strings live in `messages/{en,de}.json` (no inline JSX literals)
- [ ] German catalogue is structurally identical to English (`messages-parity` test green)
- [ ] No forbidden promotional copy (`pnpm i18n:audit` clean)

### GDPR (per [ADR-0009](../blob/main/docs/adr/0009-gdpr-compliance-posture.md))

Only if this PR touches user data, vendors, or consent surfaces. Skip otherwise.

- [ ] **New personal-data processing?** → lawful basis documented, privacy policy updated, minimisation justified, retention declared, storage location declared.
- [ ] **New third-party vendor?** → DPA signed and linked below, data-residency declared, SCCs for non-EU, privacy policy mentions vendor.
- [ ] **Exposes stored personal data?** → access / rectification / erasure / portability all reachable.
- [ ] **New or modified consent prompt?** → no dark patterns; equal-prominence buttons; unbundled; withdrawable.
- [ ] **Data collection that should be opt-in?** → defaults to opt-in for analytics, marketing, non-functional categories.

### Verification
- [ ] `pnpm verify` runs clean locally
- [ ] CI green

### Deviations from spec
<!-- List any deviations from the linked issue's acceptance criteria, with rationale. -->
