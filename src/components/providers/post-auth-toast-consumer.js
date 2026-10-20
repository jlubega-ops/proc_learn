"use client";

import { useEffect, useRef } from "react";
import { consumePostAuthToast } from "@/lib/auth/client-sign-out";
import { useToast } from "@/components/providers/toast-provider";

/**
 * Shows a toast queued before a hard navigation (login, role switch, org change).
 * Must render under ToastProvider.
 */
export function PostAuthToastConsumer() {
  const { showToast } = useToast();
  const done = useRef(false);

  useEffect(() => {
    if (done.current) return;
    done.current = true;
    const queued = consumePostAuthToast();
    if (!queued?.message) return;
    showToast({
      message: queued.message,
      severity: queued.severity === "success" ? "success" : "error",
      duration:
        typeof queued.duration === "number" && queued.duration > 0
          ? queued.duration
          : 6000,
    });
  }, [showToast]);

  return null;
}
