import { randomUUID } from "crypto";
import { getStorageBucket } from "@/lib/firebase-admin";

const DATA_URL_RE = /^data:([^;]+);base64,([\s\S]+)$/i;

const MAX_PROOF_BYTES = 15 * 1024 * 1024;
/** Soft cap for a single video segment (~30 min) — 500 MB. */
const MAX_VIDEO_BYTES = 500 * 1024 * 1024;
const SIGNED_UPLOAD_TTL_MS = 30 * 60 * 1000;

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

  const ext = contentTypeRaw.includes("png")
    ? "png"
    : contentTypeRaw.includes("webp")
      ? "webp"
      : contentTypeRaw.includes("gif")
        ? "gif"
        : "jpg";

  const objectPath = `proof/${orderId}/${Date.now()}-${randomUUID().slice(0, 8)}.${ext}`;
  const uploaded = await uploadBufferToStorage(buffer, objectPath, contentTypeRaw || "image/jpeg");
  return uploaded?.downloadUrl ?? null;
}

export type StorageUploadResult = {
  objectPath: string;
  downloadUrl: string;
  downloadToken: string;
};

/** Upload an arbitrary buffer (QR PNG, video finalization fallback, etc.). */
export async function uploadBufferToStorage(
  buffer: Buffer,
  objectPath: string,
  contentType: string,
): Promise<StorageUploadResult | null> {
  if (!buffer.length) return null;
  const bucket = getStorageBucket();
  if (!bucket) return null;

  const downloadToken = randomUUID();
  const file = bucket.file(objectPath);

  try {
    await file.save(buffer, {
      resumable: buffer.length > 5 * 1024 * 1024,
      metadata: {
        contentType: contentType || "application/octet-stream",
        metadata: {
          firebaseStorageDownloadTokens: downloadToken,
        },
      },
    });
  } catch (err) {
    console.error("[proof-storage] uploadBufferToStorage failed", err);
    return null;
  }

  const bucketName = bucket.name;
  const encodedPath = encodeURIComponent(objectPath);
  return {
    objectPath,
    downloadUrl: `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodedPath}?alt=media&token=${downloadToken}`,
    downloadToken,
  };
}

export type SignedVideoUpload = {
  uploadUrl: string;
  objectPath: string;
  contentType: string;
  expiresAt: string;
};

/**
 * Create a V4 signed PUT URL for a WrapStar shift video segment.
 * Client PUTs the blob to uploadUrl, then calls finalizeStorageObject via the video API.
 */
export async function createSignedVideoUploadUrl(opts: {
  shiftId: string;
  giftId: string;
  segmentIndex: number;
  contentType?: string;
}): Promise<SignedVideoUpload | null> {
  const bucket = getStorageBucket();
  if (!bucket) return null;

  const contentType = opts.contentType?.trim() || "video/webm";
  const ext = contentType.includes("mp4")
    ? "mp4"
    : contentType.includes("quicktime") || contentType.includes("mov")
      ? "mov"
      : "webm";
  const objectPath = `shift-video/${opts.shiftId}/${opts.giftId}/seg-${opts.segmentIndex}-${Date.now()}-${randomUUID().slice(0, 8)}.${ext}`;
  const file = bucket.file(objectPath);

  try {
    const [uploadUrl] = await file.getSignedUrl({
      version: "v4",
      action: "write",
      expires: Date.now() + SIGNED_UPLOAD_TTL_MS,
      contentType,
    });

    return {
      uploadUrl,
      objectPath,
      contentType,
      expiresAt: new Date(Date.now() + SIGNED_UPLOAD_TTL_MS).toISOString(),
    };
  } catch (err) {
    console.error("[proof-storage] createSignedVideoUploadUrl failed", err);
    return null;
  }
}

/** After a client PUT, attach a Firebase download token and return a stable HTTPS URL. */
export async function finalizeStorageObject(
  objectPath: string,
  contentType?: string,
): Promise<StorageUploadResult | null> {
  const bucket = getStorageBucket();
  if (!bucket) return null;
  const file = bucket.file(objectPath);
  const downloadToken = randomUUID();
  try {
    const [exists] = await file.exists();
    if (!exists) return null;
    await file.setMetadata({
      contentType: contentType || "video/webm",
      metadata: {
        firebaseStorageDownloadTokens: downloadToken,
      },
    });
  } catch (err) {
    console.error("[proof-storage] finalizeStorageObject failed", err);
    return null;
  }
  const bucketName = bucket.name;
  const encodedPath = encodeURIComponent(objectPath);
  return {
    objectPath,
    downloadUrl: `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodedPath}?alt=media&token=${downloadToken}`,
    downloadToken,
  };
}

/** Direct server-side video buffer upload (fallback when signed URL is unavailable). */
export async function uploadVideoBuffer(opts: {
  shiftId: string;
  giftId: string;
  segmentIndex: number;
  buffer: Buffer;
  contentType?: string;
}): Promise<StorageUploadResult | null> {
  if (!opts.buffer.length || opts.buffer.length > MAX_VIDEO_BYTES) return null;
  const contentType = opts.contentType?.trim() || "video/webm";
  const ext = contentType.includes("mp4")
    ? "mp4"
    : contentType.includes("quicktime") || contentType.includes("mov")
      ? "mov"
      : "webm";
  const objectPath = `shift-video/${opts.shiftId}/${opts.giftId}/seg-${opts.segmentIndex}-${Date.now()}-${randomUUID().slice(0, 8)}.${ext}`;
  return uploadBufferToStorage(opts.buffer, objectPath, contentType);
}

export { MAX_VIDEO_BYTES };
