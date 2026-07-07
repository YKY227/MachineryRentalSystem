# Buy Enquiry and Mixed Checkout Plan

## 1. Current Implementation Status

Phase 4A Buy Enquiry Flow is implemented.

Completed behavior:

- Public equipment detail Buy tab accepts purchase enquiries for sale-enabled equipment with `available_for_sale` or `on_request` sale status.
- Public Buy tab does not call checkout, payment, invoice, order, cart, or rental hold code.
- `sold` and `not_available` sale statuses remain non-actionable.
- Public `POST /api/public/rental/equipment/[id]/sale-enquiry` validates equipment publication, sale status, customer name, customer email, and sale fulfillment preference.
- Sale enquiry submissions capture equipment and sale snapshots at submission time.
- Admin `/admin/rental/sale-enquiries` lists recent sale enquiries and allows status/admin notes updates.
- Admin sidebar includes `Sale Enquiries`.
- No sale quantity exists.
- Existing rental checkout remains the current one-equipment flow.

Implemented files:

- `rental-system-frontend/supabase/migrations/20260707160000_rental_equipment_sale_enquiries.sql`
- `rental-system-frontend/src/lib/rental/sale-enquiries/types.ts`
- `rental-system-frontend/src/lib/rental/sale-enquiries/db-sale-enquiry-repo.ts`
- `rental-system-frontend/src/app/api/public/rental/equipment/[id]/sale-enquiry/route.ts`
- `rental-system-frontend/src/app/api/admin/rental/sale-enquiries/route.ts`
- `rental-system-frontend/src/app/api/admin/rental/sale-enquiries/[id]/route.ts`
- `rental-system-frontend/src/app/admin/rental/sale-enquiries/page.tsx`
- `rental-system-frontend/src/app/admin/layout.tsx`
- `rental-system-frontend/src/app/rental/[id]/page.tsx`
- `rental-system-frontend/docs/migration-log.md`

Phase 4A still requires `rental-system-frontend/supabase/migrations/20260707160000_rental_equipment_sale_enquiries.sql` to be applied in each Supabase environment.

Manual smoke tests:

- Apply the Phase 4A migration.
- Submit a Buy enquiry for `available_for_sale` equipment.
- Submit a Buy enquiry for `on_request` equipment.
- Confirm `sold` and `not_available` equipment show no active enquiry form.
- Confirm invalid email and invalid fulfillment preference are rejected.
- Open `/admin/rental/sale-enquiries` and update status/admin notes.
- Confirm Rent tab still proceeds through the existing one-equipment checkout flow.

## 2. Business Rules

- Rental stock and sale stock are separate concepts.
- Rental availability remains system-managed through rental units, bookings, holds, downtime, and checkout lock logic.
- Sale quantity is not system-managed for now.
- Sale items require manual admin confirmation before any customer payment.
- Rental stock must not be reserved when an item is added to a cart.
- Rental stock should only be reserved during checkout hold acquisition.
- Public sale payment must not happen until admin confirms sale availability and final price.
- `sold` and `not_available` sale statuses must not be presented as purchasable.
- `available_for_sale` and `on_request` may allow enquiry submission, but neither guarantees stock.

## 3. Phase 4A Data Model

Implemented table: `rental_equipment_sale_enquiries`

Implemented fields:

- `id`
- `equipment_id`
- `equipment_title_snapshot`
- `sale_status_snapshot`
- `sale_price_mode_snapshot`
- `sale_price_cents_snapshot`
- `sale_condition_snapshot`
- `sale_warranty_snapshot`
- `customer_name`
- `customer_email`
- `customer_phone`
- `company_name`
- `fulfillment_preference`
- `message`
- `status`
- `admin_notes`
- `created_at`
- `updated_at`

Implemented enquiry statuses:

- `new`
- `contacted`
- `awaiting_customer`
- `availability_confirmed`
- `quoted`
- `converted`
- `closed_lost`
- `cancelled`

