import { BRAND, SERIES } from '@/components/charts/chartTheme'
import type { TotersBranchInfo } from '@/toters/analytics'

/** Each Toters branch keeps its registry colour on every chart. */
export const branchColor = (b: TotersBranchInfo) => SERIES[b.index % SERIES.length]

/** Ginger & Co takes its logo colour; Pertutti a distinct hue that no branch uses. */
export const BRAND_COLOR: Record<string, string> = { 'ginger-and-co': BRAND, pertutti: SERIES[6] }
