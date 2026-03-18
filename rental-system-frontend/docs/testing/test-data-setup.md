# Manual Testing Data Setup

## Purpose
Use this page to prepare reliable sample data before running the admin rental manual test pack.

## Recommended sample records

### Equipment
Prepare at least:
- 1 published equipment item with:
  - valid title
  - `Total units` greater than 1
  - visible day rate
  - deposit amount
  - maintenance buffer days
- 1 draft equipment item
- 1 equipment item that can be used for downtime testing

### Orders
Prepare at least:
- 1 active rental order that can be used for return and inspection testing
- 1 order with deposit information available
- 1 order with an extension request if extension review is in scope
- 1 order that appears in the calendar for the selected equipment

### Calendar conditions
For the best calendar test coverage, prepare:
- 1 equipment item with visible order blocks
- 1 equipment item with buffer blocks
- 1 equipment item with at least one downtime block
- 1 scenario where warnings such as `Unassigned` or `Overbooked` can be reviewed

### Customers
Prepare at least:
- 2 customer records so selection changes can be tested
- 1 customer with editable vetting, payment terms, and account status
- 1 customer with enough account history to open `Open Account Overview`

### Invoices
Prepare at least:
- 1 draft invoice
- 1 issued invoice
- 1 issued invoice with outstanding balance
- 1 issued invoice with at least one recorded payment
- 1 invoice that can be used for reminder testing

## Suggested setup order
1. Confirm at least one published equipment item exists.
2. Confirm at least one active order exists for that equipment.
3. Confirm the same order or related order appears in `Rental Calendar`.
4. Confirm at least one customer account linked to those orders exists.
5. Confirm invoice records exist for finance testing.

## Before you begin testing
- Make sure you can sign in as an admin.
- Check whether developer-only tools are visible. If they are visible, treat them as out of scope unless specifically requested.
- Check that your chosen equipment and orders appear in the current test environment before starting the calendar and order workflows.

## Notes
- If a workflow cannot be tested because the required sample record does not exist, record it as a test data gap instead of guessing.
- If an action is missing, first confirm that the record is in the right state. Many admin actions only appear when the page is opened on the correct record type or status.
