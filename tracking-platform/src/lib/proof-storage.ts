import { randomUUID } from "crypto";
import { getStorageBucket } from "@/lib/firebase-admin";

const DATA_URL_RE = /^data:([^;]+);base64,([\s\S]+)$/i;

const MAX_PROOF_BYTES = 15 * 1024 * 1024;

/**
 * Upload a proof image data URL to the configured GCS / Firebase Storage bucket
 * and return a stable HTTPS URL (Firebase download URL with token when supported).
 * Returns null if storage is not configured or upload fails — caller should keep inline data URL.
 */
export async function uploadProofDataUrl(dataUrl: string, orderId: string): Promise<string | null> {
  const trimmed = dataUrl.trim();
  const match = trimmed.match(DATA_URL_RE);
  if (!match) return null;

  const contentTypeRaw = match[1]?.trim().toLowerCase() || "image/jpeg";
  const base64 = match[2]?.replace(/\s/g, "") || "";
  let buffer: Buffer;
  try {
    buffer = Buffer.from(base64, "base64");
  } catch {
    return null;
  }
  if (!buffer.length || buffer.length > MAX_PROOF_BYTES) return null;

  const bucket = getStorageBucket();
  if (!bucket) return null;

  const ext = contentTypeRaw.includes("png")
    ? "png"
    : contentTypeRaw.includes("webp")
      ? "webp"
      : contentTypeRaw.includes("gif")
        ? "gif"
        : "jpg";

  const objectPath = `proof/${orderId}/${Date.now()}-${randomUUID().slice(0, 8)}.${ext}`;
  const downloadToken = randomUUID();
  const file = bucket.file(objectPath);

  try {
    await file.save(buffer, {
      resumable: false,
      metadata: {
        contentType: contentTypeRaw || "image/jpeg",
        metadata: {
          firebaseStorageDownloadTokens: downloadToken,
        },
      },
    });
  } catch (err) {
    console.error("[proof-storage] upload failed", err);
    return null;
  }

  const bucketName = bucket.name;
  const encodedPath = encodeURIComponent(objectPath);
  return `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodedPath}?alt=media&token=${downloadToken}`;
}
