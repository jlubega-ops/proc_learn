/**
 * Like `setInterval`, but only while the tab is visible and the browser is online: hidden tabs
 * and offline machines send no traffic. When the tab comes back (or the network returns) after a
 * missed tick, `fn` runs once straight away so the screen catches up.
 * @param {() => void} fn
 * @param {number} ms
 * @returns {() => void} stop
 */
export function startVisibleInterval(fn, ms) {
  let missed = false;
  const canRun = () => document.visibilityState !== "hidden" && navigator.onLine !== false;
  const tick = () => {
    if (canRun()) fn();
    else missed = true;
  };
  const resume = () => {
    if (missed && canRun()) {
      missed = false;
      fn();
    }
  };
  const id = window.setInterval(tick, ms);
  document.addEventListener("visibilitychange", resume);
  window.addEventListener("online", resume);
  return () => {
    window.clearInterval(id);
    document.removeEventListener("visibilitychange", resume);
    window.removeEventListener("online", resume);
  };
}
