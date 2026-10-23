/**
 * Registers the ACU PWA service worker (only in production builds so dev HMR
 * is not interfered with). Safe to call from anywhere — early-exits when
 * service workers aren't supported.
 */
export function registerServiceWorker() {
  if (typeof window === "undefined") return;
  if (!("serviceWorker" in navigator)) return;
  if (!import.meta.env.PROD) return;

  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js")
      .catch((err) => {
        // eslint-disable-next-line no-console
        console.warn("[ACU] service worker registration failed", err);
      });
  });
}
