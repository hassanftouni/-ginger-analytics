/**
 * Chart tokens from the validated reference palette (dataviz skill, light mode).
 * Categorical hues are assigned in this fixed order and never cycled.
 */
export const SERIES = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'] as const

/** Ginger & Co logo magenta — used for single-series charts on the web dashboard. */
export const BRAND = '#d20469'

export const CHART = {
  primary: BRAND,
  grid: '#e2e8f0',
  axis: '#64748b',
  text: '#0f172a',
  muted: '#94a3b8',
  fontSize: 12,
}

export const axisProps = {
  stroke: CHART.grid,
  tick: { fill: CHART.axis, fontSize: CHART.fontSize },
  tickLine: false,
} as const
