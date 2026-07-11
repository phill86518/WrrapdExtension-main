import { redirect } from "next/navigation";

/** Legacy path — companion lives at /wrapstar (middleware also redirects). */
export default function DriverPageRedirect() {
  redirect("/wrapstar");
}
