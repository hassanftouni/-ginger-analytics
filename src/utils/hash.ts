/** FNV-1a 32-bit hash as 8 hex characters. Fast, deterministic, not cryptographic. */
export function fnv1a(text: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16).padStart(8, '0')
}

/** Content fingerprint of normalized records, used to detect re-uploads under another file name. */
export function fingerprintRecords(records: unknown[]): string {
  return `${records.length}-${fnv1a(JSON.stringify(records))}`
}

/** Stable anonymised label for a customer reference (no personal data). */
export function anonymiseCustomer(customerId: string): string {
  return `CUST-${fnv1a(customerId).slice(0, 6).toUpperCase()}`
}
