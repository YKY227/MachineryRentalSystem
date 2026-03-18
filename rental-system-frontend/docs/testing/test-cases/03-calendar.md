# Calendar Test Cases

## TC-CA-01
**Title:** Load the rental calendar for an equipment item  
**Type:** Smoke  
**Purpose:** Confirm the calendar opens and shows the selected equipment context.  
**Preconditions:** You are signed in as an admin and at least one equipment item exists.  
**Steps:**
1. Open `Rental Calendar`.
2. Choose an equipment item.
3. Review the page header, selected equipment context, and timeline.
**Expected result:**
- The calendar loads for the selected equipment.
- The selected equipment context is visible.
- The timeline is shown for the current date window.
- The page shows the current view mode clearly.

## TC-CA-02
**Title:** Change the planning window  
**Type:** Regression  
**Purpose:** Confirm navigation and view controls work.  
**Preconditions:** The calendar is open.  
**Steps:**
1. Select `Next`.
2. Select `Previous`.
3. Select `Today`.
4. Switch between `7-day` and `14-day`.
**Expected result:**
- The date window updates each time.
- The timeline redraws for the selected window size.
- The page does not lose the selected equipment while the window changes.

## TC-CA-03
**Title:** Toggle timeline display controls  
**Type:** Regression  
**Purpose:** Confirm order, buffer, and downtime display toggles work.  
**Preconditions:** Calendar data exists for the selected equipment.  
**Steps:**
1. Turn `Show orders` off and on.
2. Turn `Show buffer` off and on.
3. Turn `Show downtime` off and on.
4. Change the downtime type filter if downtime exists.
**Expected result:**
- The timeline display updates according to the selected controls.
- Hidden block types disappear from view and return when re-enabled.

## TC-CA-04
**Title:** Create a downtime block  
**Type:** Smoke  
**Purpose:** Confirm downtime can be added from the calendar page.  
**Preconditions:** You have an equipment item selected.  
**Steps:**
1. Complete the downtime form.
2. Choose a downtime type.
3. Set start and end dates.
4. Choose target units if needed.
5. Review any conflict feedback.
6. Save the downtime block.
**Expected result:**
- The downtime block is created.
- It appears in the timeline and current downtime list.
- The saved downtime shows the same type and date range you entered.

## TC-CA-05
**Title:** Open a block in the detail drawer  
**Type:** Smoke  
**Purpose:** Confirm timeline blocks open detailed information.  
**Preconditions:** The selected equipment has at least one visible block.  
**Steps:**
1. Click an order block.
2. Review the right-side detail drawer.
3. Repeat with a buffer block or downtime block if available.
**Expected result:**
- The drawer opens for the selected block.
- The drawer content changes based on the block type.
- The block you clicked is the one shown in the drawer.

## TC-CA-06
**Title:** Review current equipment downtime list  
**Type:** Regression  
**Purpose:** Confirm the downtime list is usable and consistent with the timeline.  
**Preconditions:** Downtime exists for the selected equipment.  
**Steps:**
1. Review the `Current equipment downtime` section.
2. Compare a list item with the matching timeline block.
3. Use the list filter if available.
**Expected result:**
- The list is readable and scrollable.
- The listed downtime details match the timeline entry.
- Filtering the list does not remove the saved downtime unexpectedly.

## TC-CA-07
**Title:** Review warning states for planning conflicts  
**Type:** Edge  
**Purpose:** Confirm warning states are visible when planning pressure exists.  
**Preconditions:** The selected equipment has conflict-prone data such as overlapping commitments or blocked units.  
**Steps:**
1. Open the calendar for the affected equipment.
2. Review warning banners, summaries, or flagged blocks.
3. Open the affected block in the drawer.
**Expected result:**
- Warning states are noticeable.
- You can inspect the related block and understand the issue.
- The page does not hide the timeline when warnings are present.

## Notes for testers
- `Buffer` is not the same as a booking. It is post-rental blocking time.
- `Hold` is a temporary availability block, not a final order.
- `Unassigned` means placement is unclear and needs review.
- `Overbooked` means demand and blocking exceed available usable units.
- Click is the supported interaction for inspecting a block.
- `Ctrl`-based multi-select is not part of normal testing.
