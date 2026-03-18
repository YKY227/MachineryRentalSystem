# Orders Test Cases

## TC-OR-01
**Title:** Load and scan the rental orders list  
**Type:** Smoke  
**Purpose:** Confirm the orders workspace loads and shows operations-focused information.  
**Preconditions:** You are signed in as an admin and orders exist.  
**Steps:**
1. Open `Rental Orders`.
2. Review the summary cards.
3. Review the table rows and attention badges.
**Expected result:**
- The page loads without layout breakage.
- Summary cards are visible.
- Order rows show operational information such as return, inspection, deposit, and attention state.
- At least one order row can be reviewed without opening the drawer.

## TC-OR-02
**Title:** Filter the list by search and status  
**Type:** Regression  
**Purpose:** Confirm the triage filters narrow the list.  
**Preconditions:** At least several orders exist.  
**Steps:**
1. Enter a search term that matches one order, customer, or equipment item.
2. Apply an operational status filter.
3. Apply a deposit status filter.
4. Clear the filters again.
**Expected result:**
- The list narrows correctly.
- Clearing filters returns the broader list.
- The page does not stay stuck on an empty result after filters are removed.

## TC-OR-03
**Title:** Open the order workspace drawer  
**Type:** Smoke  
**Purpose:** Confirm order detail work happens in the right-side workspace.  
**Preconditions:** At least one order exists.  
**Steps:**
1. Open `Rental Orders`.
2. Select `Open workspace` on an order.
3. Review the right-side panel.
**Expected result:**
- The workspace drawer opens.
- The order summary and workflow sections are visible.
- The selected order remains identifiable while the drawer is open.

## TC-OR-04
**Title:** Save return and inspection details  
**Type:** Regression  
**Purpose:** Confirm the return and inspection workflow can be updated.  
**Preconditions:** An order exists that can be used for return and inspection testing.  
**Steps:**
1. Open the order workspace.
2. Update the return / inspection section.
3. Enter inspection notes.
4. Save the changes.
**Expected result:**
- The workflow saves successfully.
- Updated return or inspection information remains visible after refresh.
- The order still appears in the list with updated operational context.

## TC-OR-05
**Title:** Record deposit resolution after inspection  
**Type:** Regression  
**Purpose:** Confirm deposit resolution is a separate workflow.  
**Preconditions:** An order exists with deposit information available.  
**Steps:**
1. Open the order workspace.
2. Review the deposit section.
3. Record a deposit outcome.
4. Save the deposit action.
**Expected result:**
- The deposit action is recorded.
- The deposit status updates separately from return and inspection.
- The deposit section reflects the new outcome after refresh.

## TC-OR-06
**Title:** Review extension requests in the order workspace  
**Type:** Edge  
**Purpose:** Confirm extension review is visible in the order workspace when applicable.  
**Preconditions:** At least one order has an extension request.  
**Steps:**
1. Open the relevant order workspace.
2. Review the extension section.
3. Check the request details and current review state.
4. Complete a review action if your environment supports it.
**Expected result:**
- Extension request details are visible.
- Review action updates the status when the workflow is available.
- If no request exists, the workspace should show that state clearly instead of appearing broken.

## TC-OR-07
**Title:** Open linked invoice context from an order  
**Type:** Smoke  
**Purpose:** Confirm the order page supports billing follow-up.  
**Preconditions:** An order with invoice context exists.  
**Steps:**
1. Open an order row or workspace.
2. Use the invoice-related action for that order.
**Expected result:**
- You are taken to the relevant invoice flow for the order.
- The invoice context matches the order you started from.

## Not part of normal testing
- Developer delete tools are destructive cleanup tools. Test them only when a test lead explicitly includes them in scope.
