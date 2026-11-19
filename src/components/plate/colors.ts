import { SERIES } from '@/components/charts/chartTheme'
import type { PlateLocationInfo } from '@/plate/analytics'

/** Each Plate location keeps its registry colour on every chart. */
export const plateLocationColor = (l: PlateLocationInfo) => SERIES[l.index % SERIES.length]