Snapshot fields preserve what the customer saw when submitting the enquiry. Admins can still review the current equipment record separately.

## 4. Phase 4B: Cart UI and Local Cart Model

Phase 4B should add cart organization without introducing mixed checkout, sale payment, sale invoices, checkout groups, atomic holds, order schema changes, or sale quantity.

Recommended MVP storage: localStorage.

Local storage key:

- `rental_cart_v1`

Rationale:

- Supports guest carts without adding auth/session requirements.
- Avoids introducing database cart schema before checkout-group design is finalized.
- Keeps add-to-cart fully separate from rental holds, orders, invoices, and payment sessions.
- Can later be migrated to a server cart or hybrid account cart because line shapes are explicit and versioned.

Proposed files:

- `rental-system-frontend/src/lib/rental/cart/types.ts`
- `rental-system-frontend/src/lib/rental/cart/local-cart.ts`
- `rental-system-frontend/src/app/rental/cart/page.tsx`
- Optional: `rental-system-frontend/src/components/rental/CartBadge.tsx`
- Optional: `rental-system-frontend/src/components/rental/CartLineItem.tsx`

## 5. Rental Cart Line Shape

Rental cart lines should contain enough information to render a stable cart preview while still treating checkout as authoritative.

```ts
type RentalCartLine = {
  id: string;
  type: "rental";
  equipmentId: string;
  equipmentSlug?: string;
  titleSnapshot: string;
  imageUrlSnapshot?: string;
  dayRateSnapshot: number;
  weekRateSnapshot?: number;
  monthRateSnapshot?: number;
  depositSnapshot?: number;
  minDaysSnapshot: number;
  qty: number;
  startDate: string;
  endDate: string;
  fulfillment: "deliver" | "self_collect";
  deliveryAddress?: string;
  pricingPreview?: {
    days: number;
    rentalSubtotal: number;
    deliveryFee: number;
    collectionFee: number;
    deposit: number;
    total: number;
  };
  addedAt: string;
  updatedAt: string;
};
```

Rental cart lines explicitly must not include:

- hold id
- order id
- payment id

Adding a rental line to cart must not reserve stock.

## 6. Sale Cart Line Shape

Sale cart lines remain enquiry/request lines only in Phase 4B.

```ts
type SaleCartLine = {
  id: string;
  type: "sale";
  equipmentId: string;
  equipmentSlug?: string;
  titleSnapshot: string;
  imageUrlSnapshot?: string;
  saleStatusSnapshot: "available_for_sale" | "on_request" | "sold" | "not_available";
  salePriceModeSnapshot: "fixed" | "request_quote";
  salePriceCentsSnapshot?: number;
  saleConditionSnapshot?: string;
  saleWarrantySnapshot?: string;
  fulfillmentPreference?: "deliver" | "self_collect";
  message?: string;
  enquiryId?: string;
  enquirySubmittedAt?: string;
  addedAt: string;
  updatedAt: string;
};
```

Sale lines must never enter payment in Phase 4B. A sale line can submit the Phase 4A enquiry API and then store `enquiryId` and `enquirySubmittedAt` locally for customer feedback.

## 7. Public Detail Page Behavior

Rent tab:

- Add `Add rental to cart`.
- Keep existing `Proceed to checkout` unchanged.
- Existing checkout query-string flow remains available for one rental item.
- Add-to-cart should capture the selected rental dates, quantity, fulfillment, delivery address, and pricing preview.

Buy tab:

- Add `Add sale enquiry to cart` for `available_for_sale` and `on_request`.
- Keep direct enquiry submission behavior if desired, or present cart as a secondary action.
- `sold` and `not_available` should have no cart action.
- Sale cart action should capture sale metadata snapshots and optional fulfillment/message values.

## 8. `/rental/cart` Page Behavior

The cart page should have two clear sections.

Rental items section:

