import { redirect } from "next/navigation";

export const metadata = {
  title: "Users",
};

/** @deprecated Use `/admin/staff` for staff directory. */
export default function AdminUsersRedirectPage() {
  redirect("/admin/staff");
}
