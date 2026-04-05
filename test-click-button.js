// Simple test script to click "Use this address" button
// Copy and paste this into the browser console

console.log("=== Testing 'Use this address' button click ===");

// Method 1: Find by data-testid
let button = document.querySelector('input[data-testid="bottom-continue-button"][type="submit"]');
console.log("Method 1 (data-testid):", button);

// Method 2: Find by parent container
if (!button) {
    const parent = document.querySelector('#checkout-primary-continue-button-id');
    if (parent) {
        button = parent.querySelector('input[type="submit"]');
        console.log("Method 2 (parent container):", button);
    }
}

// Method 3: Find by aria-labelledby
if (!button) {
    button = document.querySelector('input[aria-labelledby="checkout-primary-continue-button-id-announce"][type="submit"]');
    console.log("Method 3 (aria-labelledby):", button);
}

if (!button) {
    console.error("❌ Button not found!");
    console.log("Available submit buttons:", Array.from(document.querySelectorAll('input[type="submit"]')).map(btn => ({
        name: btn.name,
        id: btn.id,
        testId: btn.getAttribute('data-testid'),
        ariaLabel: btn.getAttribute('aria-labelledby'),
        disabled: btn.disabled
    })));
} else {
    console.log("✓ Button found:", button);
    console.log("Button details:", {
        name: button.name,
        id: button.id,
        testId: button.getAttribute('data-testid'),
        ariaLabel: button.getAttribute('aria-labelledby'),
        disabled: button.disabled,
        type: button.type
    });
    
    // Check if it's the wrong button
    if (button.name && (button.name.includes('error') || button.name.includes('location-detection-error'))) {
        console.error("❌ This is the ERROR button, not the correct button!");
    } else {
        console.log("✓ Button appears to be correct");
        
        // Scroll into view
        button.scrollIntoView({ behavior: 'auto', block: 'center' });
        
        // Wait a moment
        setTimeout(() => {
            console.log("Attempting to click button...");
            
            // Try Method 1: Native click
            try {
                button.click();
                console.log("✓ Native click() called");
            } catch (e) {
                console.error("❌ Native click failed:", e);
            }
            
            // Try Method 2: Mouse events
            setTimeout(() => {
                try {
                    const mouseDown = new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window });
                    const mouseUp = new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window });
                    const clickEvent = new MouseEvent('click', { bubbles: true, cancelable: true, view: window });
                    
                    button.dispatchEvent(mouseDown);
                    button.dispatchEvent(mouseUp);
                    button.dispatchEvent(clickEvent);
                    console.log("✓ Mouse events dispatched");
                } catch (e) {
                    console.error("❌ Mouse events failed:", e);
                }
            }, 100);
            
            // Try Method 3: Form submit
            setTimeout(() => {
                try {
                    const form = button.closest('form');
                    if (form) {
                        form.submit();
                        console.log("✓ Form submit() called");
                    } else {
                        console.log("No form found for form submit");
                    }
                } catch (e) {
                    console.error("❌ Form submit failed:", e);
                }
            }, 200);
            
        }, 500);
    }
}

