import { redirect } from "next/navigation";

/** For this deployment, the app home is the admin Command Center (not the marketing hub). */
export default function Home() {
  redirect("/admin");
}
