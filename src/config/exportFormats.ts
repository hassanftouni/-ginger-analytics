/**
 * Verified export formats. Each entry was built from a real export supplied by the
 * business; header names are copied exactly (including the source's own spelling,
 * e.g. "Avarage Order Price"). Detection uses headers and structure, never the file name.
 *
 * Toters and Foody exports are recognised by their own modules (src/toters, src/foody) and never
 * become datasets of this engine.
 */
import type { PlatformId } from './brands'
import type { ImportCategory } from './categories'
import type { ColumnMapping, ParseOptions } from '@/types/dataset'

export type ExportFormatId = 'weevi-daily-sales' | 'weevi-daily-customers' | 'weevi-top-products' | 'weevi-top-customers'

export interface ExportFormat {
  id: ExportFormatId
  platformId: PlatformId
  category: ImportCategory
  name: string
  /** What one row represents. */
  grain: string
  fileTypes: ('csv' | 'excel')[]
  /** Headers that must all be present (compared trimmed and case-insensitive). */
  requiredHeaders: string[]
  mapping: ColumnMapping
  parseOptions: ParseOptions
  /** Where the currency comes from: amounts carry it ("USD 2,209"), or the user must select it. */
  currency: 'from-values' | 'user' | 'none'
  /** Where the reporting period comes from. */
  period: 'from-dates' | 'user'
  notes: string[]
}

export const EXPORT_FORMATS: ExportFormat[] = [
  {
    id: 'weevi-daily-sales',
    platformId: 'weevi',
    category: 'sales-summary',
    name: 'Weevi daily sales',
    grain: 'One row per day (not per order)',
    fileTypes: ['excel', 'csv'],
    requiredHeaders: ['Days', 'Orders', 'Amount'],
    mapping: { date: 'Days', orderCount: 'Orders', revenue: 'Amount' },
    parseOptions: { dateFormat: 'auto', decimalSeparator: '.' },
    currency: 'from-values',
    period: 'from-dates',
    notes: ['Orders are daily counts; average order value is total revenue ÷ total orders.'],
  },
  {
    id: 'weevi-daily-customers',
    platformId: 'weevi',
    category: 'customer-activity',
    name: 'Weevi daily customer activity',
    grain: 'One row per day',
    fileTypes: ['excel', 'csv'],
    requiredHeaders: ['Days', 'New Registrations', 'New Customers', 'Returning Customers'],
    mapping: { date: 'Days', newRegistrations: 'New Registrations', newCustomers: 'New Customers', returningCustomers: 'Returning Customers' },
    parseOptions: { dateFormat: 'auto', decimalSeparator: '.' },
    currency: 'none',
    period: 'from-dates',
    notes: [
      'Returning customers are daily counts; their sum over a period is not the number of distinct returning customers.',
      'Customer activity is not an order count.',
    ],
  },
  {
    id: 'weevi-top-products',
    platformId: 'weevi',
    category: 'products',
    name: 'Weevi top products',
    grain: 'One row per product for the exported period',
    fileTypes: ['csv', 'excel'],
    requiredHeaders: ['id', 'Product Name', 'Items Sold', 'Total Amount'],
    mapping: { productId: 'id', productName: 'Product Name', quantity: 'Items Sold', revenue: 'Total Amount' },
    parseOptions: { dateFormat: 'auto', decimalSeparator: '.' },
    currency: 'user',
    period: 'user',
    notes: ['The export has no dates or currency: confirm the reporting period and currency.', 'Product amounts are never added to sales revenue.'],
  },
  {
    id: 'weevi-top-customers',
    platformId: 'weevi',
    category: 'customers',
    name: 'Weevi top customers',
    grain: 'One row per customer for the exported period',
    fileTypes: ['csv', 'excel'],
    requiredHeaders: ['id', 'Full Name', 'Total Sale', 'Avarage Order Price', 'Total Orders'],
    mapping: { customerId: 'id', customerName: 'Full Name', revenue: 'Total Sale', averageOrderValue: 'Avarage Order Price', orderCount: 'Total Orders' },
    parseOptions: { dateFormat: 'auto', decimalSeparator: '.' },
    currency: 'user',
    period: 'user',
    notes: [
      'The export has no dates or currency: confirm the reporting period and currency.',
      'Customer names are personal data: hidden by default and replaced by anonymised IDs in exports.',
      'Customer spending is never added to sales revenue.',
    ],
  },
]

export function getExportFormat(id: ExportFormatId | undefined): ExportFormat | undefined {
  return EXPORT_FORMATS.find((f) => f.id === id)
}
