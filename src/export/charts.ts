import type { Workbook } from 'exceljs'
import { PALETTE } from './theme'

/**
 * Native Excel charts. ExcelJS cannot write charts, so the workbook records chart specs here and
 * `workbookToBuffer` adds DrawingML chart parts to the saved .xlsx. Every series references
 * worksheet cells (so charts stay live and editable) and carries a value cache so they render
 * immediately. Charts only visualise values already written to the sheets.
 */

export interface CellRange {
  sheet: string
  col: number
  firstRow: number
  lastRow: number
}

export interface ChartSpec {
  /** Sheet the chart is drawn on. */
  sheet: string
  type: 'line' | 'bar' | 'column'
  title: string
  /** Top-left cell (1-based) and bottom-right cell (1-based, exclusive) of the chart frame. */
  from: { col: number; row: number }
  to: { col: number; row: number }
  categories: CellRange & { values: (string | number)[]; dates?: boolean }
  series: { name: string; range: CellRange; values: (number | null | undefined)[]; color?: string }[]
  valueFormat: string
  /** Bar/column: show values on the bars and hide the value axis. */
  dataLabels?: boolean
}

const registry = new WeakMap<Workbook, ChartSpec[]>()

export function addChart(wb: Workbook, spec: ChartSpec) {
  const list = registry.get(wb) ?? []
  list.push(spec)
  registry.set(wb, list)
}

