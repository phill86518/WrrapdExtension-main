import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import { portalKindForHost, type PortalKind } from "@/lib/portal-hosts";

const APPS: Record<
  PortalKind,
  { name: string; short_name: string; description: string; start_url: string }
> = {
  wrapstar: {
    name: "WrapStar",
    short_name: "WrapStar",
    description: "Wrap gifts for Wrrapd.",
    start_url: "/",
  },
  joyrider: {
    name: "JoyRider",
    short_name: "JoyRider",
    description: "Deliver gifts for Wrrapd.",
    start_url: "/",
  },
  wraprider: {
    name: "WrapRider",
    short_name: "WrapRider",
    description: "Wrap and deliver gifts for Wrrapd.",
    start_url: "/",
  },
};

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const h = await headers();
  const kind = portalKindForHost(h.get("x-forwarded-host") || h.get("host"));
  const app = kind ? APPS[kind] : APPS.wrapstar;
  const key = kind ?? "wrapstar";
  return {
    name: app.name,
    short_name: app.short_name,
    description: app.description,
    start_url: app.start_url,
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#0f0351",
    orientation: "portrait",
    icons: [
      {
        src: `/icons/app-${key}-192.png`,
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: `/icons/app-${key}-512.png`,
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: `/icons/app-${key}-512.png`,
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
