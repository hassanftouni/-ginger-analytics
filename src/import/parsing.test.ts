import { describe, expect, it } from 'vitest'
import { parseCsvText, toSourceTable } from '@/parsers'
import { parseDate, parseMoney, parseNumber } from './valueParsers'

describe('USD amount parsing', () => {
  it('parses "USD 2,209" into a number and keeps the currency', () => {
    expect(parseMoney('USD 2,209', '.')).toEqual({ amount: 2209, currency: 'USD' })
  })
  it('handles decimals, trailing codes and plain numbers', () => {
    expect(parseMoney('USD 1,234.56', '.')).toEqual({ amount: 1234.56, currency: 'USD' })
    expect(parseMoney('2,209 EUR', '.')).toEqual({ amount: 2209, currency: 'EUR' })
    expect(parseMoney(873, '.')).toEqual({ amount: 873, currency: undefined })
    expect(parseMoney('1128', '.')).toEqual({ amount: 1128, currency: undefined })
  })
  it('does not invent a currency from a symbol', () => {
    expect(parseMoney('$1,000', '.').currency).toBeUndefined()
  })
  it('rejects text without a number', () => {
    expect(parseMoney('USD', '.').amount).toBeUndefined()
    expect(parseNumber('n/a', '.')).toBeUndefined()
  })
  it('supports comma decimals when chosen', () => {
    expect(parseNumber('1.234,50', ',')).toBe(1234.5)
  })
})

describe('Excel dates', () => {
  it('converts Excel serial numbers', () => {
    // 46296 = 2026-10-01 in the 1900 date system
    expect(parseDate(46296, 'auto')).toBe('2026-10-01')
    expect(parseDate(46326, 'auto')).toBe('2026-10-31')
  })
  it('reads Date cells as UTC calendar dates', () => {
    expect(parseDate(new Date(Date.UTC(2026, 9, 31)), 'auto')).toBe('2026-10-31')
  })
  it('refuses ambiguous day/month text unless a format is chosen', () => {
    expect(parseDate('03/04/2026', 'auto')).toBeUndefined()
    expect(parseDate('03/04/2026', 'dmy')).toBe('2026-04-03')
    expect(parseDate('03/04/2026', 'mdy')).toBe('2026-03-04')
    expect(parseDate('31/10/2026', 'auto')).toBe('2026-10-31')
  })
})

describe('CSV structure', () => {
  const csv = '﻿id,Product Name,Items Sold,Total Amount,\r\n13755,Item A,129,1128\r\n13753,Item B,110,1112\r\n'

  it('ignores trailing empty CSV columns and the byte-order mark', () => {
    const raw = parseCsvText(csv, 'products.csv')
    const table = toSourceTable(raw.sheets[0], 1)
    expect(table.headers).toEqual(['id', 'Product Name', 'Items Sold', 'Total Amount'])
    expect(table.rows).toHaveLength(2)
    expect(table.rows[0]['Total Amount']).toBe('1128')
  })

  it('keeps an empty-header column that actually holds values', () => {
    const raw = parseCsvText('a,b,\r\n1,2,3\r\n', 'x.csv')
    expect(toSourceTable(raw.sheets[0], 1).headers).toEqual(['a', 'b', 'Column 3'])
  })
})
