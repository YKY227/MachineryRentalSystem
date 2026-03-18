# Equipment Test Cases

## TC-EQ-01
**Title:** Create a new equipment record  
**Type:** Smoke  
**Purpose:** Confirm you can create equipment with the main operational fields.  
**Preconditions:** You are signed in as an admin and can open `Rental Inventory`.  
**Steps:**
1. Open `Rental Inventory`.
2. Select `Add equipment`.
3. Enter a title, category, brand, model, description, `Total units`, `Maintenance buffer days`, rate, and deposit amount.
4. Leave `Published` unchecked.
5. Select `Create equipment`.
**Expected result:**
- The equipment record is saved.
- You return to the inventory view.
- The new item appears in the list with the title you entered.
- The new item is shown as a draft item because `Published` was left off.

## TC-EQ-02
**Title:** Publish an equipment record  
**Type:** Regression  
**Purpose:** Confirm publish state can be changed for a ready equipment record.  
**Preconditions:** At least one equipment item exists.  
**Steps:**
1. Open `Rental Inventory`.
2. Select `Edit` on an equipment item.
3. Turn on `Published`.
4. Select `Save changes`.
**Expected result:**
- The equipment record is updated.
- Reopening the same record shows `Published` still turned on.
- The list shows the record in its published state.

## TC-EQ-03
**Title:** Update maintenance buffer days  
**Type:** Regression  
**Purpose:** Confirm the equipment record accepts maintenance buffer updates.  
**Preconditions:** At least one equipment item exists.  
**Steps:**
1. Open `Rental Inventory`.
2. Select `Edit` on an equipment item.
3. Change `Maintenance buffer days`.
4. Save the record.
5. Reopen the same record.
**Expected result:**
- The new maintenance buffer value is saved.
- The saved value is still shown after reopening.
- No unrelated fields are changed unexpectedly.

## TC-EQ-04
**Title:** Validate preview updates while editing  
**Type:** Edge  
**Purpose:** Confirm the preview panel reflects the current record details.  
**Preconditions:** You are editing an equipment record.  
**Steps:**
1. Change the title, brand, model, day rate, or image URL.
2. Review the preview area before saving.
**Expected result:**
- The preview updates to reflect the edited values.
- Missing image shows the placeholder instead of breaking the page.
- The preview remains readable while values are being edited.

## TC-EQ-05
**Title:** Save supporting content fields  
**Type:** Regression  
**Purpose:** Confirm supporting equipment content can be saved.  
**Preconditions:** You are editing an equipment record.  
**Steps:**
1. Enter values for image URLs, catalogue URL, training video URL, key features, applications, and specifications.
2. Save the record.
3. Reopen the same record.
**Expected result:**
- The supporting content is saved and shown again when reopened.
- The page does not lose the main equipment details after saving.

## TC-EQ-06
**Title:** Review inventory list after edit  
**Type:** Smoke  
**Purpose:** Confirm edited equipment remains visible and stable in the inventory list.  
**Preconditions:** At least one equipment record has been created or updated.  
**Steps:**
1. Return to the inventory list.
2. Find the edited equipment row.
3. Confirm the basic row details are readable.
**Expected result:**
- The row is visible in the list.
- There is no obvious mismatch between the saved record and the list view.
- The row remains readable without needing to reopen the editor.

## Not part of normal testing
- The `Orders` tab in `Rental Inventory` is not the authoritative live operations view. Use `Rental Orders` and `Rental Calendar` for normal operational testing.
