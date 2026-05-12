import { redirect } from "next/navigation";

export const metadata = {
  title: "Settings",
};

export default function SettingsPage() {
  redirect("/profile?tab=settings");
}
