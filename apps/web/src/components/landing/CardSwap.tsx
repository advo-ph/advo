import React, {
  Children,
  cloneElement,
  forwardRef,
  isValidElement,
  useEffect,
  useMemo,
  useRef,
} from "react";
import gsap from "gsap";
import "./CardSwap.css";

/**
 * CardSwap, from React Bits (JS + CSS variant), ported to TypeScript.
 *
 * One departure from upstream, and it is the reason the component is here.
 * Prince, 09-03: "as u scroll, i want it to go to the next card ... do not
 * limit or affect the scroll itself ... ofc this can go forward and backward".
 * Upstream only knows how to advance on a timer, and its swap is a one-way
 * timeline — the front card drops, the rest promote, the dropped card returns
 * to the back. Played in reverse that reads as the stack un-shuffling itself.
 *
 * So when `activeIndex` is supplied the timer is off and the stack is a pure
 * function of that number: card `activeIndex` holds the front slot, everything
 * after it stacks behind, everything before it has already dropped out of the
 * bottom of the frame. Every state is reachable from every other state by one
 * tween, which is what makes scrolling back up look like scrolling back up.
 *
 * With `activeIndex` omitted the component is upstream's, unchanged.
 */

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  customClass?: string;
}

export const Card = forwardRef<HTMLDivElement, CardProps>(({ customClass, ...rest }, ref) => (
  <div ref={ref} {...rest} className={`card ${customClass ?? ""} ${rest.className ?? ""}`.trim()} />
));
Card.displayName = "Card";

interface Slot {
  x: number;
  y: number;
  z: number;
  zIndex: number;
}

const makeSlot = (i: number, distX: number, distY: number, total: number): Slot => ({
  x: i * distX,
  y: -i * distY,
  z: -i * distX * 1.5,
  zIndex: total - i,
});

const placeNow = (el: HTMLDivElement, slot: Slot, skew: number) =>
  gsap.set(el, {
    x: slot.x,
    y: slot.y,
    z: slot.z,
    xPercent: -50,
    yPercent: -50,
    skewY: skew,
    transformOrigin: "center center",
    zIndex: slot.zIndex,
    force3D: true,
  });

export interface CardSwapProps {
  width?: number | string;
  height?: number | string;
  cardDistance?: number;
  verticalDistance?: number;
  delay?: number;
  pauseOnHover?: boolean;
  onCardClick?: (idx: number) => void;
  skewAmount?: number;
  easing?: "linear" | "elastic";
  /**
   * Index of the card in the front slot. Supplying it hands the stack to the
   * caller: the timer never starts, and every change tweens to the new state.
   */
  activeIndex?: number;
  /** Skip the tweens and snap. Set from `prefers-reduced-motion`. */
  instant?: boolean;
  children: React.ReactNode;
}

