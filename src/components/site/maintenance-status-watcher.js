"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import RefreshRounded from "@mui/icons-material/RefreshRounded";

const POLL_MS = 30_000;

/** Polls the public status endpoint and leaves the maintenance page as soon as the site is back. */
export function MaintenanceStatusWatcher() {
  const [checking, setChecking] = useState(false);
  const inFlight = useRef(false);

  const check = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setChecking(true);
    try {
      const res = await fetch("/api/site/status", { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.maintenance === false) {
        window.location.replace("/");
        return;
      }
    } catch {
      // offline or server restarting; try again on the next tick
    } finally {
      inFlight.current = false;
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    const id = window.setInterval(check, POLL_MS);
    return () => window.clearInterval(id);
  }, [check]);

  return (
    <div className="mt-7 flex flex-col items-center gap-3">
      <Button
        variant="contained"
        color="primary"
        onClick={check}
        disabled={checking}
        startIcon={checking ? <CircularProgress size={16} color="inherit" /> : <RefreshRounded />}
        title="Check if the site is back"
      >
        {checking ? "Checking…" : "Try again"}
      </Button>
      <p className="text-xs text-zinc-500" role="status" aria-live="polite">
        This page refreshes automatically when we&apos;re back.
      </p>
    </div>
  );
}
