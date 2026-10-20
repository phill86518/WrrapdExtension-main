import { authenticate, clearShopData } from "../shopify.server";
import {
  forwardOrderToWrrapd,
  forwardPrivacyToWrrapd,
  orderWantsWrrapd,
} from "../wrrapd-forward.server";

export const action = async ({ request }) => {
  const { topic, shop, payload } = await authenticate.webhook(request);

  switch (topic) {
    case "APP_UNINSTALLED":
      await clearShopData(shop);
      break;

    case "ORDERS_PAID":
    case "ORDERS_CREATE": {
      if (!orderWantsWrrapd(payload)) break;
      const result = await forwardOrderToWrrapd({
        shop,
        topic,
        order: payload,
        receivedAt: new Date().toISOString(),
      });
      if (!result.ok) {
        console.error("[wrrapd shopify] forward failed", shop, result.status, result.body);
        return new Response(JSON.stringify(result.body), { status: 500 });
      }
      break;
    }

    case "CUSTOMERS_DATA_REQUEST":
    case "CUSTOMERS_REDACT":
    case "SHOP_REDACT": {
      const result = await forwardPrivacyToWrrapd({
        shop,
        topic,
        payload,
        receivedAt: new Date().toISOString(),
      });
      if (!result.ok) {
        console.error("[wrrapd shopify] privacy forward failed", shop, topic, result.status, result.body);
        return new Response(JSON.stringify(result.body), { status: 500 });
      }
      break;
    }

    default:
      break;
  }

  return new Response();
};
