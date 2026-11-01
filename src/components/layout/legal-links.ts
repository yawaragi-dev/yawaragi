/**
 * The two legal documents every app screen must reach (§5 TMG / §18 MStV:
 * the Impressum "unmittelbar erreichbar"; GDPR Art. 13 for the privacy
 * notice). One list, so the end-of-screen block (`<LegalFooter />`) and the
 * camera's own line (`<CameraCapture />`, which has no end-of-screen block)
 * cannot drift apart. `messageKey` is in the `footer` namespace.
 */
export const LEGAL_LINKS = [
  { href: '/imprint', messageKey: 'imprintLink', testIdPart: 'imprint' },
  { href: '/privacy', messageKey: 'privacyLink', testIdPart: 'privacy' },
] as const
