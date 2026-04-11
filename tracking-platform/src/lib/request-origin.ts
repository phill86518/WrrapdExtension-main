import { headers } from "next/headers";
import { resolvePublicOrigin } from "@/lib/public-origin";

/**
 * Public origin for the current request (safe on Cloud Run where Host may be localhost:8080).
 */
export async function getRequestOrigin(): Promise<string> {
  const h = await headers();
  return resolvePublicOrigin((name) => h.get(name), undefined);
}
