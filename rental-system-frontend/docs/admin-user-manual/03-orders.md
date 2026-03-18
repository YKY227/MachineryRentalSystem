# Rental Orders

## What this page does
`Rental Orders` is the main operations queue for active rentals. It helps staff review order status, process returns and inspections, resolve deposits, review extension requests, and follow linked invoice activity.

## Key concepts
- `Return status`: Shows whether the order is still out, returned, or otherwise updated in the return workflow.
- `Inspection status`: Tracks whether inspection has started, is pending, passed, or found issues.
- `Deposit status`: Shows whether the held deposit still needs release, retention, or another resolution.
- `Extension review`: Shows customer extension requests that still need an admin decision.
- `Operational warnings`: Flags such as `Inspection issues`, `Deposit unresolved`, downtime impact, or extension review attention.

## Actions / how to use
1. Open `Rental Orders`.
2. Use the summary cards to spot the main queues:
   - active rentals
   - return and inspection work
   - inspection issues
   - unresolved deposit cases
3. Use the filter bar to narrow the list by:
   - search
   - operational status
   - deposit status
   - attention type
4. Review order rows for status badges and attention chips.
5. Select `Open workspace` on an order to work in the right-side panel.
6. In the order workspace, complete the relevant action:
   - `Return & Inspection`
   - `Deposit resolution`
   - `Extension review`
7. Use linked invoice actions when you need to create or open billing records for the same order.

## Typical workflow
1. Review the summary cards and attention filters to find the day’s priority work.
2. Narrow the list with search or filters if you are handling a specific queue.
3. Open one order at a time using `Open workspace`.
4. Complete `Return & Inspection` when the equipment has come back.
5. Record `Deposit resolution` after the inspection outcome is clear.
6. Review extension requests only after checking the order and account context.
7. Open related invoice actions when the same rental also needs billing follow-up.

## Why this works this way
- Return, inspection, deposit, and extension are related but separate decisions. Keeping them separate reduces mistakes.
- Deposit resolution is not automatic because the outcome depends on inspection findings, not just on whether the rental was returned.
- Extension review stays with orders because it changes the active rental period and affects future availability.

## Common issues / warnings
- If an order is returned but still shows deposit attention, you still need to record a deposit decision.
- If inspection notes are incomplete, later staff may not understand why deposit was retained or released.
- If an extension request is waiting, check related account and planning context before approving it.
- If you cannot find an order, clear search and filters first.

## Cross-page references
- Use `Rental Calendar` when you need to see whether an order is causing buffer pressure, downtime conflict, or extension impact.
- Use `Rental Customers` when payment terms, vetting, or account status may affect your decision.
- Use `Invoices` when the rental action also needs billing, payment, reminder, or receipt follow-up.

## Notes / warnings
- Deposit resolution remains a separate action after return and inspection. Returning an order does not automatically resolve the deposit.
- An order can need attention in more than one area at the same time.
- Developer delete tools may appear when enabled in settings. These are destructive cleanup tools and are not part of normal rental operations.
