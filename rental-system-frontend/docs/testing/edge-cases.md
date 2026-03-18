# Admin Rental System Edge Cases

## Equipment
- A record is saved but not visible in live rental use because it is still in `Draft`.
- `Total units` is reduced and availability becomes tighter than expected.
- `Maintenance buffer days` is changed and future planning looks different from older bookings.
- Supporting content is incomplete, but the page should still remain usable.

## Orders
- A rental is marked returned, but deposit work is still unresolved.
- Inspection is saved without meaningful notes, making later deposit decisions harder to understand.
- An order needs both inspection follow-up and extension review at the same time.
- A tester expects deposit resolution to happen automatically after return. It should not.

## Calendar
- A tester mistakes a `Buffer` block for a customer booking.
- A tester mistakes a `Hold` for a confirmed rental.
- A block appears in `Unassigned`, which means placement is unclear and needs review.
- `Overbooked` appears when demand plus blocking exceeds usable units.
- The selected equipment is correct, but the visible date window is wrong, making the page appear empty.
- Downtime is saved without careful review of the conflict summary.

## Customers
- The wrong customer is edited because the selected row changed while searching.
- Search returns no results and the tester assumes the customer record is missing.
- A tester expects the master-detail page to show full financial history instead of using `Open Account Overview`.

## Invoices
- A tester tries to send or remind a `Draft` invoice instead of issuing it first.
- A tester sends a reminder without checking `Payment History`.
- An invoice appears overdue because the due date has passed, but the tester does not check the payment status and balance together.
- Receipt sending is attempted before any payment has been recorded.
- Payment instructions look incomplete because organisation billing details have not been fully configured.

## Not part of normal testing
- Developer-only delete tools are not part of normal admin workflow testing unless specifically requested.
- Any unclear keyboard multi-select behavior in the calendar should be treated as secondary and not relied on for normal test sign-off.
