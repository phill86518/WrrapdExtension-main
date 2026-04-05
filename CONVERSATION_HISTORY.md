# Wrrapd Chrome Extension - Complete Conversation History

## Overview
This document contains a comprehensive history of all conversations and changes made to the Wrrapd Chrome Extension, specifically the `content.js` file.

## Key Functionality

### Core Workflow
1. **Cart Page**: User can check "This order contains a gift" checkbox
2. **Checkout Page - Gift Options**: 
   - If "This order contains a gift" was checked: Wrrapd options are inserted automatically
   - If NOT checked: User clicks "Add gift options" → Wrrapd options are inserted dynamically
3. **Terms & Conditions**: User clicks "here" to accept → triggers address manipulation
4. **Address Selection**: 
   - If Wrrapd address exists: Select it for Wrrapd items
   - If Wrrapd address doesn't exist: Add it on single address page, then navigate to multi-address
5. **Multi-Address Page**: 
   - Wrrapd items get Wrrapd address
   - Non-Wrrapd items get default address
6. **Payment Summary**: Wrrapd summary is displayed, "Place your order" button is disabled until Wrrapd payment succeeds

### Critical Address Details
- **Name**: Wrrapd (NOT "Wrrapd.com")
- **Street**: PO BOX 26067
- **City**: Jacksonville (NOT "JACKSONVILLE")
- **State**: FL
- **Zip**: 32226-6067 (NOT "32218")
- **Phone**: (904) 515-2034

## Major Issues Fixed

### Issue 1: Second Return to Gift Options Detection
**Problem**: Script stopped on second return to gift-options page instead of clicking "Save gift options"
**Solution**: Simplified detection using `wrrapd-addresses-changed` flag. Script now always clicks "Save gift options" on return.

### Issue 2: Loading Screen Visibility
**Problem**: Loading screen flickered and disappeared during address manipulation
**Solution**: Enhanced `showLoadingScreen()` for persistent visibility, reduced delays, and ensured it covers immediately when address page is detected.

### Issue 3: Address Addition Flow
**Problem**: Script failed to add Wrrapd address when not present
**Solution**: 
- Fixed "Add a new delivery address" link finding (only exists on single address selection page)
- Fixed "Use this address" button clicking with proper selectors
- Added retry mechanisms and proper waiting

### Issue 4: Mixed Items Address Selection
**Problem**: When only some items were Wrrapd, all items received Wrrapd address
**Solution**: 
- Implemented unique identifier system (`WRRAPD_productName_counter` or `DEFAULT_productName_counter`)
- Created `ensureCorrectAddressesForAllItems()` common function
- Only changes addresses that are incorrect

### Issue 5: "Add gift options" Dynamic Insertion
**Problem**: When "This order contains a gift" was NOT checked, Wrrapd options weren't inserted when user clicked "Add gift options"
**Solution**: 
- Simplified `giftSection()` to match old 3270-line code logic
- Added `monitorAddGiftOptionsButton()` with aggressive MutationObserver
- Ensured `insertWrrapdOptions()` is called when gift interface appears dynamically

### Issue 6: Terms & Conditions Bypass
**Problem**: After dynamic "Add gift options", clicking "Save gift options" bypassed Terms & Conditions
**Solution**: 
- Removed filtering checks from `overrideSaveGiftOptionsButtons()`
- Added MutationObserver to continuously watch for dynamically added buttons
- Ensured Terms acceptance is required before address manipulation

### Issue 7: Duplicate Address Manipulation
**Problem**: Script ran address manipulation twice and sometimes clicked "Place your order"
**Solution**: 
- Added `wrrapd-multi-address-completed` flag
- Added `wrrapd-address-just-added` flag
- Added explicit checks to prevent "Place your order" button clicks
- Verified addresses are correct before skipping manipulation

### Issue 8: Wrrapd Summary Alignment
**Problem**: Wrrapd summary had grey border and text wasn't aligned with Amazon's summary
**Solution**: 
- Removed border and box-shadow
- Created `ensureWrrapdSummaryAlignment()` to dynamically read Amazon's styles
- Applied padding, margins, font-size, and line-height from Amazon's UI

