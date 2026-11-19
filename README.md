# Ginger & Co / Pertutti — Analytics Dashboard

Frontend-only analytics and reporting for Ginger & Co and Pertutti (Weevi, Toters, Foody, Plate reservations).
All parsing, calculations and Excel generation run in the browser. No backend, no external APIs.

## Run locally

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # type-check + production build into dist/
npm run preview    # serve the production build
npm run lint
npm test           # Vitest — parsers, validation, analytics, real-sample checks
```

The real-sample tests read `samples/weevi/ginger/`, `samples/toters/`, `samples/foody/` and the Plate `samples/Bookings — …csv` files when they exist and are skipped otherwise.
`samples/` is git-ignored: it contains customer data and must never be committed or placed in `public/`.

## Testing the workflow

1. **Import data** → drop one or more `.csv` / `.xlsx` exports.
2. For each file: choose brand, platform and report type (country is set automatically), enter the file currency.
3. Check the **header row** and the detected columns / first 20 rows.
4. **Map columns** to the standard fields. Pick a date format if dates are ambiguous (e.g. `03/04/2026`).
   Tick "Save this mapping" to reuse it for the next export of the same platform and report type.
5. Review the cleaned preview and warnings, then **Confirm import**.
6. Open the dashboards, use the filters, then **Report generator → Export Analytical Report**.
7. **Reporting settings**: classify cancelled / refunded status values, add exchange rates, set a low-rating threshold.
8. **Import history**: include / exclude or delete datasets, clear history, turn local (IndexedDB) storage on or off.

## Verified export formats

Detected from headers (never the file name) in `src/config/exportFormats.ts`:

| Format | Headers | Grain | Currency / period |
|---|---|---|---|
| Weevi daily sales | Days, Orders, Amount | one row per day | from amounts (`USD 2,209`) / from dates |
| Weevi daily customer activity | Days, New Registrations, New Customers, Returning Customers | one row per day | n/a / from dates |
| Weevi top products | id, Product Name, Items Sold, Total Amount | one row per product | user selects both |
| Weevi top customers | id, Full Name, Total Sale, Avarage Order Price, Total Orders | one row per customer | user selects both |

The same formats apply to Ginger & Co and Pertutti. Toters and Foody exports are recognised by their own modules (below).

## Toters (separate module)

Toters is analysed completely separately from Weevi: own import, storage, dashboard (**Toters analytics**) and Excel report (**Export Toters report**). Toters revenue is never added to Weevi revenue, product rankings or customer analytics.

- **Format** (detected from headers): `store_id, period, total, ref, delivery_request` — one row per store and day. A file can hold one branch or all branches.
- **Branch = store ID** (never the file name): 96297 Ginger & Co Hamra · 96298 Ginger & Co Jal El Dib · 104873 Pertutti Hamra · 121769 Pertutti Hazmieh (`src/config/toters.ts`). Unknown store IDs block the import; a file without store IDs requires a manual branch, and a conflicting selection blocks it.
- **`store_id = 0`** rows are the export's combined total: used only to reconcile the branch rows, never stored or added.
- **Conversion** (fixed): Revenue USD = (CSV total × 1,500) ÷ 89,500. Always computed from the original CSV value (kept for auditing), full precision, rounded only for display; recorded with every import.
- **Re-imports**: one stored value per store and day. Identical files are skipped automatically; overlapping days with different values open a choice — replace, keep existing, or cancel.
- **Missing data**: actual zero, missing day and invalid record are distinguished; missing is never shown as zero. Ginger & Co Hazmieh and Discount have no Toters channel and show as *Not available*.
- No order counts exist in the export, so Toters orders / AOV are not reported.

## Foody (separate module — Ginger & Co Cyprus, EUR)

Foody is analysed completely separately from Weevi and Toters: own import, storage, dashboard (**Foody analytics**), import history and Excel report (**Export Foody report**). Amounts stay in EUR and are never converted or added to Lebanon (USD) figures.

- **Format** (detected from headers, row 2 under grouped titles): Foody `orderDetails` Excel — one row per order with `Order ID, Store ID, Order status, Order received at, Subtotal, Discount, Voucher` (+ delivery/payment type, complaint and cancellation columns, `Order items`).
- **Branch = Store ID**: 2000666969 → Ginger & Co Nicosia (address in the export: 20 Stasandrou, 1060 Λευκωσία). Add new Cyprus stores in `src/config/foody.ts`; unknown store IDs block the import.
- **Rules**: Gross sales = Subtotal · Net sales = Subtotal − Discount − Voucher (primary KPI) · AOV = Net ÷ valid orders · valid = status `Delivered`. Cancelled orders are excluded from sales/orders/AOV and tracked separately; other statuses are flagged and excluded. Packaging and minimum-order fees are shown separately; no commission or payout is assumed.
- An order cancelled before it was received has no `Order received at`; it is dated by `Cancelled at`.
- **Duplicates**: one stored record per order ID. Identical files are skipped; overlapping files add only new orders; orders whose values changed (e.g. status) open a choice — use the file's values, keep stored, or cancel.
- **Validation**: each import keeps the file's own totals; the dashboard, history and report check the stored orders against them (October 2026: 364 valid orders, gross EUR 14,375.50, net EUR 14,195.50, 3 cancelled).
- **Missing data**: a day inside an imported file's period without orders is a real zero; a day outside every imported file is missing and never shown as zero.
- **Filters**: brand, branch, date range (with quick ranges), daily / weekly / monthly view, and a comparison period (previous period of the same length, or custom) for campaign analysis.

## Plate (separate module — reservations)

Plate reservations are analysed completely separately from every sales source: own import, storage, dashboard (**Plate reservations**), import history and Excel report (**Export Plate report**). Reservations are bookings and guests, never sales.

- **Format** (detected from headers): Plate `Bookings` CSV — one row per reservation with `Date, Time, Guest, Party Size, Status, …, Source, Booking Type, Occasion, Section, …, Booked At, Modified, Changes, Booking ID`.
- **Location**: the export has no restaurant column, so the location and covered period are read from the file name (`Bookings — <location> — <from> to <to>.csv`) and confirmed on import. Locations: Ginger & Co Hazmieh · Ginger & Co Jal El Dib · Pertutti Hazmieh · Hamra (Ginger & Co + Pertutti, **one combined location**) — `src/config/plate.ts`.
- **Rules**: reported by reservation date (never the booking date). Completed = status `Completed`; guests (covers) = party size of completed reservations; `Cancelled by User` = cancelled by the guest; `Declined` = refused by the restaurant (separate KPI). Other statuses are flagged and only count in total bookings.
- **Not in the export**: walk-ins and no-shows (Booking Type is always `Regular`, no no-show status) — not shown. Payment columns are empty and carry no currency — no amounts are reported.
- **Guests / privacy**: names, phone numbers, emails, confirmation codes and note text are never stored. The phone number (email as fallback) is kept only as a one-way code: repeat guest = 2+ completed reservations across all imported months; returning = also visited before the selected period.
- **Duplicates**: one stored record per Booking ID; changed bookings open the same replace / keep choice as Foody.
- **Validation**: October 2026 — 51 reservations, 45 completed, 157 guests, 4 cancelled (14 guests), 2 declined (4 guests); 39 unique guests, 4 repeat.
- **Missing data**: a day inside an imported export period without bookings is a real zero; a day outside every imported period is missing.

## Structure

```
src/
  config/      brands & platforms, import categories & standard fields, navigation
  parsers/     CSV (PapaParse) and Excel (ExcelJS) readers → raw cells; header-row handling
  import/      value parsing, column-mapping normalisation, validation, overlap detection
  analytics/   scope & filters, source precedence / de-duplication, metrics, insights, engine
  toters/      Toters parser, import planning (conflicts / duplicates) and analytics
  foody/       Foody parser, order de-duplication, analytics and period comparison
  plate/       Plate parser (no personal data kept), booking de-duplication, reservation analytics
  export/      analytical Excel workbook (ExcelJS)
  storage/     IndexedDB wrapper
  state/       data store (datasets, templates, settings) and global filters
  components/  layout, UI primitives, charts (Recharts), dashboard panels, import wizard
  pages/       one file per view
```

## Data rules

- Only mapped standard fields are stored; unmapped columns are discarded at import.
- Built-in column names exist only for the verified Weevi formats above; other sources are mapped by the user (templates are saved locally).
- Currencies are never combined unless an exchange rate is entered in Reporting settings.
- Per brand × platform, only the most detailed export type is added to totals
  (Orders → Sales summary → Delivery / pickup → Branch performance). Duplicate Order IDs count once.
- Overlapping exports that cannot be de-duplicated by Order ID are imported as excluded.
- Cancelled / refunded handling applies only to status values the user classifies.
- Product amounts and customer spend are never added to sales revenue; differences are shown as reconciliation warnings.
- Daily returning-customer counts are summed as customer-days, never as distinct customers.
- Brands are combined only when "Both brands (cross-brand)" is selected.
- Toters, Foody and Plate data are never part of the Weevi analysis (see their sections above).
- Files without a branch column need a branch scope. Only a single declared branch is attributed; nothing is split.
- Customer names are hidden on screen by default and excluded from exports unless explicitly included.
