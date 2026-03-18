# Invoices

## What this page does
`Invoices` is the finance and receivables workspace for rental billing. It supports invoice review, issue, payment follow-up, reminder emails, receipt sending, PDF download, and payment recording.

## Key concepts
- `Draft`, `Issued`, `Void`: The main invoice lifecycle states.
- `Unpaid`, `Partially Paid`, `Paid`, `Overdue`: The payment states used for follow-up and cash collection work.
- `Outstanding balance`: The amount still collectible on the invoice.
- `Payment History`: Recorded payments already applied to the invoice.
- `Email History`: Sent, resent, reminder, and receipt activity for the invoice.

## Actions / how to use
1. Open `Invoices`.
2. Use the top summary to review overdue items, open receivables, paid invoices, and lifecycle mix.
3. Use search and filters to narrow the list by:
   - keyword
   - lifecycle status
   - payment status
   - sort order
4. Open an invoice row to go to the invoice detail page.
5. On the invoice detail page, use the available actions based on invoice status:
   - `Save draft`
   - `Issue invoice`
   - `Send` or `Resend`
   - `Send reminder`
   - `Send receipt`
   - `Record payment`
   - `Download PDF`
   - `Void`
6. Use the related order link when billing work needs rental context.
7. Review `Payment History` and `Email History` before sending follow-up communications.

## Typical workflow
1. Start on the invoice list and identify overdue or unpaid items.
2. Use search and filters to narrow the list to the customer, order, or payment state you need.
3. Open the invoice detail page.
4. If the invoice is still a draft, review it and issue it.
5. If it is already issued, choose the next action based on the current need:
   - send or resend
   - send reminder
   - record payment
   - send receipt
6. Review `Payment History` and `Email History` after each action so you can confirm what has already happened.
7. Use the related order link when billing questions depend on the rental record.

## Why this works this way
- The invoice list is for finance triage; the invoice detail page is for document-level action.
- `Outstanding balance` matters most because it shows what is still collectible.
- Email history and payment history stay with the invoice so you can avoid duplicate follow-up and confirm the latest customer contact.
- Payment instructions come from organisation billing settings when available so invoice previews and outputs stay aligned.

## Common issues / warnings
- If an invoice is in `Draft`, issue it before expecting normal send and collection actions to make sense.
- If a customer says they already paid, check `Payment History` before sending another reminder.
- If payment instructions look incomplete, review the organisation billing details in admin settings.
- If an invoice looks overdue unexpectedly, check due date and payment state together rather than relying on one badge alone.

## Cross-page references
- Use the related order link when invoice questions depend on rental dates, return outcome, or extension history.
- Use `Rental Customers` or the customer account overview when unpaid balances affect wider account handling.
- Use `Rental Orders` when a billing issue is actually caused by an unresolved operational change.

## Notes / warnings
- The invoice preview uses organisation billing details from admin settings when available.
- Draft invoices can be edited before issue. Once issued, actions shift toward communication, payment, and exception handling.
- Missing payment details in settings do not stop the page from working, but payment instructions may be incomplete until they are configured.
