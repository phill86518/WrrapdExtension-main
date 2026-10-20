import { authenticate, prisma } from "../shopify.server";
import { forwardOrderToWrrapd, orderWantsWrrapd } from "../wrrapd-forward.server";

export const action = async ({ request }) => {
  const { topic, shop, payload } = await authenticate.webhook(request);

  switch (topic) {
    case "APP_UNINSTALLED":
      if (shop) {
        await prisma.session.deleteMany({ where: { shop } });
        await prisma.shopSettings.deleteMany({ where: { shop } }).catch(() => undefined);
      }
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
        // 500 so Shopify retries transient failures
        return new Response(JSON.stringify(result.body), { status: 500 });
      }
      break;
    }

    default:
      break;
  }

  return new Response();
};
