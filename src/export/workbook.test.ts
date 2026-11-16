import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'
import { runAnalysis } from '@/analytics'
import { buildManualBranchDataset } from '@/import/manual'
import { datasetFrom, rawCsv, rawSheet } from '@/test/build'
import { DEFAULT_FILTERS } from '@/types/filters'
import { DEFAULT_SETTINGS } from '@/types/settings'
import { chartsOf, workbookToBuffer } from './charts'
import { buildAnalyticalWorkbook } from './workbook'

// Synthetic fixtures (same shapes as the branch tests); no real export data is used here.
const d = (day: number) => new Date(Date.UTC(2026, 9, day))
const sales = () =>
  datasetFrom(
    rawSheet([
      ['Days', 'Orders', 'Amount'],
      [d(1), '10', 'USD 500'],
      [d(2), '12', 'USD 800'],
      [d(3), '8', 'USD 300'],
    ]),
    { branchScope: { mode: 'all', branches: [] } },
  )
const branches = () =>
  buildManualBranchDataset(
    { brandId: 'ginger-and-co', platformId: 'weevi', currency: 'USD', periodStart: '2026-10-01', periodEnd: '2026-10-03', note: '', rows: [{ branch: 'Hamra', revenue: 900, orders: 18 }, { branch: 'Discount', revenue: 100, orders: 2 }] },
    'manual-test',
  )
const products = () =>
  datasetFrom(rawCsv('id,Product Name,Items Sold,Total Amount,\n1,Alpha,30,300\n2,Beta,20,250\n3,Gamma,5,40\n', 'top-chart-products-test.csv'), {
    currency: 'USD',
    periodStart: '2026-10-01',
    periodEnd: '2026-10-03',
  })

const build = async (datasets: ReturnType<typeof sales>[], branchView: 'separate' | 'combined' = 'separate') => {
  const result = runAnalysis(datasets, { ...DEFAULT_FILTERS, from: '2026-10-01', to: '2026-10-03', branchView }, DEFAULT_SETTINGS)
  const wb = await buildAnalyticalWorkbook(result, { title: 'Test report', generatedAt: new Date(0), settings: DEFAULT_SETTINGS })
  const zip = await JSZip.loadAsync(await workbookToBuffer(wb))
  return { result, wb, zip }
}

describe('analytical workbook — design and charts', () => {
  it('keeps the core sheets and adds native charts bound to sheet ranges', async () => {
    const { wb, zip } = await build([sales(), branches(), products()])
    const names = wb.worksheets.map((s) => s.name)
    for (const n of ['Executive Summary', 'Daily Sales', 'Branch Performance', 'Platform Performance', 'Product Rankings', 'Data Quality', 'Cleaned Data']) expect(names).toContain(n)

    const charts = chartsOf(wb)
    expect(charts.map((c) => `${c.sheet}:${c.type}`).sort()).toEqual([
      'Branch Performance:bar',
      'Daily Sales:line',
      'Executive Summary:bar',
      'Executive Summary:line',
      'Product Rankings:bar',
    ])
    // Single platform → no platform chart.
    expect(charts.some((c) => c.sheet === 'Platform Performance')).toBe(false)

    expect(Object.keys(zip.files).filter((f) => /^xl\/charts\/chart\d+\.xml$/.test(f))).toHaveLength(5)
    const types = await zip.file('[Content_Types].xml')!.async('string')
    expect(types).toContain('drawingml.chart+xml')
    const chart = await zip.file('xl/charts/chart1.xml')!.async('string')
    expect(chart).toContain("<c:f>'Daily Sales'!$A$")
    // The drawing element sits at worksheet level, after page setup (not inside a rule's extLst).
    for (const f of Object.keys(zip.files).filter((x) => /^xl\/worksheets\/sheet\d+\.xml$/.test(x))) {
      const xml = await zip.file(f)!.async('string')
      if (!xml.includes('<drawing ')) continue
      expect(xml.indexOf('<drawing ')).toBeGreaterThan(xml.lastIndexOf('</conditionalFormatting>'))
      expect(xml.indexOf('<drawing ')).toBeGreaterThan(xml.indexOf('</sheetData>'))
    }
  })

  it('writes figures unchanged and labels product shares as shares', async () => {
    const { wb, result } = await build([sales(), branches(), products()])
    const daily = wb.getWorksheet('Daily Sales')!
    const revenues: number[] = []
    daily.getColumn(3).eachCell((c) => typeof c.value === 'number' && revenues.push(c.value))
    expect(revenues.slice(0, 3)).toEqual(result.daily.map((x) => x.revenue))
    // Dates are written as real Excel dates (displayed as e.g. "Thu 01 Oct 2026").
    const firstDataRow = daily.getColumn(3).values.findIndex((v) => v === 500)
    expect(daily.getCell(firstDataRow, 1).value).toEqual(new Date(Date.UTC(2026, 9, 1)))

    const ranking = wb.getWorksheet('Product Rankings')!
    const headers: string[] = []
    ranking.eachRow((r) => r.eachCell((c) => typeof c.value === 'string' && headers.push(c.value)))
    expect(headers).toContain('Share of product amount (USD)')
    expect(headers).not.toContain('Revenue contribution (USD)')
  })

  it('combined view: one Hamra + Discount row, so no branch chart', async () => {
    const { wb } = await build([sales(), branches()], 'combined')
    const rows: unknown[][] = []
    wb.getWorksheet('Branch Performance')!.eachRow((r) => rows.push((r.values as unknown[]).slice(1)))
    expect(rows.filter((r) => r[0] === 'Hamra + Discount')).toHaveLength(1)
    expect(rows.find((r) => r[0] === 'Hamra')).toBeUndefined()
    expect(chartsOf(wb).some((c) => c.title.startsWith('Revenue by branch'))).toBe(false)
  })

  it('handles missing datasets gracefully', async () => {
    const onlyProducts = await build([products()])
    expect(onlyProducts.wb.getWorksheet('Daily Sales')).toBeUndefined()
    expect(chartsOf(onlyProducts.wb).map((c) => c.sheet)).toEqual(['Product Rankings'])

    const empty = await build([])
    expect(empty.wb.worksheets.map((s) => s.name)).toEqual(['Executive Summary', 'Data Quality'])
    expect(Object.keys(empty.zip.files).some((f) => f.startsWith('xl/charts/'))).toBe(false)
  })
})
