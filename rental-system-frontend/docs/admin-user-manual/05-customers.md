# Rental Customers

## What this page does
`Rental Customers` is the admin workspace for customer account triage and account updates. It combines a searchable customer list on the left with a selected-customer details panel on the right.

## Key concepts
- `Vetting status`: Internal readiness or approval state for the customer account.
- `Payment terms`: The commercial terms currently applied to the account.
- `Account status`: The current operational account state used by admin staff.
- `Internal notes`: Admin-only notes for account handling and follow-up.
- `Open Account Overview`: Opens the deeper account page with financial summary, recent orders, invoices, payments, and email activity.

## Actions / how to use
1. Open `Rental Customers`.
2. Use the search box to find a customer by company, contact, or related account text.
3. Select a customer from the list on the left.
4. Review the summary panel on the right for:
   - company
   - contact
   - email
   - phone
   - UEN
   - linked account context
5. Update the account controls as needed:
   - `Vetting status`
   - `Payment terms`
   - `Account status`
   - internal notes
6. Select `Save customer` to apply changes.
7. Select `Open Account Overview` when you need deeper financial or account history.

## Typical workflow
1. Search for the customer you need.
2. Select the customer from the left-side list.
3. Confirm the right-side panel matches the account you intend to edit.
4. Review the current controls:
   - `Vetting status`
   - `Payment terms`
   - `Account status`
5. Update internal notes if the next staff member will need context.
6. Save the changes.
7. Open `Open Account Overview` when you need wider financial or account history.

## Why this works this way
- The master-detail layout lets you triage many accounts quickly while keeping one account clearly in focus for editing.
- Vetting, payment terms, and account status sit together because they shape how you handle the customer operationally.
- Internal notes stay on the customer record so account context is not lost between teams.

## Common issues / warnings
- If you edit the wrong customer, it is usually because the selected row changed while you were searching. Confirm the active customer in the right-side panel before saving.
- If you need more history than the page shows, use `Open Account Overview` instead of trying to infer the full picture from the list.
- If search returns nothing, clear the search term before assuming the customer record is missing.

## Cross-page references
- Use `Open Account Overview` for the deeper customer workspace with financial summary, recent orders, invoices, payments, and email activity.
- Use `Rental Orders` when you are investigating a live operational issue for this customer.
- Use `Invoices` when account handling depends on unpaid or overdue billing.

## Notes / warnings
- The selected customer is highlighted in the list so you can see which account the right-side panel is editing.
- A blank list usually means your search returned no matches, not that the page failed.
- Use the detail overview page for broader account context instead of overloading the list page with investigation work.
