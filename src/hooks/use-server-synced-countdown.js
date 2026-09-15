"use client";

import { useEffect, useRef, useState } from "react";
import { resolveTimerCountdown } from "@/lib/server-clock";

/**
 * Live countdown driven by server `serverNow` + `deadlineAt` / `remainingSeconds`.
 * Device clock is only used for tick intervals after skew sync.
 *
 * @param {any} timer
 * @returns {{ remainingSeconds: number | null; expired: boolean }}
 */
export function useServerSyncedCountdown(timer) {
  const skewRef = useRef(0);
  const deadlineRef = useRef(/** @type {number | null} */ (null));
  const [remainingSeconds, setRemainingSeconds] = useState(/** @type {number | null} */ (null));

  useEffect(() => {
    const resolved = resolveTimerCountdown(timer);
    skewRef.current = resolved.skewMs;
    deadlineRef.current = resolved.deadlineMs;
    setRemainingSeconds(resolved.remainingSeconds);

    if (resolved.deadlineMs == null) {
      return undefined;
    }

    const tick = () => {
      const deadlineMs = deadlineRef.current;
      if (deadlineMs == null) {
        setRemainingSeconds(null);
        return;
      }
      const left = Math.max(
        0,
        Math.floor((deadlineMs - (Date.now() + skewRef.current)) / 1000),
      );
      setRemainingSeconds(left);
    };

    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [timer?.serverNow, timer?.deadlineAt, timer?.remainingSeconds, timer?.mode, timer?.expired]);

  const expired =
    Boolean(timer?.expired) ||
    (remainingSeconds != null && remainingSeconds === 0 && timer?.mode && timer.mode !== "NONE");

  return { remainingSeconds, expired };
}
