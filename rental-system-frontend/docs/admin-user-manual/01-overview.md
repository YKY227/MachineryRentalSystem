# Admin Rental Workspace Overview

## What this page does
The admin rental workspace is used to manage rental inventory, monitor live bookings, plan equipment usage, maintain customer accounts, and control invoices. The main pages work together:

- `Rental Inventory` manages equipment records, pricing, unit counts, and maintenance buffer days.
- `Rental Orders` is the main operational queue for return, inspection, deposit, and extension work.
- `Rental Calendar` shows orders, maintenance buffers, and downtime on a timeline.
- `Rental Customers` manages vetting, payment terms, account status, and internal notes.
- `Invoices` manages invoice issue, payment follow-up, reminders, receipts, and PDF access.

## Key concepts
- `Maintenance buffer`: Extra blocked days after a rental. Buffers help prevent back-to-back commitments before equipment is ready again.
- `Downtime`: Planned or unplanned blocking for maintenance, repair, inspection, admin hold, or internal use.
- `Lanes` / `Units`: The calendar uses lanes to represent individual equipment units where possible.
- `Attention items`: Operational issues such as inspection problems, unresolved deposits, overdue invoices, or extension reviews that need admin action.

## Actions / how to use
1. Start in `Rental Orders` when you need to process returns, inspections, deposit outcomes, or extension requests.
2. Open `Rental Calendar` when you need to understand scheduling impact, buffers, downtime, or unit-level planning.
3. Use `Rental Inventory` to add or update equipment details, rates, publication status, and maintenance buffer defaults per item.
4. Use `Rental Customers` to maintain account controls such as vetting status, payment terms, and internal notes.
5. Use `Invoices` to issue invoices, follow up on unpaid balances, record payments, and send receipts or reminders.

## 🧭 Common starting points

- New customer inquiry → start in `Rental Orders`
- Check availability → open `Rental Calendar`
- Add new equipment → use `Rental Inventory`
- Follow up payment → go to `Invoices`
- Review customer account → open `Rental Customers`

## Typical workflow
1. Start in `Rental Orders` to identify what needs action today.
2. Open `Rental Calendar` if an order issue affects availability, buffers, or downtime planning.
3. Move to `Rental Customers` when you need account context before making a commercial or operational decision.
4. Open `Invoices` when the same issue also needs billing, payment, reminder, or receipt follow-up.
5. Return to `Rental Inventory` only when the underlying equipment setup itself needs to change.

## 🔄 Typical rental lifecycle

1. Create or confirm equipment in `Rental Inventory`
2. Create and manage rental in `Rental Orders`
3. Check allocation and conflicts in `Rental Calendar`
4. Handle return, inspection, and deposit resolution
5. Issue and follow up invoices in `Invoices`

## Why this works this way
- Each page is organised around a different operational question. `Rental Orders` is the action queue, `Rental Calendar` is the planning view, `Rental Customers` is the account-control view, and `Invoices` is the receivables view.
- Buffers and downtime are kept outside the order list because they affect availability even when there is no direct customer action to take.
- Billing actions stay on invoice pages so document history, payment history, and email history remain attached to the invoice itself.

## Common issues / warnings
- If you start on the wrong page, you may only see part of the problem. A return issue often needs both `Rental Orders` and `Rental Calendar`.
- If an action is missing, check whether the record is in the correct status first.
- If a page looks empty, clear filters or confirm the selected equipment, customer, or search term before assuming data is missing.

## Cross-page references
- Use `Rental Orders` together with `Rental Calendar` for returns, delays, extension requests, downtime pressure, or buffer questions.
- Use `Rental Orders` together with `Invoices` when a rental action also needs billing follow-up.
- Use `Rental Customers` together with `Invoices` when unpaid balances or payment terms affect account decisions.

## Notes / warnings
- The calendar, orders, and invoices pages are best used together. A scheduling issue often has a linked customer, deposit, or invoice follow-up.
- Some admin tools are intentionally restricted by settings. If an action is not visible, it may be disabled for your environment.
- Empty states are normal in a new environment. They usually mean there is no matching data yet rather than an error.