### Issue 9: Address Selection Not Persisting
**Problem**: Wrrapd address was found but selection didn't persist, especially for second item
**Solution**: 
- Fixed cached element verification to ensure it's in current popover
- Added polling logic (5 attempts, 300ms intervals) to verify selection persists
- Increased wait times (1500ms after click, 800ms for verification)
- Ensured final check uses full robust selection logic

### Issue 10: Item Count Detection
**Problem**: Script detected 7 items instead of 3 actual checkout items
**Solution**: 
- Modified `addDeliveryDateNotice()` to use `filterItemsInCurrentCheckout()` for actual count
- Limited processing to actual item count to avoid duplicates

## Key Functions

### Common Functions (Refactored for Efficiency)

#### `ensureCorrectAddressesForAllItems(allItems)`
- **Purpose**: Centralizes address selection logic
- **Location**: Lines ~22-70
- **What it does**:
  1. Creates item identifier mapping (`wrrapd-item-identifiers`)
  2. Checks if already on multi-address page
  3. If not, navigates to multi-address page
  4. Calls `selectAddressesForItemsSimple()` to fix addresses
- **Called from**: `handleWrrapdAddressSelection()`, `checkChangeAddress()`

#### `ensureWrrapdSummaryAlignment()`
- **Purpose**: Ensures Wrrapd summary matches Amazon's UI styling
- **Location**: Lines ~128-200
- **What it does**:
  1. Reads Amazon's computed styles (padding, margins, font-size, line-height)
  2. Applies these styles to Wrrapd summary elements
- **Called from**: `createWrrapdSummary()`, `updateWrrapdSummary()`

### Address Selection Functions

#### `handleWrrapdAddressSelection()`
- **Purpose**: Initial address page logic
- **Key Logic**:
  - Checks if Wrrapd address exists
  - If found and all items Wrrapd: Select it for all
  - If found and mixed items: Create identifiers, navigate to multi-address
  - If not found: Add address, set `wrrapd-address-just-added`, navigate to multi-address

#### `checkChangeAddress()`
- **Purpose**: Handles multi-address page detection
- **Key Logic**:
  - Checks `wrrapd-address-just-added` flag
  - Checks `wrrapd-addresses-changed` and `wrrapd-multi-address-completed` flags
  - Always ensures identifier mapping exists
  - Calls `ensureCorrectAddressesForAllItems()` if needed

#### `selectAddressesForItemsSimple(allItems)`
- **Purpose**: Selects correct address for each item on multi-address page
- **Key Logic**:
  - Loads `wrrapd-item-identifiers` mapping
  - Matches dropdowns to products using identifiers
  - Only changes addresses that are incorrect
  - Uses `selectWrrapdAddressFromDropdown()` or `selectDefaultAddressFromDropdown()`

