import { useRef } from "react";
import { useScroll, type MotionValue } from "framer-motion";

/**
 * Canonical #root scroll-progress hook.
 *
 * The app scrolls inside `#root` (see index.css: `#root { overflow-y: auto }`),
 * NOT the window — so `window.scrollY` reads 0 and a default `useScroll()` never
 * advances. This hook feeds the resolved `#root` element to
 * `useScroll({ container })`. Every scroll-linked consumer reuses this so the
 * "#root gotcha" is solved once.
 *
 * IMPORTANT: pass the ALREADY-RESOLVED root element. The caller must resolve
 * `document.getElementById("root")` into state and only mount the component that
 * calls this hook once that element is non-null. framer-motion's `useScroll`
 * memoizes its scroll attachment against the container ref's identity and
 * resolves `ref.current` in a microtask that flushes before a post-mount state
 * update commits — so a ref that starts null and is filled later never attaches
 * (it silently reads 0 in prod and throws "Container ref is defined but not
 * hydrated" in dev). Gating the mount on a non-null element avoids that race.
 *
 * Returns a MotionValue<number> in [0, 1].
 */
export function useRootScrollProgress(root: HTMLElement): MotionValue<number> {
  // `root` is stable across renders (resolved once into the caller's state),
  // so seeding the ref with it gives useScroll a live element on first render.
  const ref = useRef<HTMLElement>(root);
  ref.current = root;

  const { scrollYProgress } = useScroll({ container: ref });
  return scrollYProgress;
}

// Usage (caller gates the mount on a resolved element):
//   const [root, setRoot] = useState<HTMLElement | null>(null);
//   useEffect(() => setRoot(document.getElementById("root")), []);
//   return root ? <ScrollConsumer root={root} /> : null;
//   // inside ScrollConsumer: const progress = useRootScrollProgress(root);
