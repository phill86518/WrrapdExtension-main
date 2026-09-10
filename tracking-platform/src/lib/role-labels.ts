/**
 * Public / Command Center hire-role names.
 * Code, URLs, and CPT slugs still say "driver" — do not rename those without a migration.
 * See docs/WRAPSTARS-OPERATIONS-MODEL.md §4.
 */
export const JOYRIDER_LABEL = "JoyRider";
export const JOYRIDER_LABEL_PLURAL = "JoyRiders";

export function hireRoleLabel(role: "wrapstar" | "driver"): string {
  return role === "driver" ? JOYRIDER_LABEL : "WrapStar";
}

export function hireRoleLabelPlural(role: "wrapstar" | "driver"): string {
  return role === "driver" ? JOYRIDER_LABEL_PLURAL : "WrapStars";
}

export const WRAPSTAR_ONBOARDING_STEP_LABELS: Record<string, string> = {
  welcome: "Welcome",
  agreement: "IC Agreement",
  policies: "Standards & Policies",
  orientation: "Orientation & Quiz",
  background: "Background Check",
  insurance: "Proof of Insurance",
  identity: "Identity Verification",
  workspace: "Wrapping Location & Handoff",
  po_box: "Wrapping Location (legacy)",
  w9: "W-9",
  tax_1099: "Tax Acknowledgments",
  bank_payout: "Payout Setup",
  activation: "Final Review",
};
