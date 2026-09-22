/**
 * Public / Command Center hire-role names.
 * Code, URLs, and CPT slugs still say "driver" — do not rename those without a migration.
 * See docs/WRAPSTARS-OPERATIONS-MODEL.md §4.
 */
export const JOYRIDER_LABEL = "JoyRider";
export const JOYRIDER_LABEL_PLURAL = "JoyRiders";
export const WRAPRIDER_LABEL = "WrapRider";
export const WRAPRIDER_LABEL_PLURAL = "WrapRiders";

export type HireRole = "wrapstar" | "driver" | "wraprider";

export function hireRoleLabel(role: HireRole): string {
  if (role === "driver") return JOYRIDER_LABEL;
  if (role === "wraprider") return WRAPRIDER_LABEL;
  return "WrapStar";
}

export function hireRoleLabelPlural(role: HireRole): string {
  if (role === "driver") return JOYRIDER_LABEL_PLURAL;
  if (role === "wraprider") return WRAPRIDER_LABEL_PLURAL;
  return "WrapStars";
}

export const WRAPSTAR_ONBOARDING_STEP_LABELS: Record<string, string> = {
  welcome: "Welcome",
  agreement: "Agreements (ESIGN I Accept)",
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

/** WrapRider onboarding (pros.wrrapd.com/wraprider-onboarding) — see wrrapd_wrapriders_onboarding_steps(). */
export const WRAPRIDER_ONBOARDING_STEP_LABELS: Record<string, string> = {
  welcome: "Welcome & Overview",
  agreement: "Agreements (ESIGN I Accept)",
  policies: "Wrap & Delivery Standards",
  orientation: "Orientation & Quiz",
  background: "Background Check",
  insurance: "Vehicle Insurance",
  identity: "Identity & License",
  workspace: "Wrapping Location",
  w9: "W-9",
  tax_1099: "Tax Acknowledgments",
  bank_payout: "Payout Setup",
  activation: "Apps & Final Review",
};

export function onboardingStepLabels(role: HireRole): Record<string, string> {
  return role === "wraprider" ? WRAPRIDER_ONBOARDING_STEP_LABELS : WRAPSTAR_ONBOARDING_STEP_LABELS;
}
