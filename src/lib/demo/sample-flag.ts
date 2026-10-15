/**
 * The cookie that says "show me the sample collection". Set and cleared only
 * by `/api/sample-collection`, at the visitor's own tap or link, so it is a
 * functional cookie the visitor asked for (TTDSG §25(2) no. 2), not tracking.
 * It holds a flag, nothing about the visitor.
 */
export const SAMPLE_COLLECTION_COOKIE = 'yawaragi_sample'
