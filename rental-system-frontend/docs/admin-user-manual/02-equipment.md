# Rental Inventory

## What this page does
`Rental Inventory` is used to create, edit, publish, and review rental equipment records. It controls the catalogue details used by the rental system, including unit counts, pricing, deposit amount, and maintenance buffer days.

## Key concepts
- `Published` vs `Draft`: Published equipment can be used in the active rental catalogue. Draft equipment is kept out of public use.
- `Total units`: The number of units available for that equipment line.
- `Maintenance buffer days`: The default post-rental buffer applied to new bookings for that equipment.
- `Day rate`, `Week rate`, `Month rate`: Rental pricing options.
- `Deposit amount`: The standard deposit requirement for the equipment.

## Actions / how to use
1. Open `Rental Inventory`.
2. Use the `Inventory` tab to review existing equipment and current publish status.
3. Select `Add equipment` to create a new item, or choose `Edit` on an existing row.
4. Complete the main item details:
   - title
   - category
   - brand and model
   - description
   - total units
   - maintenance buffer days
   - pricing and deposit amount
5. Add supporting content if needed:
   - image URLs
   - catalogue URL
   - training video URL
   - key features
   - applications
   - specifications
6. Set `Published` if the item is ready for operational and catalogue use.
7. Save using `Create equipment` or `Save changes`.

## Typical workflow
1. Create or open the equipment record.
2. Check the operational fields first:
   - `Total units`
   - `Maintenance buffer days`
   - rates
   - deposit amount
3. Complete the supporting content and media.
4. Review the preview panel to confirm the record looks correct.
5. Set `Published` only when the item is ready to be used in normal rental workflows.
6. After saving, review `Rental Calendar` if you need to confirm how the equipment will affect planning.

## Why this works this way
- Equipment records drive downstream availability, pricing, deposit expectations, and planning views.
- `Maintenance buffer days` is stored at equipment level because it acts as the normal default for future bookings of that equipment.
- Publish state is separate so you can prepare a record fully before it appears in live rental flows.

## Common issues / warnings
- If `Total units` is too low, the equipment may look unavailable sooner than expected.
- If `Maintenance buffer days` is too high, future bookings will block extra post-rental time.
- If the item is saved but missing from public rental pages, check whether it is still in `Draft`.
- Use the preview to catch obvious mistakes such as wrong image, incorrect rate, or missing title before publishing.

## Cross-page references
- Use `Rental Calendar` to see how unit count, buffers, and downtime affect scheduling after you update an equipment record.
- Use `Rental Orders` when you need to understand how live rentals are using the equipment.
- Use `Invoices` only after orders exist and billing work is needed.

## Notes / warnings
- Changing `Maintenance buffer days` affects how future bookings are created for that equipment.
- A low `Total units` value reduces available capacity immediately for new availability checks.
- If an item has no image, the page shows a simple placeholder preview.
- The `Orders` tab on this page shows locally stored sample order data for the inventory editor workspace only. Use `Rental Orders` and `Rental Calendar` for the authoritative operational view.
