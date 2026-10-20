/**
 * Checkout UI — Wrrapd Inc. gift wrap opt-in (Preact / Polaris web components).
 * Support: help@wrrapd.com
 */
import "@shopify/ui-extensions/preact";
import { render } from "preact";
import { useState } from "preact/hooks";
import { useAttributeValues } from "@shopify/ui-extensions/checkout/preact";

export default async () => {
  render(<GiftWrapBlock />, document.body);
};

function GiftWrapBlock() {
  const [wrapOn, gifteeZipAttr, giftMessageAttr, occasionAttr] = useAttributeValues([
    "wrrapd_wrap",
    "wrrapd_giftee_zip",
    "wrrapd_gift_message",
    "wrrapd_occasion",
  ]);

  const [localOn, setLocalOn] = useState(false);
  const [gifteeZip, setGifteeZip] = useState("");
  const [occasion, setOccasion] = useState("");
  const [giftMessage, setGiftMessage] = useState("");

  const enabled = wrapOn === "1" || wrapOn === "true" || localOn;

  async function setAttr(key, value) {
    try {
      await shopify.applyAttributeChange({
        type: "updateAttribute",
        key,
        value: String(value || ""),
      });
    } catch {
      /* accelerated checkout / instructions can block writes */
    }
  }

  async function onToggle(event) {
    const checked = Boolean(event?.currentTarget?.checked ?? event?.target?.checked);
    setLocalOn(checked);
    await setAttr("wrrapd_wrap", checked ? "1" : "");
    if (!checked) {
      setGifteeZip("");
      setOccasion("");
      setGiftMessage("");
      await setAttr("wrrapd_giftee_zip", "");
      await setAttr("wrrapd_gift_message", "");
      await setAttr("wrrapd_occasion", "");
      await setAttr("wrrapd_hub_label", "");
    }
  }

  return (
    <s-stack direction="block" gap="base">
      <s-text type="strong">Wrrapd gift wrap</s-text>
      <s-checkbox
        checked={enabled}
        onChange={onToggle}
        label="Gift wrap & deliver with Wrrapd"
      />
      {enabled ? (
        <s-stack direction="block" gap="base">
          <s-banner tone="info" heading="Gift wrap & delivery">
            Your order ships to the Wrrapd hub. Wrrapd Inc. wraps it and delivers it to the giftee.
          </s-banner>
          <s-text-field
            label="Giftee / gift-recipient's zip code"
            value={gifteeZip || gifteeZipAttr || ""}
            onChange={(event) => {
              const v = event?.currentTarget?.value ?? event?.target?.value ?? "";
              setGifteeZip(v);
              setAttr("wrrapd_giftee_zip", v);
            }}
          />
          <s-text-field
            label="Occasion"
            value={occasion || occasionAttr || ""}
            onChange={(event) => {
              const v = event?.currentTarget?.value ?? event?.target?.value ?? "";
              setOccasion(v);
              setAttr("wrrapd_occasion", v);
            }}
          />
          <s-text-field
            label="Gift message"
            value={giftMessage || giftMessageAttr || ""}
            rows={3}
            onChange={(event) => {
              const v = event?.currentTarget?.value ?? event?.target?.value ?? "";
              setGiftMessage(v);
              setAttr("wrrapd_gift_message", v);
            }}
          />
          <s-text color="subdued">Questions? help@wrrapd.com · Wrrapd Inc.</s-text>
        </s-stack>
      ) : null}
    </s-stack>
  );
}