- Show equipment title/image snapshots.
- Show selected dates, quantity, fulfillment, delivery address, and pricing estimate.
- Allow remove.
- Allow edit by sending the customer back to the equipment detail page with current selections, or implement inline edits later.
- Allow `Proceed with this rental`, which uses the existing one-item checkout query string:
  - `/rental/checkout?equipmentId=...&qty=...&start=...&end=...&fulfillment=...&address=...`

Sale enquiry items section:

- Show sale status, price/request quote, condition, warranty, fulfillment preference, and message snapshot.
- Allow remove.
- Allow `Submit enquiry`, calling `POST /api/public/rental/equipment/[id]/sale-enquiry`.
- After success, store `enquiryId` and `enquirySubmittedAt` on the local cart line.

Checkout behavior:

- No combined checkout button yet, or show a disabled button with clear `Mixed checkout planned` wording.
- Rental estimates are estimates only.
- Existing one-item rental checkout remains authoritative for pricing, availability, hold acquisition, order creation, and payment.

## 9. Phase 4B Safety Rules

Add to cart must create no:

- rental holds
- orders
- invoices
- payment sessions
- checkout groups
- sale quantity reservations

Phase 4B should not touch checkout/payment/invoice/order/hold files. It should use existing public equipment data and the Phase 4A sale enquiry endpoint.

Protected areas for Phase 4B:

- `src/app/rental/checkout/**`
- payment session routes/services
- invoice routes/services
- rental order schema/repositories
- rental availability hold logic/RPCs
- extension invoice/payment flows
- damage invoice/payment flows

## 10. Risks and Stale-State Handling

Risks:

- Stale rental availability after a line is added to cart.
- Stale rental pricing after a line is added to cart.
- Stale sale status after a sale line is added to cart.
- Duplicate sale enquiry submission from repeated cart actions.
- localStorage is device/browser-specific and can be cleared.
- Customer may expect mixed checkout even though it is not available yet.

Recommended handling:

- Label cart rental totals as estimates.
- Re-fetch equipment or availability before sending a rental line to checkout if practical, but leave checkout authoritative.
- Revalidate sale status before submitting a sale enquiry.
- Disable or mark a sale line as submitted after successful enquiry submission.
- Show clear wording that sale lines require admin confirmation and cannot be paid from cart yet.
- Use stable local line ids so duplicates can be removed or updated by the customer.

## 11. Future Option B: Full Mixed Cart/Checkout

Option B should eventually introduce a true mixed cart and checkout architecture that supports multiple rental and sale lines in one customer cart.

Future concepts:

- `cart`: customer or guest cart container.
- `cart_items`: individual rental or sale items.
- `checkout_group`: a checkout attempt grouping cart lines into a single customer-facing checkout session.
- `checkout_group_lines` or generalized `order_lines`: normalized line records for rental and sale items.
- Rental lines: equipment, date range, quantity, fulfillment, pricing snapshot, hold status.
- Sale lines: equipment, sale metadata snapshot, fulfillment preference, admin confirmation status, quoted/final sale price.
- Grouped payment strategy: rental lines may be payable immediately after holds are acquired; sale lines should remain unpaid until admin-confirmed.
- Invoice strategy: rental invoices and sale invoices should be distinct enough for accounting, audit, and workflow handling.
- Admin confirmation strategy: sale lines move from request/enquiry to confirmed sale only after admin validates availability and price.

## 12. Rental Hold Strategy

Adding rental items to a cart must not create holds. Holding stock at cart time would create abandoned-cart stock starvation and make availability harder to reason about.

Future checkout must:

- Revalidate every rental line against current availability.
- Acquire holds for all rental lines atomically or as close to atomically as the database allows.
- Fail the checkout if any rental line cannot be held.
- Release any acquired holds if a later rental line fails.
- Prevent duplicate hold acquisition for the same checkout attempt.

The future hold service should prefer a database transaction/RPC that validates all rental lines and inserts all holds in one operation.

## 13. Sale Line Strategy

Sale cart lines should behave as sale requests unless admin has explicitly confirmed availability and final price.

