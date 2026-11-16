/**
 * Foody configuration (Ginger & Co Cyprus). Foody analytics are kept completely separate from
 * Weevi and Toters: separate storage, calculations, dashboard and Excel report. Foody amounts are
 * in EUR and are never converted or added to the Lebanon (USD) figures.
 *
 * Every value here was supplied by the business or read from the verified export.
 */
import type { BrandId } from './brands'

export const FOODY_CURRENCY = 'EUR'

/** Store registry. The Store ID column identifies the branch — never the file name. */
export interface FoodyStore {
  storeId: string
  brandId: BrandId
  branch: string
}

/**
 * Store 2000666969 is "Ginger&Co", 20 Stasandrou, 1060 Λευκωσία (Nicosia), Cyprus — the branch
 * name is taken from the address in the export. Add further Cyprus branches here as their store
 * IDs appear; an unknown store ID blocks the import instead of being guessed.
 */
export const FOODY_STORES: FoodyStore[] = [{ storeId: '2000666969', brandId: 'ginger-and-co', branch: 'Nicosia' }]

export const foodyBranchKey = (brandId: BrandId, branch: string) => `${brandId}:${branch}`

export function foodyStoreById(storeId: string): FoodyStore | undefined {
  return FOODY_STORES.find((s) => s.storeId === storeId)
}

/**
 * Sales rules (supplied by the business):
 *   Gross sales = Subtotal (before discounts and vouchers)
 *   Net sales   = Subtotal − Discount − Voucher   (primary revenue KPI)
 *   AOV         = Net sales ÷ valid orders
 * Only valid (delivered) orders count. Cancelled orders are excluded from sales, orders and AOV
 * and are tracked separately. Packaging charges and minimum-order-value fees are shown on their
 * own and are not part of gross or net sales. No commission or payout is assumed.
 */
export const FOODY_RULES = {
  gross: 'Gross sales = Subtotal (before discounts and vouchers)',
  net: 'Net sales = Subtotal − Discount − Voucher',
  aov: 'Average order value = Net sales ÷ valid orders',
  valid: 'Valid orders = order status “Delivered”',
  cancelled: 'Cancelled orders (status “Cancelled”) are excluded from sales, orders and AOV and tracked separately',
  fees: 'Packaging charges and minimum-order-value fees are reported separately and are not part of gross or net sales',
} as const

/** Order status values with a known meaning (compared trimmed, case-insensitive). */
export const FOODY_VALID_STATUSES = ['delivered']
export const FOODY_CANCELLED_STATUSES = ['cancelled', 'canceled']

/** Headers of the verified Foody "orderDetails" export (header row 2, under grouped titles in row 1). */
export const FOODY_HEADERS = {
  restaurantName: 'Restaurant name',
  orderId: 'Order ID',
  storeId: 'Store ID',
  deliveryType: 'Delivery type',
  paymentType: 'Payment type',
  paymentMethod: 'Payment method',
  isPro: 'Is Pro order',
  address: 'Restaurant address',
  status: 'Order status',
  receivedAt: 'Order received at',
  hasComplaint: 'Has complaint?',
  complaintReason: 'Complaint reason',
  cancelledAt: 'Cancelled at',
  cancellationReason: 'Cancellation reason',
  cancellationOwner: 'Cancellation owner',
  subtotal: 'Subtotal',
  packaging: 'Packaging charges',
  minOrderFee: 'Minimum order value fee',
  discount: 'Discount',
  voucher: 'Voucher',
  items: 'Order items',
} as const

export type FoodyColumn = keyof typeof FOODY_HEADERS

/** Every one of these must be present for a file to be recognised as a Foody order export. */
export const FOODY_REQUIRED: FoodyColumn[] = ['orderId', 'storeId', 'status', 'receivedAt', 'subtotal', 'discount', 'voucher']
