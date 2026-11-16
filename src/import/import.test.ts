import { describe, expect, it } from 'vitest'
import { datasetFrom, rawCsv, rawSheet } from '@/test/build'
import { configureFromFile } from './job'
import { detectFormat } from './detect'
import { findOverlaps, validateBranchScope, validateCurrency, validateMetadata } from './validation'

const salesCells = [
  ['Days', 'Orders', 'Amount'],
  [new Date(Date.UTC(2026, 9, 2)), '37', 'USD 2,237'],
  [new Date(Date.UTC(2026, 9, 1)), '14', 'USD 873'],
]
const customersCsv = '﻿id,Full Name,Total Sale,Avarage Order Price,Total Orders,\r\nc-1,Person One,1035,69,15\r\nc-2,Person Two,817,136,6\r\n'
const productsCsv = '﻿id,Product Name,Items Sold,Total Amount,\r\n1,Item A,129,1128\r\n2,Item B,110,1112\r\n'

describe('format detection', () => {
  it('detects daily sales from headers, regardless of file name', () => {
    const d = detectFormat(rawSheet(salesCells, 'anything.xlsx'))
    expect(d?.format.id).toBe('weevi-daily-sales')
  })
  it('recognises the misspelled “Avarage Order Price” customer column', () => {
    const d = detectFormat(rawCsv(customersCsv, 'export.csv'))
    expect(d?.format.id).toBe('weevi-top-customers')
    expect(d?.headerMatch['Avarage Order Price']).toBe('Avarage Order Price')
  })
  it('does not detect the customer format when the column is spelled differently', () => {
    const d = detectFormat(rawCsv(customersCsv.replace('Avarage', 'Average'), 'export.csv'))
    expect(d).toBeNull()
  })
  it('finds headers below title rows', () => {
    const d = detectFormat(rawSheet([['Sales report'], [], ...salesCells]))
    expect(d?.headerRow).toBe(3)
  })
  it('takes the currency from amounts like "USD 2,209"', () => {
    expect(configureFromFile(rawSheet(salesCells)).metadata?.currency).toBe('USD')
  })
  it('leaves currency empty when the export has none (products)', () => {
    expect(configureFromFile(rawCsv(productsCsv)).metadata?.currency).toBeUndefined()
  })
})

describe('missing reporting periods', () => {
  it('requires a period for exports without a date column', () => {
    const ds = datasetFrom(rawCsv(productsCsv), { currency: 'USD', periodStart: '', periodEnd: '' })
    const issues = validateMetadata(ds.metadata, ds.mapping)
    expect(issues.some((i) => i.level === 'error' && /reporting period/.test(i.message))).toBe(true)
  })
  it('accepts a complete period', () => {
    const ds = datasetFrom(rawCsv(productsCsv), { currency: 'USD', periodStart: '2026-10-01', periodEnd: '2026-10-31' })
    expect(validateMetadata(ds.metadata, ds.mapping).filter((i) => i.level === 'error')).toEqual([])
  })
  it('requires a currency for product amounts', () => {
    const ds = datasetFrom(rawCsv(productsCsv), { currency: '', periodStart: '2026-10-01', periodEnd: '2026-10-31' })
    expect(validateMetadata(ds.metadata, ds.mapping).some((i) => /currency/i.test(i.message) && i.level === 'error')).toBe(true)
  })
  it('does not require a period when dates are mapped', () => {
    const ds = datasetFrom(rawSheet(salesCells))
    expect(validateMetadata(ds.metadata, ds.mapping).filter((i) => i.level === 'error')).toEqual([])
  })
})

describe('branch scope', () => {
  it('is required when there is no branch column', () => {
    const ds = datasetFrom(rawSheet(salesCells), { branchScope: undefined })
    expect(validateBranchScope(ds.metadata, ds.mapping)[0].level).toBe('error')
  })
  it('accepts “All selected branches”', () => {
    const ds = datasetFrom(rawSheet(salesCells), { branchScope: { mode: 'all', branches: [] } })
    expect(validateBranchScope(ds.metadata, ds.mapping).every((i) => i.level !== 'error')).toBe(true)
  })
  it('rejects an empty specific selection', () => {
    const ds = datasetFrom(rawSheet(salesCells), { branchScope: { mode: 'selected', branches: [] } })
    expect(validateBranchScope(ds.metadata, ds.mapping)[0].level).toBe('error')
  })
})

describe('currency mismatches', () => {
  it('flags a selected currency that differs from the amounts', () => {
    const ds = datasetFrom(rawSheet(salesCells), { currency: 'EUR' })
    const issues = validateCurrency(ds.metadata, ds.mapping, ds.stats)
    expect(issues[0]).toMatchObject({ level: 'error' })
    expect(issues[0].message).toMatch(/USD/)
  })
  it('passes when they agree', () => {
    const ds = datasetFrom(rawSheet(salesCells), { currency: 'USD' })
    expect(validateCurrency(ds.metadata, ds.mapping, ds.stats)).toEqual([])
  })
  it('warns when amounts mix currencies', () => {
    const ds = datasetFrom(rawSheet([...salesCells, [new Date(Date.UTC(2026, 9, 3)), '5', 'EUR 100']]))
    expect(validateCurrency({ ...ds.metadata, currency: '' }, ds.mapping, ds.stats)[0].level).toBe('warning')
  })
})

describe('duplicate uploads', () => {
  it('detects the same file uploaded twice', () => {
    const first = datasetFrom(rawSheet(salesCells, 'sales.xlsx'), {}, { size: 500, lastModified: 1 })
    const again = datasetFrom(rawSheet(salesCells, 'sales.xlsx'), {}, { size: 500, lastModified: 1 })
    expect(findOverlaps(again, [first]).sameFile?.id).toBe(first.id)
  })
  it('detects identical content under another file name', () => {
    const first = datasetFrom(rawSheet(salesCells, 'sales.xlsx'))
    const renamed = datasetFrom(rawSheet(salesCells, 'sales (1).xlsx'))
    const result = findOverlaps(renamed, [first])
    expect(result.sameFile).toBeUndefined()
    expect(result.sameContent?.id).toBe(first.id)
  })
  it('does not treat the same content for another brand as a duplicate', () => {
    const first = datasetFrom(rawSheet(salesCells, 'sales.xlsx'))
    const other = datasetFrom(rawSheet(salesCells, 'sales-pertutti.xlsx'), { brandId: 'pertutti' })
    expect(findOverlaps(other, [first]).sameContent).toBeUndefined()
  })
})
