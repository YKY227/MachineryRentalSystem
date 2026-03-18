# Invoices Test Cases

## TC-IN-01
**Title:** Load and triage the invoice list  
**Type:** Smoke  
**Purpose:** Confirm the invoice workspace loads and shows finance summary signals.  
**Preconditions:** You are signed in as an admin and invoice records exist.  
**Steps:**
1. Open `Invoices`.
2. Review the top summary cards.
3. Review the list for lifecycle, payment, balance, and communication state.
**Expected result:**
- The page loads correctly.
- Finance summary cards are visible.
- Invoice rows show readable billing status information.
- The list contains enough information to distinguish invoice identity, status, and balance at a glance.

## TC-IN-02
**Title:** Search, filter, and sort invoices  
**Type:** Regression  
**Purpose:** Confirm the main list controls work together.  
**Preconditions:** Multiple invoices exist.  
**Steps:**
1. Search by invoice number, customer, or related text.
2. Apply a lifecycle status filter.
3. Apply a payment status filter.
4. Change sort order.
5. Clear the filters again.
**Expected result:**
- The list updates for each control.
- The list returns to the broader set when filters are cleared.
- The sort order visibly changes when a different sort is selected.

## TC-IN-03
**Title:** Open invoice detail from the list  
**Type:** Smoke  
**Purpose:** Confirm row navigation opens the invoice detail page.  
**Preconditions:** At least one invoice exists.  
**Steps:**
1. Open an invoice row from the list.
2. Review the invoice header, preview, and side control area.
**Expected result:**
- The invoice detail page opens.
- Invoice identity, status, and related context are visible.
- The opened invoice number matches the row you selected.

## TC-IN-04
**Title:** Save or edit a draft invoice  
**Type:** Regression  
**Purpose:** Confirm draft invoices can still be updated before issue.  
**Preconditions:** A draft invoice exists.  
**Steps:**
1. Open the draft invoice.
2. Update the available draft fields.
3. Save the draft.
4. Refresh the page.
**Expected result:**
- The draft saves successfully.
- The updated values remain after refresh.
- The invoice remains in `Draft` after saving unless you issue it separately.

## TC-IN-05
**Title:** Issue a draft invoice  
**Type:** Smoke  
**Purpose:** Confirm the draft can move into issued status.  
**Preconditions:** A draft invoice exists.  
**Steps:**
1. Open the draft invoice.
2. Select `Issue invoice`.
**Expected result:**
- The invoice status changes from draft to issued.
- Issued-state actions become available.
- The page no longer presents the invoice as a draft-only document.

## TC-IN-06
**Title:** Send or resend an issued invoice  
**Type:** Regression  
**Purpose:** Confirm invoice communication actions work from invoice detail.  
**Preconditions:** An issued invoice exists.  
**Steps:**
1. Open the issued invoice.
2. Select `Send` or `Resend`.
3. Review the page after the action completes.
**Expected result:**
- The action completes successfully.
- The communication history reflects the send activity.
- The newest communication entry appears in `Email History`.

## TC-IN-07
**Title:** Send a reminder for an unpaid or overdue invoice  
**Type:** Regression  
**Purpose:** Confirm the reminder flow is available when appropriate.  
**Preconditions:** An issued invoice exists with outstanding balance.  
**Steps:**
1. Open the issued invoice with balance due.
2. Select `Send reminder`.
3. Review the page after the action completes.
**Expected result:**
- The reminder action completes successfully.
- The communication history reflects the reminder activity.
- The reminder appears as a new history entry rather than replacing the existing send history.

## TC-IN-08
**Title:** Record a payment  
**Type:** Smoke  
**Purpose:** Confirm payment recording updates invoice finance state.  
**Preconditions:** An issued invoice exists with outstanding balance.  
**Steps:**
1. Open the invoice.
2. Select `Record payment`.
3. Enter the payment details available in your environment.
4. Save the payment.
**Expected result:**
- The payment is recorded.
- Paid amount, balance, and payment status update accordingly.
- The new payment appears in `Payment History`.
- The outstanding balance shown on the page changes after the payment is recorded.

## TC-IN-09
**Title:** Send a receipt after payment  
**Type:** Regression  
**Purpose:** Confirm receipt sending is available after payment exists.  
**Preconditions:** An issued invoice has recorded payment.  
**Steps:**
1. Open the invoice.
2. Select `Send receipt`.
3. Review the page after the action completes.
**Expected result:**
- The receipt action completes successfully.
- The communication history reflects the receipt activity.
- The newest communication entry identifies the receipt send.

## TC-IN-10
**Title:** Download invoice PDF  
**Type:** Smoke  
**Purpose:** Confirm the invoice PDF action is available from detail.  
**Preconditions:** Open an invoice detail page.  
**Steps:**
1. Select `Download PDF`.
**Expected result:**
- The PDF download action starts successfully or the document opens, depending on browser behaviour.
- The action does not leave the page in a broken state.

## TC-IN-11
**Title:** Void an issued invoice  
**Type:** Edge  
**Purpose:** Confirm the void action is available for invoice exception handling.  
**Preconditions:** An issued invoice exists and is suitable for void testing.  
**Steps:**
1. Open the invoice.
2. Select `Void`.
3. Confirm the action if prompted.
**Expected result:**
- The invoice status changes to void.
- The page reflects the void state clearly.
- The invoice remains accessible in its void state after refresh.
