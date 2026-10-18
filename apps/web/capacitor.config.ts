import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "ph.advo.app",
  appName: "ADVO",
  webDir: "dist",
  // "never" (the default) lets the WKWebView draw edge-to-edge under the
  // status bar / notch; all safe-area clearance is owned by the one CSS
  // mechanism in index.css's `.native-app` rules. `contentInset: "automatic"`
  // would additionally let UIKit auto-inset the WebView's content, stacking a
  // second top padding on top of the CSS env(safe-area-inset-top) padding —
  // this was the cause of the empty band above the admin header found during
  // integration verification.
  ios: {
    contentInset: "never",
  },
  plugins: {
    CapacitorUpdater: {
      autoUpdate: false,
    },
  },
};

export default config;
