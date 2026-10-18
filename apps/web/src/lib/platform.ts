import { Capacitor } from "@capacitor/core";

/**
 * Single source of truth for native-only branching. Returns `false` in every
 * browser context (including Vitest's jsdom), so native-gated code paths
 * (OTA updater, NativeGate, SW suppression, safe-area CSS) stay no-ops on
 * the public web app at advo.ph.
 */
export const isNativeApp = () => Capacitor.isNativePlatform();
