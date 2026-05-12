import { APP_NAME } from "@/lib/appConfig";
import { NotificationsPanel } from "@/components/notifications/notifications-panel";

export const metadata = {
  title: "Notifications",
  description: `Alerts and updates in ${APP_NAME}.`,
};

export default function NotificationsPage() {
  return (
    <div className="w-full rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Notifications</h1>
      <div className="mt-4">
        <NotificationsPanel />
      </div>
    </div>
  );
}
