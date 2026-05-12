"use client";

import { useEffect, useState } from "react";

function bannerStyles(online) {
  if (online) {
    return {
      text: "You are back online. You can continue.",
      className:
        "border border-emerald-600/40 bg-emerald-950/90 text-emerald-50 dark:bg-emerald-950/80",
    };
  }
  return {
    text: "You are not connected to the internet. Please connect and try again.",
    className:
      "border border-red-600/50 bg-red-950/90 text-red-50 dark:bg-red-950/80",
  };
}

/**
 * Gmail-style connectivity notice (does not replace per-request error handling).
 */
export function ConnectionBanner() {
  const [online, setOnline] = useState(true);
  const [showOnlineToast, setShowOnlineToast] = useState(false);

  useEffect(() => {
    setOnline(typeof navigator !== "undefined" ? navigator.onLine : true);

    const onOnline = () => {
      setOnline(true);
      setShowOnlineToast(true);
      window.setTimeout(() => setShowOnlineToast(false), 6000);
    };

    const onOffline = () => {
      setOnline(false);
      setShowOnlineToast(false);
    };

    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  const showOfflineBar = !online;
  const showOnlineBar = online && showOnlineToast;

  if (!showOfflineBar && !showOnlineBar) return null;

  const effectiveOnline = showOnlineBar;
  const { text, className } = bannerStyles(effectiveOnline);

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 top-0 z-[100] flex justify-center px-3 pt-3"
    >
      <div
        className={`pointer-events-auto max-w-lg rounded-lg px-4 py-2 text-center text-sm shadow-lg ${className}`}
      >
        {text}
      </div>
    </div>
  );
}