- `sold` and `not_available` cannot proceed to purchase or enquiry CTA.
- `available_for_sale` can submit a purchase confirmation request.
- `on_request` can submit an enquiry.
- Sale quantity is not tracked.
- Sale lines must not be paid immediately from the public cart unless admin confirmation exists.
- Future admin-confirmed sale lines may generate a sale invoice or payment link.

The public UI should clearly state that sale availability and final pricing are subject to admin confirmation.

## 14. Invoice/Payment Strategy

Two main architecture options exist.

Option 1: checkout group with multiple child rental orders

Pros:

- Preserves existing rental order assumptions.
- Lower risk to current invoice, deposit, extension, and damage flows.
- Enables gradual migration toward multi-item checkout.

Cons:

- Requires a grouping layer for customer checkout/payment visibility.
- Cross-order invoice/payment reconciliation needs careful design.
- Admin reporting may be split across group and child order views.

Option 2: generalized order lines

Pros:

- Cleaner long-term model for mixed rental and sale lines.
- Better fit for one cart, one checkout, and line-level accounting.

Cons:

- Higher migration complexity.
- Larger blast radius across checkout, invoices, deposits, returns, extensions, damage, and reporting.
- Existing one-equipment order assumptions would need systematic replacement.

Recommended staged approach:

Start with `checkout_group` plus child rental orders for multi-rental checkout, then introduce sale invoice/payment after admin confirmation. Defer generalized order lines until the existing rental financial workflows are fully mapped and a migration path is justified.

Sale invoices should use a distinct invoice kind or flow separate from `base_rental`, extension, and damage invoice kinds. Sale payment should not reuse rental deposit or extension assumptions.

## 15. Admin UX

Implemented Phase 4A admin UX:

- Sale Enquiries page in admin rental/equipment area.
- List view with status, equipment, customer, submitted date, sale status snapshot, sale price snapshot, and fulfillment preference.
- Detail/update view with enquiry snapshots, customer contact fields, fulfillment preference, message, status, and admin notes.
- Manual status updates.

Future Option B admin UX:

- Cart/Checkout Groups admin view for grouped checkout attempts.
- Child rental order links from checkout group detail.
- Sale confirmation workflow for sale lines.
- Manual review states for stale, mismatched, paid, failed, or partially confirmed checkout groups.
- Clear separation between rental operational fulfillment and sale confirmation.

## 16. Implementation Phases

Updated recommended phases:

- Phase 4A: Implemented Buy enquiry flow. Added sale enquiry table, public enquiry form/API, and admin sale enquiry management. No cart or payment.
- Phase 4B: Local cart and cart page. Support rental and sale item collection without changing checkout payment behavior.
- Phase 5: Checkout group and atomic multi-rental holds. Support multiple rental lines with all-or-nothing hold acquisition.
- Phase 6: Admin-confirmed sale invoice/payment. Let admins convert confirmed sale requests/lines into sale invoices or payment links.
- Phase 7: Full mixed checkout polish/admin reporting. Improve grouped checkout admin UX, reporting, reconciliation, and customer status pages.

## 17. Open Questions

- Should carts support guests, authenticated customers only, or both?
- Should the Phase 4B MVP be guest-cart only and sync to account later?
- Should cart contents survive login/register redirects?
- Should submitted sale enquiry lines stay in cart, move to a submitted section, or be removed automatically?
- Should rental cart lines have edit-in-place controls or send users back to the equipment detail page?
- Should sale enquiries require customer login in a later phase?
- Should admin be able to convert a sale enquiry directly to a sale invoice?
- Can one payment cover multiple rental orders, or should each child order keep its own payment session?
- Should `checkout_group` be introduced before server cart work?
- Should sale confirmation happen at enquiry level, cart line level, or checkout group line level?
- What statuses are required for admin manual review of mixed checkout failures?
- Should sale invoice numbering share rental invoice numbering or use a separate sequence/prefix?
- Should customer-facing account pages show sale enquiries before sale payment exists?
