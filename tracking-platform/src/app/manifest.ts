import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Wrrapd WrapStar",
    short_name: "W",
    description: "WrapStar companion for Wrrapd orders, GPS, and proof.",
    start_url: "/wrapstar",
    display: "standalone",
    background_color: "#0f172a",
    theme_color: "#0f172a",
    orientation: "portrait",
    icons: [
      {
        src: "/icons/w-mark.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
      {
        src: "/icons/w-mark.svg",
        sizes: "512x512",
        type: "image/svg+xml",
        purpose: "maskable",
      },
    ],
  };
}
