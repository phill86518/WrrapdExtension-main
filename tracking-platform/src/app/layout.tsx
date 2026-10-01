import type { Metadata } from "next";
import { headers } from "next/headers";
import { Geist, Geist_Mono } from "next/font/google";
import { portalKindForHost, type PortalKind } from "@/lib/portal-hosts";
import "./globals.css";

const APP_TITLES: Record<PortalKind, string> = {
  wrapstar: "WrapStar",
  joyrider: "JoyRider",
  wraprider: "WrapRider",
};

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  const h = await headers();
  const kind = portalKindForHost(h.get("x-forwarded-host") || h.get("host"));
  const title = kind ? APP_TITLES[kind] : "W";
  const icon = kind ? `/icons/app-${kind}-512.png` : "/icons/w-mark.svg";
  const apple = kind ? `/icons/app-${kind}-180.png` : "/icons/w-mark.svg";
  return {
    title: kind ? title : "Wrrapd — Gifting & delivery tracking",
    description: kind
      ? `${title} app.`
      : "Wrrapd Chrome extension for Amazon checkout, plus live delivery tracking and team tools on Google Cloud.",
    applicationName: title,
    icons: {
      icon,
      apple,
    },
    manifest: "/manifest.webmanifest",
    appleWebApp: {
      capable: true,
      statusBarStyle: "default",
      title,
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
