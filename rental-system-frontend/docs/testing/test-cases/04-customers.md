# Customers Test Cases

## TC-CU-01
**Title:** Load and search the customer workspace  
**Type:** Smoke  
**Purpose:** Confirm the customer page loads and search narrows the list.  
**Preconditions:** You are signed in as an admin and customer records exist.  
**Steps:**
1. Open `Rental Customers`.
2. Review the customer list.
3. Search by company, contact, or related account text.
4. Clear the search.
**Expected result:**
- The page loads correctly.
- The list updates when searching.
- Clearing the search restores the broader list.
- The page does not keep an old empty state after the search is cleared.

## TC-CU-02
**Title:** Select a customer from the list  
**Type:** Smoke  
**Purpose:** Confirm the master-detail layout keeps one customer clearly in focus.  
**Preconditions:** More than one customer exists.  
**Steps:**
1. Select one customer in the list.
2. Review the right-side panel.
3. Select a different customer.
**Expected result:**
- The selected row is clearly highlighted.
- The detail panel updates to the newly selected customer.
- The contact and account details in the panel change to match the selected customer.

## TC-CU-03
**Title:** Update customer account controls  
**Type:** Regression  
**Purpose:** Confirm vetting, payment terms, and account status can be updated.  
**Preconditions:** A customer record is selected.  
**Steps:**
1. Change `Vetting status`.
2. Change `Payment terms`.
3. Change `Account status`.
4. Save the customer.
5. Refresh and reopen the same customer.
**Expected result:**
- The changes save successfully.
- The same saved values are shown after refresh.
- The values shown in the detail panel match what you selected before saving.

## TC-CU-04
**Title:** Save internal notes  
**Type:** Regression  
**Purpose:** Confirm internal notes can be updated without affecting other sections.  
**Preconditions:** A customer record is selected.  
**Steps:**
1. Update the internal notes field.
2. Save the customer.
3. Reopen the same customer.
**Expected result:**
- The note is saved and remains visible.
- Vetting, payment terms, and account status remain unchanged unless you edited them too.

## TC-CU-05
**Title:** Open the deeper account overview  
**Type:** Regression  
**Purpose:** Confirm the contextual action opens the account overview page.  
**Preconditions:** A customer record is selected.  
**Steps:**
1. Select `Open Account Overview`.
**Expected result:**
- The deeper account overview page opens for the selected customer.
- The account overview belongs to the same customer you selected from the list.

## Not part of normal testing
- Do not treat this page as the full account history page. Use `Open Account Overview` when you need recent orders, invoices, payments, deposits, or email activity.
