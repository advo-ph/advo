import "@testing-library/jest-dom";

// Guarded: a test file may opt into the node environment (see preview-link),
// where there is no window and this shim has nothing to shim.
if (typeof window !== "undefined") {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => {},
    }),
  });

  /**
   * jsdom implements no ResizeObserver, and a component that constructs one throws
   * during its mount effect — which React reports as an uncaught error and the whole
   * render fails. That is what took `legal-compliance.test.ts` red: those pages mount
   * `landing-shell`, which mounts `LandingScrollbar`, which observes the document to
   * keep its thumb sized. Seventeen failures, none of them about legal disclosures.
   *
   * A no-op class, not a mock anyone asserts on. Nothing in this suite tests resize
   * behaviour — the scrollbar's real geometry is covered in a browser by
   * `bench:scroll` — so the only job here is to let the constructor succeed.
   */
  if (typeof globalThis.ResizeObserver === "undefined") {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
  }
}
