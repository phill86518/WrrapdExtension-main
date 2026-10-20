import { useCallback } from "react";
import { useLoaderData, useOutletContext, useSubmit, useNavigation } from "@remix-run/react";
import { json } from "@remix-run/node";
import {
  Page,
  Layout,
  Card,
  Text,
  TextContainer,
  Banner,
  Button,
  InlineStack,
  BlockStack,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { getShopSettings, setShopWrapEnabled } from "../shop-settings.server";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const settings = await getShopSettings(shop);
  return json({
    shop,
    wrapEnabled: settings.wrapEnabled,
    supportEmail: process.env.WRRAPD_SUPPORT_EMAIL || "help@wrrapd.com",
    legalName: process.env.WRRAPD_LEGAL_NAME || "Wrrapd Inc.",
    supportAddress:
      process.env.WRRAPD_SUPPORT_ADDRESS ||
      "7901 4th St N, Ste 300, St. Petersburg, FL 33702",
  });
};

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const form = await request.formData();
  const wrapEnabled = form.get("wrapEnabled") === "true";
  await setShopWrapEnabled(shop, wrapEnabled);
  return json({ ok: true, wrapEnabled });
};

export default function Index() {
  const data = useLoaderData();
  const ctx = useOutletContext() || {};
  const submit = useSubmit();
  const navigation = useNavigation();
  const busy = navigation.state !== "idle";
  const supportEmail = data.supportEmail || ctx.supportEmail || "help@wrrapd.com";
  const legalName = data.legalName || ctx.legalName || "Wrrapd Inc.";

  const toggle = useCallback(() => {
    const form = new FormData();
    form.set("wrapEnabled", data.wrapEnabled ? "false" : "true");
    submit(form, { method: "post" });
  }, [data.wrapEnabled, submit]);

  return (
    <Page title="Wrrapd Gift Wrap & Delivery" subtitle={legalName}>
      <BlockStack gap="400">
        <Banner tone="info">
          <p>
            When shoppers choose Wrrapd, merchandise ships to the Wrrapd hub. {legalName}{" "}
            gift-wraps the order and delivers it to the giftee. Your store does not wrap
            in-house.
          </p>
        </Banner>

        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">
                  Gift wrap on this store
                </Text>
                <Text as="p" variant="bodyMd">
                  Status:{" "}
                  <Text as="span" fontWeight="semibold">
                    {data.wrapEnabled ? "On" : "Off"}
                  </Text>
                </Text>
                <InlineStack gap="300">
                  <Button variant="primary" onClick={toggle} loading={busy}>
                    {data.wrapEnabled ? "Turn off" : "Turn on"}
                  </Button>
                </InlineStack>
              </BlockStack>
            </Card>
          </Layout.Section>

          <Layout.Section variant="oneThird">
            <Card>
              <BlockStack gap="200">
                <Text as="h2" variant="headingMd">
                  Support
                </Text>
                <TextContainer>
                  <p>{legalName}</p>
                  <p>
                    <a href={`mailto:${supportEmail}`}>{supportEmail}</a>
                  </p>
                  <p>{data.supportAddress}</p>
                </TextContainer>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>
      </BlockStack>
    </Page>
  );
}
