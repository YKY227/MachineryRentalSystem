# Admin Rental System Manual Test Plan

## Purpose
This test plan helps manual testers verify the main admin rental workflows that are currently visible and usable in the application.


## Recommended execution order

1. Review test-data-setup.md and confirm required records exist
2. Run all Smoke test cases across modules
3. Run Regression test cases module by module
4. Run Edge test cases last
5. Record all findings in bug-log.md

## What should be tested
- `Rental Inventory`
- `Rental Orders`
- `Rental Calendar`
- `Rental Customers`
- `Invoices`

## Main workflows in scope
- Create and update equipment records
- Review equipment publish state and operational defaults
- Process return and inspection steps on orders
- Record deposit resolution separately from return
- Review extension requests from the order workspace
- Plan around orders, buffers, and downtime in the calendar
- Create and review downtime entries
- Search and update customer account controls
- Review, issue, send, remind, record payment, receipt, and void invoices

## Out of scope
- Customer-facing checkout and portal testing
- Developer-only tooling as normal business workflow
- Any feature marked `Not part of normal testing` or `Stub / not fully implemented`

## Test approach
1. Start with clean, known test data where possible.
2. Test one module at a time using the test case files.
3. Follow cross-page workflows when a task naturally moves from one page to another.
4. Record all issues in the bug log with clear steps and expected results.

## Test data guidance
- Use at least one published equipment item and one draft equipment item.
- Use at least one active order that can be used for return, inspection, deposit, and extension review testing.
- Use at least one customer with account details that can be updated.
- Use at least one draft invoice and one issued invoice if available.

## Pass criteria
- The page loads correctly.
- The visible workflow can be completed using the current UI.
- The page state, status labels, and related records update as expected.
- Cross-page context stays consistent after the action.

## Test completion criteria

Testing is considered complete when:
- All Smoke test cases pass
- No Critical issues remain open
- Major issues are documented and reviewed

## Notes for testers
- If an action is not visible, first check the status of the record you opened.
- If a page looks empty, check filters, search terms, date window, or selected equipment before logging a defect.
- Developer-only delete tools are not part of normal testing unless a test lead specifically asks you to verify them.
