import { redirect } from "next/navigation";

/** @deprecated Use `/projects`. */
export default function LegacyCoursesRedirectPage() {
  redirect("/projects");
}