export function chartsOf(wb: Workbook): ChartSpec[] {
  return registry.get(wb) ?? []
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const unesc = (s: string) => s.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')

function colLetter(col: number) {
  let s = ''
  for (let n = col; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s
  return s
}

const ref = (r: CellRange) => `'${r.sheet.replace(/'/g, "''")}'!$${colLetter(r.col)}$${r.firstRow}:$${colLetter(r.col)}$${r.lastRow}`

/** Excel serial date for a "YYYY-MM-DD" string. */
export function excelSerial(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number)
  return (Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86400000
}

const text = (sz: number, color: string, bold = false) =>
  `<c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="${sz}" b="${bold ? 1 : 0}"><a:solidFill><a:srgbClr val="${color}"/></a:solidFill><a:latin typeface="Calibri"/></a:defRPr></a:pPr><a:endParaRPr lang="en-US"/></a:p></c:txPr>`
const noLine = '<c:spPr><a:ln><a:noFill/></a:ln></c:spPr>'
const axisLine = `<c:spPr><a:ln w="9525"><a:solidFill><a:srgbClr val="${PALETTE.rule}"/></a:solidFill></a:ln></c:spPr>`
const gridlines = `<c:majorGridlines><c:spPr><a:ln w="6350"><a:solidFill><a:srgbClr val="${PALETTE.border}"/></a:solidFill></a:ln></c:spPr></c:majorGridlines>`

function categoryXml(spec: ChartSpec) {
  const c = spec.categories
  const pts = (fmt: (v: string | number) => string) => c.values.map((v, i) => `<c:pt idx="${i}"><c:v>${fmt(v)}</c:v></c:pt>`).join('')
  if (c.dates) {
    return `<c:cat><c:numRef><c:f>${esc(ref(c))}</c:f><c:numCache><c:formatCode>dd mmm yyyy</c:formatCode><c:ptCount val="${c.values.length}"/>${pts((v) => String(typeof v === 'string' ? excelSerial(v) : v))}</c:numCache></c:numRef></c:cat>`
  }
  return `<c:cat><c:strRef><c:f>${esc(ref(c))}</c:f><c:strCache><c:ptCount val="${c.values.length}"/>${pts((v) => esc(String(v)))}</c:strCache></c:strRef></c:cat>`
}

function valuesXml(s: ChartSpec['series'][number]) {
  const pts = s.values.map((v, i) => (typeof v === 'number' && Number.isFinite(v) ? `<c:pt idx="${i}"><c:v>${v}</c:v></c:pt>` : '')).join('')
  return `<c:val><c:numRef><c:f>${esc(ref(s.range))}</c:f><c:numCache><c:formatCode>General</c:formatCode><c:ptCount val="${s.values.length}"/>${pts}</c:numCache></c:numRef></c:val>`
}

const dataLabels = (fmt: string) =>
  `<c:dLbls><c:numFmt formatCode="${esc(fmt)}" sourceLinked="0"/><c:spPr><a:noFill/><a:ln><a:noFill/></a:ln></c:spPr>${text(900, PALETTE.body, true)}<c:dLblPos val="outEnd"/><c:showLegendKey val="0"/><c:showVal val="1"/><c:showCatName val="0"/><c:showSerName val="0"/><c:showPercent val="0"/><c:showBubbleSize val="0"/></c:dLbls>`

export function chartXml(spec: ChartSpec): string {
  const CAT = 500100
  const VAL = 500200
  const color = (i: number) => spec.series[i].color ?? [PALETTE.accent, PALETTE.ink, PALETTE.faint][i % 3]
  let plot: string
  let axes: string

  if (spec.type === 'line') {
    const sers = spec.series
      .map(
        (s, i) =>
          `<c:ser><c:idx val="${i}"/><c:order val="${i}"/><c:tx><c:v>${esc(s.name)}</c:v></c:tx><c:spPr><a:ln w="28575" cap="rnd"><a:solidFill><a:srgbClr val="${color(i)}"/></a:solidFill><a:round/></a:ln></c:spPr><c:marker><c:symbol val="circle"/><c:size val="5"/><c:spPr><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill><a:ln w="15875"><a:solidFill><a:srgbClr val="${color(i)}"/></a:solidFill></a:ln></c:spPr></c:marker>${categoryXml(spec)}${valuesXml(s)}<c:smooth val="0"/></c:ser>`,
      )
      .join('')
    plot = `<c:lineChart><c:grouping val="standard"/><c:varyColors val="0"/>${sers}<c:marker val="1"/><c:axId val="${CAT}"/><c:axId val="${VAL}"/></c:lineChart>`
    const n = spec.categories.values.length
    const catAx = spec.categories.dates
      ? `<c:dateAx><c:axId val="${CAT}"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="b"/><c:numFmt formatCode="d mmm" sourceLinked="0"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="low"/>${axisLine}${text(900, PALETTE.muted)}<c:crossAx val="${VAL}"/><c:crosses val="autoZero"/><c:auto val="1"/><c:lblOffset val="100"/><c:baseTimeUnit val="days"/><c:majorUnit val="${Math.max(1, Math.ceil(n / 10))}"/><c:majorTimeUnit val="days"/></c:dateAx>`
      : `<c:catAx><c:axId val="${CAT}"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="b"/><c:numFmt formatCode="General" sourceLinked="1"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="low"/>${axisLine}${text(900, PALETTE.muted)}<c:crossAx val="${VAL}"/><c:crosses val="autoZero"/><c:auto val="1"/><c:lblAlgn val="ctr"/><c:lblOffset val="100"/><c:noMultiLvlLbl val="0"/></c:catAx>`
    axes = `${catAx}<c:valAx><c:axId val="${VAL}"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="l"/>${gridlines}<c:numFmt formatCode="${esc(spec.valueFormat)}" sourceLinked="0"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/>${noLine}${text(900, PALETTE.muted)}<c:crossAx val="${CAT}"/><c:crosses val="autoZero"/><c:crossBetween val="between"/></c:valAx>`
  } else {
    const horizontal = spec.type === 'bar'
    const labels = spec.dataLabels ?? true
    const sers = spec.series
      .map(
        (s, i) =>
          `<c:ser><c:idx val="${i}"/><c:order val="${i}"/><c:tx><c:v>${esc(s.name)}</c:v></c:tx><c:spPr><a:solidFill><a:srgbClr val="${color(i)}"/></a:solidFill><a:ln><a:noFill/></a:ln></c:spPr><c:invertIfNegative val="0"/>${labels ? dataLabels(spec.valueFormat) : ''}${categoryXml(spec)}${valuesXml(s)}</c:ser>`,
      )
      .join('')
    plot = `<c:barChart><c:barDir val="${horizontal ? 'bar' : 'col'}"/><c:grouping val="clustered"/><c:varyColors val="0"/>${sers}<c:gapWidth val="55"/><c:axId val="${CAT}"/><c:axId val="${VAL}"/></c:barChart>`
    axes =
      `<c:catAx><c:axId val="${CAT}"/><c:scaling><c:orientation val="${horizontal ? 'maxMin' : 'minMax'}"/></c:scaling><c:delete val="0"/><c:axPos val="${horizontal ? 'l' : 'b'}"/><c:numFmt formatCode="General" sourceLinked="1"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/>${axisLine}${text(900, PALETTE.body)}<c:crossAx val="${VAL}"/><c:crosses val="autoZero"/><c:auto val="1"/><c:lblAlgn val="ctr"/><c:lblOffset val="100"/><c:noMultiLvlLbl val="0"/></c:catAx>` +
      `<c:valAx><c:axId val="${VAL}"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="${labels ? 1 : 0}"/><c:axPos val="${horizontal ? 'b' : 'l'}"/>${labels ? '' : gridlines}<c:numFmt formatCode="${esc(spec.valueFormat)}" sourceLinked="0"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/>${noLine}${text(900, PALETTE.muted)}<c:crossAx val="${CAT}"/><c:crosses val="${horizontal ? 'max' : 'autoZero'}"/><c:crossBetween val="between"/></c:valAx>`
  }

  const legend = spec.series.length > 1 ? `<c:legend><c:legendPos val="t"/><c:overlay val="0"/>${text(900, PALETTE.body)}</c:legend>` : ''
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    '<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    '<c:roundedCorners val="0"/><c:chart>' +
    `<c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="1200" b="1"/></a:pPr><a:r><a:rPr lang="en-US" sz="1200" b="1"><a:solidFill><a:srgbClr val="${PALETTE.ink}"/></a:solidFill><a:latin typeface="Calibri"/></a:rPr><a:t>${esc(spec.title)}</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/></c:title>` +
    `<c:autoTitleDeleted val="0"/><c:plotArea><c:layout/>${plot}${axes}<c:spPr><a:noFill/><a:ln><a:noFill/></a:ln></c:spPr></c:plotArea>${legend}<c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/></c:chart>` +
    `<c:spPr><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill><a:ln w="9525"><a:solidFill><a:srgbClr val="${PALETTE.border}"/></a:solidFill></a:ln></c:spPr>` +
    `${text(900, PALETTE.body)}</c:chartSpace>`
  )
}

function drawingXml(anchors: { spec: ChartSpec; relId: string; id: number }[]) {
  const body = anchors
    .map(
      ({ spec, relId, id }) =>
        `<xdr:twoCellAnchor editAs="oneCell"><xdr:from><xdr:col>${spec.from.col - 1}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${spec.from.row - 1}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:to><xdr:col>${spec.to.col - 1}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${spec.to.row - 1}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to>` +
        `<xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="${id + 1}" name="${esc(spec.title)}"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr><xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" r:id="${relId}"/></a:graphicData></a:graphic></xdr:graphicFrame><xdr:clientData/></xdr:twoCellAnchor>`,
    )
    .join('')
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">${body}</xdr:wsDr>`
}

const attr = (tag: string, name: string) => {
  const m = new RegExp(`\\s${name.replace(':', '\\:')}="([^"]*)"`).exec(tag)
  return m ? unesc(m[1]) : undefined
}

const REL_DRAWING = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing'
const REL_CHART = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart'

/** Adds chart parts for the given specs to a saved .xlsx package. */
export async function injectCharts(buffer: ArrayBuffer | Uint8Array, specs: ChartSpec[]): Promise<ArrayBuffer> {
  const { default: JSZip } = await import('jszip')
  const zip = await JSZip.loadAsync(buffer)
  if (specs.length === 0) return zip.generateAsync({ type: 'arraybuffer', compression: 'DEFLATE' })

  const read = async (path: string) => {
    const f = zip.file(path)
    if (!f) throw new Error(`Workbook part missing: ${path}`)
    return f.async('string')
  }
  const workbookXml = await read('xl/workbook.xml')
  const workbookRels = await read('xl/_rels/workbook.xml.rels')
  const targets = new Map<string, string>()
  for (const tag of workbookRels.match(/<Relationship\b[^>]*>/g) ?? []) {
    const id = attr(tag, 'Id')
    const target = attr(tag, 'Target')
    if (id && target) targets.set(id, target.replace(/^\/?xl\//, ''))
  }
  const sheetPath = new Map<string, string>()
  for (const tag of workbookXml.match(/<sheet\b[^>]*>/g) ?? []) {
    const name = attr(tag, 'name')
    const rid = attr(tag, 'r:id')
    const target = rid ? targets.get(rid) : undefined
    if (name && target) sheetPath.set(name, `xl/${target}`)
  }

  const bySheet = new Map<string, ChartSpec[]>()
  for (const s of specs) bySheet.set(s.sheet, [...(bySheet.get(s.sheet) ?? []), s])

  let types = await read('[Content_Types].xml')
  let chartNo = 0
  let drawingNo = 0
  while (zip.file(`xl/drawings/drawing${drawingNo + 1}.xml`)) drawingNo++

  for (const [sheetName, sheetSpecs] of bySheet) {
    const path = sheetPath.get(sheetName)
    if (!path) throw new Error(`Chart sheet not found: ${sheetName}`)
    let sheetXml = await read(path)
    if (/<drawing\b/.test(sheetXml)) throw new Error(`Sheet already has a drawing: ${sheetName}`)
    drawingNo++
    const anchors = sheetSpecs.map((spec, i) => {
      chartNo++
      zip.file(`xl/charts/chart${chartNo}.xml`, chartXml(spec))
      types = types.replace('</Types>', `<Override PartName="/xl/charts/chart${chartNo}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/></Types>`)
      return { spec, relId: `rId${i + 1}`, id: i + 1, chartNo }
    })
    zip.file(`xl/drawings/drawing${drawingNo}.xml`, drawingXml(anchors))
    zip.file(
      `xl/drawings/_rels/drawing${drawingNo}.xml.rels`,
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${anchors.map((a) => `<Relationship Id="${a.relId}" Type="${REL_CHART}" Target="../charts/chart${a.chartNo}.xml"/>`).join('')}</Relationships>`,
    )
    types = types.replace('</Types>', `<Override PartName="/xl/drawings/drawing${drawingNo}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/></Types>`)

    const file = path.split('/').pop() as string
    const relsPath = path.replace(file, `_rels/${file}.rels`)
    const relId = 'rIdGcaDrawing1'
    const rel = `<Relationship Id="${relId}" Type="${REL_DRAWING}" Target="../drawings/drawing${drawingNo}.xml"/>`
    const existing = zip.file(relsPath)
    if (existing) zip.file(relsPath, (await existing.async('string')).replace('</Relationships>', `${rel}</Relationships>`))
    else zip.file(relsPath, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rel}</Relationships>`)

    if (!/xmlns:r="/.test(sheetXml.slice(0, 600))) sheetXml = sheetXml.replace('<worksheet ', '<worksheet xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ')
    // <drawing> must precede these elements in CT_Worksheet.
    const before = ['<legacyDrawing', '<legacyDrawingHF', '<drawingHF', '<picture', '<oleObjects', '<controls', '<webPublishItems', '<tableParts', '<extLst', '</worksheet>']
    // Search only after the page/print elements so nested extLst (e.g. inside data-bar rules) is skipped.
    const tail = Math.max(...['</sheetData>', '</conditionalFormatting>', '</dataValidations>', '</hyperlinks>', '<pageMargins', '<pageSetup', '</headerFooter>', '</rowBreaks>', '</colBreaks>'].map((t) => sheetXml.lastIndexOf(t)))
    const at = Math.min(...before.map((t) => sheetXml.indexOf(t, tail)).filter((i) => i >= 0))
    sheetXml = `${sheetXml.slice(0, at)}<drawing r:id="${relId}"/>${sheetXml.slice(at)}`
    zip.file(path, sheetXml)
  }
  zip.file('[Content_Types].xml', types)
  return zip.generateAsync({ type: 'arraybuffer', compression: 'DEFLATE' })
}

/** Serialises the workbook including its native charts. */
export async function workbookToBuffer(wb: Workbook): Promise<ArrayBuffer> {
  const buffer = (await wb.xlsx.writeBuffer()) as ArrayBuffer
  return injectCharts(buffer, chartsOf(wb))
}
