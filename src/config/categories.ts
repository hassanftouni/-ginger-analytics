/**
 * Import categories and the standardized fields each one can be mapped to.
 *
 * Standardized fields are this application's internal schema — they are NOT export
 * column names. The user maps each export's own columns onto these fields at import
 * time; mappings can be saved as templates per platform + category.
 */

export type ImportCategory =
  | 'orders'
  | 'sales-summary'
  | 'products'
  | 'branch-performance'
  | 'ratings'
  | 'customers'
  | 'customer-activity'
  | 'delivery-pickup'

export type StandardField =
  | 'orderId'
  | 'date'
  | 'branch'
  | 'channel'
  | 'status'
  | 'revenue'
  | 'orderCount'
  | 'currency'
  | 'productId'
  | 'productName'
  | 'productCategory'
  | 'quantity'
  | 'rating'
  | 'comment'
  | 'customerId'
  | 'customerName'
  | 'averageOrderValue'
  | 'newRegistrations'
  | 'newCustomers'
  | 'returningCustomers'

export type FieldType = 'text' | 'number' | 'date'

export interface FieldDefinition {
  key: StandardField
  label: string
  type: FieldType
  description: string
  /** Personal or free-text data. Kept locally; excluded from the Cleaned Data export sheet. */
  sensitive?: boolean
}

export const FIELDS: Record<StandardField, FieldDefinition> = {
  orderId: { key: 'orderId', label: 'Order ID', type: 'text', description: 'Unique order reference; used to count unique orders and remove duplicates' },
  date: { key: 'date', label: 'Date', type: 'date', description: 'Order or reporting date' },
  branch: { key: 'branch', label: 'Branch', type: 'text', description: 'Branch or store name' },
  channel: { key: 'channel', label: 'Sales channel', type: 'text', description: 'e.g. the delivery / pickup / dine-in value used in the export' },
  status: { key: 'status', label: 'Order status', type: 'text', description: 'Used with the cancelled / refunded reporting policy' },
  revenue: { key: 'revenue', label: 'Revenue amount', type: 'number', description: 'The amount to count as revenue' },
  orderCount: { key: 'orderCount', label: 'Number of orders', type: 'number', description: 'Order count reported on a summary row' },
  currency: { key: 'currency', label: 'Currency', type: 'text', description: 'Currency code per row (otherwise the file currency is used)' },
  productId: { key: 'productId', label: 'Product ID', type: 'text', description: 'Product reference in the source system' },
  productName: { key: 'productName', label: 'Product name', type: 'text', description: 'Product or item name' },
  productCategory: { key: 'productCategory', label: 'Product category', type: 'text', description: 'Menu category' },
  quantity: { key: 'quantity', label: 'Quantity sold', type: 'number', description: 'Units sold' },
  rating: { key: 'rating', label: 'Rating', type: 'number', description: 'Numeric customer rating' },
  comment: { key: 'comment', label: 'Comment', type: 'text', description: 'Free-text review', sensitive: true },
  customerId: { key: 'customerId', label: 'Customer ID', type: 'text', description: 'Customer reference', sensitive: true },
  customerName: { key: 'customerName', label: 'Customer name', type: 'text', description: 'Personal data — hidden by default', sensitive: true },
  averageOrderValue: { key: 'averageOrderValue', label: 'Average order value (as exported)', type: 'number', description: 'Average per order as reported in the export' },
  newRegistrations: { key: 'newRegistrations', label: 'New registrations', type: 'number', description: 'Accounts registered that day' },
  newCustomers: { key: 'newCustomers', label: 'New customers', type: 'number', description: 'First-time customers that day' },
  returningCustomers: { key: 'returningCustomers', label: 'Returning customers', type: 'number', description: 'Returning customers that day (daily count, not unique over a period)' },
}

export interface CategoryFieldRule {
  field: StandardField
  required: boolean
}

export interface CategoryDefinition {
  id: ImportCategory
  name: string
  description: string
  /** Order matters: shown in this order in the mapper. */
  fields: CategoryFieldRule[]
}

const f = (field: StandardField, required = false): CategoryFieldRule => ({ field, required })

export const CATEGORIES: Record<ImportCategory, CategoryDefinition> = {
  orders: {
    id: 'orders',
    name: 'Orders',
    description: 'One row per order',
    fields: [f('date', true), f('revenue', true), f('orderId'), f('branch'), f('channel'), f('status'), f('currency')],
  },
  'sales-summary': {
    id: 'sales-summary',
    name: 'Sales summary',
    description: 'Aggregated sales, e.g. per day or per branch',
    fields: [f('revenue', true), f('date'), f('orderCount'), f('branch'), f('channel'), f('currency')],
  },
  products: {
    id: 'products',
    name: 'Products / best sellers',
    description: 'Sales per product or item',
    fields: [f('productName', true), f('quantity', true), f('revenue'), f('productId'), f('productCategory'), f('branch'), f('date'), f('currency')],
  },
  'branch-performance': {
    id: 'branch-performance',
    name: 'Branch performance',
    description: 'Results per branch',
    fields: [f('branch', true), f('revenue'), f('orderCount'), f('date'), f('currency')],
  },
  ratings: {
    id: 'ratings',
    name: 'Customer ratings',
    description: 'Ratings and reviews',
    fields: [f('rating', true), f('date'), f('branch'), f('orderId'), f('comment')],
  },
  customers: {
    id: 'customers',
    name: 'Top customers',
    description: 'One row per customer with spending and orders',
    fields: [f('customerId', true), f('revenue'), f('orderCount'), f('averageOrderValue'), f('customerName'), f('date'), f('branch'), f('currency')],
  },
  'customer-activity': {
    id: 'customer-activity',
    name: 'Daily customer activity',
    description: 'Registrations, new and returning customers per day',
    fields: [f('date', true), f('newRegistrations'), f('newCustomers'), f('returningCustomers'), f('branch')],
  },
  'delivery-pickup': {
    id: 'delivery-pickup',
    name: 'Delivery / pickup',
    description: 'Results split by sales channel',
    fields: [f('channel', true), f('revenue'), f('orderCount'), f('date'), f('branch'), f('currency')],
  },
}

/** Categories whose rows carry revenue in a monetary currency. */
export function categoryHasMoney(category: ImportCategory): boolean {
  return CATEGORIES[category].fields.some((r) => r.field === 'revenue')
}