const CardSwap = ({
  width = 500,
  height = 400,
  cardDistance = 60,
  verticalDistance = 70,
  delay = 5000,
  pauseOnHover = false,
  onCardClick,
  skewAmount = 6,
  easing = "elastic",
  activeIndex,
  instant = false,
  children,
}: CardSwapProps) => {
  const config =
    easing === "elastic"
      ? {
          ease: "elastic.out(0.6,0.9)",
          durDrop: 2,
          durMove: 2,
          durReturn: 2,
          promoteOverlap: 0.9,
          returnDelay: 0.05,
        }
      : {
          ease: "power1.inOut",
          durDrop: 0.8,
          durMove: 0.8,
          durReturn: 0.8,
          promoteOverlap: 0.45,
          returnDelay: 0.2,
        };

  const childArr = useMemo(() => Children.toArray(children), [children]);
  const refs = useMemo(
    () => childArr.map(() => React.createRef<HTMLDivElement>()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [childArr.length],
  );

  const order = useRef<number[]>(Array.from({ length: childArr.length }, (_, i) => i));

  const tlRef = useRef<gsap.core.Timeline | null>(null);
  const intervalRef = useRef<number | undefined>(undefined);
  const container = useRef<HTMLDivElement>(null);

  const isDriven = typeof activeIndex === "number";

  // ------------------------------------------------------------- scroll mode

  /**
   * A card the reader has scrolled past falls out of the bottom of the frame
   * rather than wrapping to the back of the stack. Wrapping is only legible in
   * one direction; falling reverses cleanly, and it is the same gesture
   * upstream uses for the card it retires.
   */
  const DROP = 1.35;

  useEffect(() => {
    if (!isDriven) return;
    const total = refs.length;
    if (!total) return;

    const boxH = container.current?.getBoundingClientRect().height ?? 0;
    const index = Math.min(Math.max(activeIndex ?? 0, 0), total - 1);

    refs.forEach((r, i) => {
      const el = r.current;
      if (!el) return;

      const rel = i - index;
      const gone = rel < 0;
      const slot = makeSlot(gone ? 0 : rel, cardDistance, verticalDistance, total);

      // Dropped cards leave over the stack, not behind it — the same read as a
      // card being dealt off the top.
      gsap.set(el, { zIndex: gone ? total + 1 : slot.zIndex });
      gsap.to(el, {
        x: slot.x,
        y: gone ? slot.y + boxH * DROP : slot.y,
        z: slot.z,
        xPercent: -50,
        yPercent: -50,
        skewY: skewAmount,
        transformOrigin: "center center",
        autoAlpha: gone ? 0 : 1,
        force3D: true,
        overwrite: "auto",
        duration: instant ? 0 : 0.85,
        ease: "power3.out",
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDriven, activeIndex, cardDistance, verticalDistance, skewAmount, instant, refs.length]);

  // -------------------------------------------------------------- timer mode

  useEffect(() => {
    if (isDriven) return;
    const total = refs.length;
    refs.forEach((r, i) => {
      if (r.current) placeNow(r.current, makeSlot(i, cardDistance, verticalDistance, total), skewAmount);
    });

    const swap = () => {
      if (order.current.length < 2) return;

      const [front, ...rest] = order.current;
      const elFront = refs[front].current;
      if (!elFront) return;
      const tl = gsap.timeline();
      tlRef.current = tl;

      tl.to(elFront, {
        y: "+=500",
        duration: config.durDrop,
        ease: config.ease,
      });

      tl.addLabel("promote", `-=${config.durDrop * config.promoteOverlap}`);
      rest.forEach((idx, i) => {
        const el = refs[idx].current;
        if (!el) return;
        const slot = makeSlot(i, cardDistance, verticalDistance, refs.length);
        tl.set(el, { zIndex: slot.zIndex }, "promote");
        tl.to(
          el,
          { x: slot.x, y: slot.y, z: slot.z, duration: config.durMove, ease: config.ease },
          `promote+=${i * 0.15}`,
        );
      });

      const backSlot = makeSlot(refs.length - 1, cardDistance, verticalDistance, refs.length);
      tl.addLabel("return", `promote+=${config.durMove * config.returnDelay}`);
      tl.call(
        () => {
          gsap.set(elFront, { zIndex: backSlot.zIndex });
        },
        undefined,
        "return",
      );
      tl.to(
        elFront,
        { x: backSlot.x, y: backSlot.y, z: backSlot.z, duration: config.durReturn, ease: config.ease },
        "return",
      );

      tl.call(() => {
        order.current = [...rest, front];
      });
    };

    swap();
    intervalRef.current = window.setInterval(swap, delay);

    if (pauseOnHover) {
      const node = container.current;
      if (!node) return;
      const pause = () => {
        tlRef.current?.pause();
        clearInterval(intervalRef.current);
      };
      const resume = () => {
        tlRef.current?.play();
        intervalRef.current = window.setInterval(swap, delay);
      };
      node.addEventListener("mouseenter", pause);
      node.addEventListener("mouseleave", resume);
      return () => {
        node.removeEventListener("mouseenter", pause);
        node.removeEventListener("mouseleave", resume);
        clearInterval(intervalRef.current);
      };
    }
    return () => clearInterval(intervalRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDriven, cardDistance, verticalDistance, delay, pauseOnHover, skewAmount, easing]);

  const rendered = childArr.map((child, i) =>
    isValidElement<CardProps>(child)
      ? cloneElement(child, {
          key: i,
          ref: refs[i],
          style: { width, height, ...(child.props.style ?? {}) },
          onClick: (e: React.MouseEvent<HTMLDivElement>) => {
            child.props.onClick?.(e);
            onCardClick?.(i);
          },
        } as Partial<CardProps> & { ref: React.RefObject<HTMLDivElement> })
      : child,
  );

  return (
    <div ref={container} className="card-swap-container" style={{ width, height }}>
      {rendered}
    </div>
  );
};

export default CardSwap;
