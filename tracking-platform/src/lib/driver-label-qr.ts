import { createHmac, randomBytes } from "crypto";
import QRCode from "qrcode";
import type { Order } from "./types";
import { uploadBufferToStorage } from "./proof-storage";

export type DriverLabelPayload = {
  type: "wrrapd_driver_label_v1";
  v: 1;
  orderNumber: string;
  orderId: string;
  pickupFlowers: boolean;
  floristOrderNumber: string | null;
  giftee: {
    name: string;
    addressLine1: string;
    addressLine2?: string;
    city: string;
    state: string;
    postalCode: string;
  };
  deliverBy: string;
  specialInstructions: string;
  /** HMAC so only apps with DRIVER_QR_HMAC_SECRET accept the payload as authentic. */
  sig: string;
};

function hmacSecret(): string {
  return (
    process.env.DRIVER_QR_HMAC_SECRET ||
    process.env.SESSION_SECRET ||
    "wrrapd-driver-qr-dev-only"
  );
}

function signBody(bodyWithoutSig: Omit<DriverLabelPayload, "sig">): string {
  const canonical = JSON.stringify(bodyWithoutSig);
  return createHmac("sha256", hmacSecret()).update(canonical).digest("hex");
}

export function orderNeedsFlowerPickup(order: Order): boolean {
  if (order.pickupFlowers === true) return true;
  if ((order.flowersRevenueCents ?? 0) > 0) return true;
  return Boolean(order.lineItems?.some((li) => li.flowers === true));
}

export function buildDriverLabelPayload(order: Order): DriverLabelPayload {
  const orderNumber = order.externalOrderId?.trim() || order.id;
  const deliverBy =
    order.deliverBy?.trim() ||
    order.scheduledFor ||
    order.retailerEstimatedDeliveryDate ||
    "";
  const specialInstructions = order.deliveryInstructions?.trim() || "";
  const pickupFlowers = orderNeedsFlowerPickup(order);
  const floristOrderNumber = order.floristOrderNumber?.trim() || null;

  const body: Omit<DriverLabelPayload, "sig"> = {
    type: "wrrapd_driver_label_v1",
    v: 1,
    orderNumber,
    orderId: order.id,
    pickupFlowers,
    floristOrderNumber: pickupFlowers ? floristOrderNumber : null,
    giftee: {
      name: order.recipientName,
      addressLine1: order.addressLine1,
      ...(order.addressLine2 ? { addressLine2: order.addressLine2 } : {}),
      city: order.city,
      state: order.state,
      postalCode: order.postalCode,
    },
    deliverBy,
    specialInstructions,
  };

  return { ...body, sig: signBody(body) };
}

export function verifyDriverLabelPayload(payload: DriverLabelPayload): boolean {
  if (payload.type !== "wrrapd_driver_label_v1") return false;
  const { sig, ...rest } = payload;
  const expected = signBody(rest);
  return Boolean(sig && expected && sig === expected);
}

export function newDriverLabelToken(): string {
  return randomBytes(24).toString("base64url");
}

/**
 * QR encodes a scan URL (Drivers open in Driver app) plus signed payload query is avoided —
 * token resolves server-side so only designated Drivers see full details.
 */
export async function generateDriverLabelQr(order: Order, token: string): Promise<{
  payload: DriverLabelPayload;
  barcodeDataUrl: string;
  storedUrl: string | null;
  scanPath: string;
}> {
  const payload = buildDriverLabelPayload(order);
  const base =
    process.env.NEXT_PUBLIC_TRACKING_BASE_URL?.replace(/\/$/, "") ||
    process.env.WRRAPD_PUBLIC_TRACKING_URL?.replace(/\/$/, "") ||
    "";
  const scanPath = `/api/driver/scan/${token}`;
  const qrContent = base ? `${base}${scanPath}` : JSON.stringify(payload);

  const barcodeDataUrl = await QRCode.toDataURL(qrContent, {
    errorCorrectionLevel: "M",
    margin: 2,
    width: 512,
  });
  const pngBase64 = barcodeDataUrl.replace(/^data:image\/png;base64,/, "");
  const uploaded = await uploadBufferToStorage(
    Buffer.from(pngBase64, "base64"),
    `driver-labels/${order.id}/${Date.now()}.png`,
    "image/png",
  );

  return {
    payload,
    barcodeDataUrl,
    storedUrl: uploaded?.downloadUrl ?? null,
    scanPath,
  };
}