#### `selectWrrapdAddressFromDropdown(dropdownActivator)`
- **Purpose**: Selects Wrrapd address from a dropdown
- **Key Features**:
  - Checks cached Wrrapd address (verifies it's in current popover)
  - Searches for "Show more addresses" and clicks if needed
  - Uses multiple click methods (native select, action trigger, mouse events)
  - Polls 5 times to verify selection persists
  - Only adds new address if truly not available (final comprehensive check)

## localStorage Flags

### Critical Flags
- `wrrapd-addresses-changed`: Set to `true` after addresses are successfully set
- `wrrapd-should-change-address`: Set to `true` when address manipulation is needed
- `wrrapd-terms-accepted`: Set to `true` when user clicks "here" on Terms modal
- `wrrapd-address-just-added`: Set to `true` when Wrrapd address is just added (cleared after fixing addresses)
- `wrrapd-multi-address-completed`: Set to `true` after addresses are set on multi-address page
- `wrrapd-item-identifiers`: JSON mapping of ASINs to unique identifiers (e.g., `WRRAPD_productName_counter`)

### Other Flags
- `wrrapd-all-items`: All items in cart
- `wrrapd-default-address`: Default shipping address
- `wrrapd-programmatic-click-to-payment`: Prevents duplicate navigation
- `wrrapd-automatic-workflow-active`: Indicates automatic workflow is running
- `wrrapd-address-retry-count`: Retry counter for address selection

## Important Notes

### Address Selection Page Structure
- **Single Address Selection Page**: When clicking "Change" address
  - Contains "Show more addresses" link (if many addresses)
  - Contains "Add a new delivery address" link
  - Contains "Deliver to multiple addresses" link
  - **These links ONLY exist on this page, NOT on multi-address page or modals**

### Multi-Address Page
- Each item has its own dropdown
- Wrrapd address must be selected for Wrrapd items only
- Default address must remain for non-Wrrapd items
- After Wrrapd address is added, Amazon auto-selects it for all items - script must fix this

### Payment Summary
- "Place your order" button MUST be disabled when Wrrapd is selected
- Button is only re-enabled after successful Wrrapd payment
- Wrrapd summary must align with Amazon's summary styling

### Workflow States
1. **First Visit to Gift Options**: Insert Wrrapd options, wait for user selection
2. **After "Save gift options"**: If Terms accepted, show loading screen, manipulate addresses
3. **Return to Gift Options**: Simply click "Save gift options" and continue
4. **Payment Summary**: Show Wrrapd summary, disable "Place your order"

## Code Efficiency Improvements

### Refactoring Done
- Created `ensureCorrectAddressesForAllItems()` to eliminate duplicate address selection logic
- Created `ensureWrrapdSummaryAlignment()` to eliminate duplicate styling code
- Removed ~80 lines of duplicate code
- Added ~120 lines for common functions
- Net result: More maintainable, consistent code

## Testing Scenarios

### Scenario 1: "This order contains a gift" Checked
1. Check checkbox on Cart page
2. Proceed to checkout
3. Wrrapd options should appear automatically
4. Select Wrrapd for some items
5. Click "Save gift options"
6. Terms & Conditions should appear
7. Click "here" to accept
8. Address manipulation should run
9. Payment summary should show Wrrapd summary

### Scenario 2: "This order contains a gift" NOT Checked
1. Don't check checkbox on Cart page
2. Proceed to checkout
3. Click "Add gift options" for an item
4. Wrrapd options should appear dynamically
5. Select Wrrapd for some items
6. Click "Save gift options"
7. Terms & Conditions should appear (same as Scenario 1)
8. Rest of workflow should be identical

### Scenario 3: Wrrapd Address Already Exists
1. Wrrapd address is in address list
2. Script should find it and select it for Wrrapd items
3. Should NOT add duplicate address

### Scenario 4: Wrrapd Address Doesn't Exist
1. Wrrapd address is not in address list
2. Script should add it on single address page
3. Then select default for all items
4. Navigate to multi-address page
5. Select Wrrapd address for Wrrapd items only

### Scenario 5: Mixed Items (Some Wrrapd, Some Not)
1. 2 out of 3 items selected for Wrrapd
2. Script should navigate to multi-address page
3. Wrrapd items should get Wrrapd address
4. Non-Wrrapd items should keep default address

## Known Issues & Solutions

### Issue: Selection Not Persisting
**Symptoms**: Wrrapd address found but selection reverts to default
**Solution**: Added polling logic with 5 attempts, increased wait times, verified cached element is in current popover

### Issue: Cached Element from Wrong Dropdown
**Symptoms**: First item works, second item fails
**Solution**: Verify cached element is in current popover before using it

### Issue: Item Count Wrong
**Symptoms**: Script processes 7 items instead of 3
**Solution**: Use `filterItemsInCurrentCheckout()` for actual count

## File Structure

### Main File
- `content.js`: ~10,461 lines
  - Common functions at top
  - Address selection functions
  - Gift options functions
  - Payment summary functions
  - URL monitoring
  - Event handlers

## Last Updated
- Date: Current session
- Version: After address selection persistence fixes
- Key Changes: Polling logic, cached element verification, increased wait times

## Next Steps (If Needed)
1. Monitor for any remaining selection persistence issues
2. Consider further optimization if code grows
3. Test all scenarios after each major change
4. Document any new issues and solutions

---

**Note**: This history is maintained to help with future development and debugging. Always refer to this document when making changes to understand the context and reasoning behind existing code.

