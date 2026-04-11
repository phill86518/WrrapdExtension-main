/**
 * Entry for the bundled content script. The legacy script is still one IIFE;
 * we import it for side effects until the code is split into real modules.
 */
import './content-legacy.js';
import './lib/amazon-delivery-hints.js';
