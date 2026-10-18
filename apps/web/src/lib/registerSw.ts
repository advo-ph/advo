/**
 * Wraps `virtual:pwa-register` (vite-plugin-pwa) manually now that
 * `injectRegister: null` stops the plugin from auto-injecting its own
 * registration script (see vite.config.ts). This preserves web behavior
 * byte-for-byte: `registerSW({ immediate: true })` matches the effective
 * behavior of the plugin's own auto-injected script under
 * `registerType: "autoUpdate"`.
 *
 * `registerWebServiceWorker()` must only ever be called when `!isNativeApp()`
 * — the native shell never registers a service worker, so it never competes
 * with the Capacitor OTA updater for control of cached assets.
 */
export async function registerWebServiceWorker(): Promise<void> {
  const { registerSW } = await import("virtual:pwa-register");
  registerSW({ immediate: true });
}

/**
 * One-time defensive cleanup for the native shell: unregisters any service
 * worker that might exist from an earlier manual WebView test build. Cheap
 * and harmless if none exist. Only ever called when `isNativeApp()`.
 */
export async function unregisterAllServiceWorkers(): Promise<void> {
  if (!("serviceWorker" in navigator)) return;
  const registrations = await navigator.serviceWorker.getRegistrations();
  await Promise.all(registrations.map((registration) => registration.unregister()));
}
