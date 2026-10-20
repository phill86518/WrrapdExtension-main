/**
 * Checkout UI — Wrrapd Inc. gift wrap opt-in.
 * Support: help@wrrapd.com
 */
import {
  reactExtension,
  BlockStack,
  Checkbox,
  Text,
  TextField,
  Banner,
  useApplyAttributeChange,
  useAttributeValues,
} from "@shopify/ui-extensions-react/checkout";

const WRRAPD_API = "https://api.wrrapd.com";

export default reactExtension("purchase.checkout.block.render", () => <GiftWrapBlock />);

function GiftWrapBlock() {
  const applyAttributeChange = useApplyAttributeChange();
  const [wrapOn, gifteeZip, giftMessage, occasion] = useAttributeValues([
    "_wrrapd_wrap",
    "_wrrapd_giftee_zip",
    "_wrrapd_gift_message",
    "_wrrapd_occasion",
  ]);

  const enabled = wrapOn === "1" || wrapOn === "true";

  async function setAttr(key, value) {
    await applyAttributeChange({ type: "updateAttribute", key, value: String(value || "") });
  }

  async function onToggle(checked) {
    await setAttr("_wrrapd_wrap", checked ? "1" : "");
    if (!checked) {
      await setAttr("_wrrapd_giftee_zip", "");
      await setAttr("_wrrapd_gift_message", "");
      await setAttr("_wrrapd_occasion", "");
      await setAttr("_wrrapd_hub_label", "");
    }
  }

  async function onZipBlur(value) {
    const zip = String(value || "").replace(/\D/g, "").slice(0, 5);
    await setAttr("_wrrapd_giftee_zip", zip);
    if (zip.length !== 5) return;
    try {
      const res = await fetch(`${WRRAPD_API}/api/delivery-hub?postalCode=${encodeURIComponent(zip)}`, {
        credentials: "omit",
        cache: "no-store",
      });
      const body = await res.json();
      const hub = body?.hub;
      if (hub?.addressLine1) {
        const label = [
          hub.organization || "Wrrapd Inc.",
          hub.addressLine1,
          `${hub.city}, ${hub.state} ${hub.postalCode}`,
        ]
          .filter(Boolean)
          .join(", ");
        await setAttr("_wrrapd_hub_label", label);
      }
    } catch {
      /* hub lookup is best-effort in checkout */
    }
  }

  return (
    <BlockStack spacing="base">
      <Checkbox checked={enabled} onChange={onToggle}>
        Gift wrap & deliver with Wrrapd
      </Checkbox>
      {enabled ? (
        <BlockStack spacing="tight">
          <Banner status="info">
            Your order ships to the Wrrapd hub. Wrrapd Inc. wraps it and delivers it to the giftee.
          </Banner>
          <TextField
            label="Giftee / gift-recipient's zip code"
            value={gifteeZip || ""}
            onChange={(v) => setAttr("_wrrapd_giftee_zip", v)}
            onBlur={() => onZipBlur(gifteeZip)}
          />
          <TextField
            label="Occasion"
            value={occasion || ""}
            onChange={(v) => setAttr("_wrrapd_occasion", v)}
          />
          <TextField
            label="Gift message"
            value={giftMessage || ""}
            multiline={3}
            onChange={(v) => setAttr("_wrrapd_gift_message", v)}
          />
          <Text appearance="subdued" size="small">
            Questions? help@wrrapd.com · Wrrapd Inc.
          </Text>
        </BlockStack>
      ) : null}
    </BlockStack>
  );
}
