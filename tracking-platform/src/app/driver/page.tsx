import { redirect } from "next/navigation";

/** Legacy /driver path → courier Driver console (not WrapStar). */
export default function DriverPageRedirect() {
  redirect("/courier");
}
