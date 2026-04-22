import { redirect } from "next/navigation";

/** Bookmarked `/platform` → canonical hub at `/`. */
export default function PlatformHubRedirect() {
  redirect("/");
}
