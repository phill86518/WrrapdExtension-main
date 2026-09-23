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
  w9: "W-9",
  tax_1099: "Tax Acknowledgments",
  bank_payout: "Payout Setup",
  background: "Background Check",
  insurance: "Proof of Insurance",
  identity: "Identity Verification",
  workspace: "Wrapping Location & Handoff",
  po_box: "Wrapping Location (legacy)",
  orientation: "Orientation & Quiz",
  activation: "Final Review",
};

/** WrapRider onboarding (pros.wrrapd.com/wraprider-onboarding) — see wrrapd_wrapriders_onboarding_steps(). */
export const WRAPRIDER_ONBOARDING_STEP_LABELS: Record<string, string> = {
  welcome: "Welcome & Overview",
  agreement: "Agreements (ESIGN I Accept)",
  policies: "Wrap & Delivery Standards",
  w9: "W-9",
  tax_1099: "Tax Acknowledgments",
  bank_payout: "Payout Setup",
  background: "Background Check",
  insurance: "Vehicle Insurance",
  identity: "Identity & License",
  workspace: "Wrapping Location",
  orientation: "Orientation & Quiz",
  activation: "Apps & Final Review",
};

export const JOYRIDER_ONBOARDING_STEP_LABELS: Record<string, string> = {
  welcome: "Welcome & Overview",
  agreement: "Agreements (ESIGN I Accept)",
  policies: "Policies & Safety",
  w9: "W-9",
  tax_1099: "Tax Acknowledgments",
  bank_payout: "Payout Setup",
  background: "Background Check",
  insurance: "Vehicle Insurance",
  identity: "Identity & License",
  orientation: "Orientation & Quiz",
  activation: "App Download & Final Review",
};

export function onboardingStepLabels(role: HireRole): Record<string, string> {
  if (role === "wraprider") return WRAPRIDER_ONBOARDING_STEP_LABELS;
  if (role === "driver") return JOYRIDER_ONBOARDING_STEP_LABELS;
  return WRAPSTAR_ONBOARDING_STEP_LABELS;
}
