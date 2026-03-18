# Rental Calendar

## 🧠 How to read this page

- Each row represents 1 physical unit
- Each block represents usage of that unit over time
- Buffer blocks are not customer bookings, but still block availability
- Red warnings mean demand exceeds available units

## What this page does
`Rental Calendar` is the planning view for equipment usage. It shows orders, maintenance buffers, and downtime on a unit-based timeline so admins can understand availability and scheduling conflicts quickly.

## Key concepts
- `Selected equipment`: The calendar focuses on one equipment item at a time.
- `7-day` / `14-day` view: Changes the visible planning window.
- `Orders`: Active rental commitments for the selected equipment.
- `Buffer`: Derived blocked time after a rental based on maintenance buffer policy or approved overrides.
- `Hold`: A temporary availability block used during booking or operational checks. A hold is not the same as a confirmed rental order.
- `Downtime`: Planned or unplanned operational blocking such as maintenance, repair, inspection, admin hold, or internal use.
- `Lanes` / `Units`: Timeline rows used to represent individual units where possible.
- `Unassigned` / `Overbooked`: Warning states that show scheduling pressure or a mismatch between commitments and available unit placement.

## Actions / how to use
1. Open `Rental Calendar`.
2. Choose the equipment item you want to plan.
3. Use `Previous`, `Today`, and `Next` to move through the schedule.
4. Switch between `7-day` and `14-day` views depending on how much planning space you need.
5. Review the timeline:
   - rental blocks show bookings
   - buffer blocks show post-rental maintenance time
   - downtime blocks show operational blocking
6. Use the lower display controls to show or hide:
   - `Show orders`
   - `Show buffer`
   - `Show downtime`
   - downtime type filter
7. To create a downtime block:
   - complete the downtime form
   - choose the type and date range
   - target units if needed
   - review conflict feedback
   - save the block
8. Select a timeline block to open the detail drawer for more information or actions.

## Typical workflow
1. Choose the equipment item you want to plan.
2. Set the date window with `Previous`, `Today`, `Next`, and the `7-day` or `14-day` switch.
3. Scan the timeline from top to bottom:
   - orders
   - buffers
   - downtime
   - warning summaries
4. If the equipment needs to be blocked, create a downtime entry and review conflicts before saving.
5. If you see a warning, open the related block and confirm the detail in the drawer before making a decision.
6. Move to `Rental Orders` if the issue is really an order workflow problem rather than a planning problem.

## Why this works this way
- The calendar is equipment-first. It is designed to answer "what is happening to this equipment over time?" before you change anything.
- `Lanes` represent individual units where the page can place blocks clearly. This helps you see whether one unit is still free even when another unit is already committed.
- `Buffer` is shown separately from the rental block because it is post-rental operational time, not customer-booked time. It still blocks availability.
- `Hold` is temporary. It can affect availability checks, but it should not be read as a final confirmed order.
- `Unassigned` means the page cannot confidently place a block on a specific lane. `Overbooked` means the current commitments and blocking exceed usable capacity.

## Common issues / warnings
- If the calendar looks empty, first check the selected equipment and the date window.
- If a unit appears blocked after a rental has ended, you are often looking at a buffer rather than another order.
- If you save downtime without checking the conflict summary, you may block time that overlaps live rentals or planned work.
- If you see `Unassigned`, do not assume the schedule is safe. It means the timeline needs review because block placement is unclear.
- If you see `Overbooked`, treat it as urgent. Review orders, buffers, and downtime together before making promises to a customer.

## Cross-page references
- Use `Rental Orders` when a calendar issue requires return, inspection, deposit, or extension action.
- Use `Rental Inventory` when the problem comes from incorrect unit count or maintenance buffer setup.
- Use `Invoices` only when the planning issue leads to billing follow-up.

## Notes / warnings
- Buffers are operational blocking periods. They are not customer-visible bookings.
- Some warnings are compact summaries above the calendar so the timeline stays usable. Review the related detail sections when attention items appear.
- If the page shows no blocks, first confirm that the correct equipment and date window are selected.

## Interaction notes
- Click a block to open its detail drawer.
- Use the detail drawer to confirm what the block represents before taking action elsewhere.
- When blocks overlap visually, inspect them one by one rather than assuming the top-most block tells the full story.
- ⚠️ Not implemented yet: a documented multi-select workflow for normal admin use. If you use keyboard modifiers in your environment, confirm the active block in the drawer before making decisions.
