import { SERIES } from '@/components/charts/chartTheme'
import type { FoodyBranchInfo } from '@/foody/analytics'

/** Each Foody branch keeps its registry colour on every chart. */
export const foodyBranchColor = (b: FoodyBranchInfo) => SERIES[b.index % SERIES.length]
