import { useId } from "react";
import "./flowing-background.css";

/** Quiet, layered paper waves. Transforms keep the animation off the JS thread. */
export default function FlowingBackground() {
  const id = useId();

  return (
    <div className="flowing-background" aria-hidden="true">
      <svg viewBox="0 0 1536 1024" preserveAspectRatio="xMidYMid slice" focusable="false">
        <defs>
          <linearGradient id={`${id}-upper`} x1="0" y1="0" x2="0.8" y2="1">
            <stop offset="0" stopColor="#ffffff" stopOpacity="0" />
            <stop offset="0.72" stopColor="#eef0f3" stopOpacity="0.65" />
            <stop offset="1" stopColor="#ffffff" stopOpacity="0.1" />
          </linearGradient>
          <linearGradient id={`${id}-lower`} x1="0.2" y1="0" x2="0.7" y2="1">
            <stop offset="0" stopColor="#edf0f3" stopOpacity="0.55" />
            <stop offset="0.75" stopColor="#ffffff" stopOpacity="0.05" />
          </linearGradient>
        </defs>
        <path className="flowing-background-upper" fill={`url(#${id}-upper)`} d="M-160-160H1500C1350 20 1210 100 1010 220S970 435 680 448 375 530 225 586 10 590-160 430Z" />
        <path className="flowing-background-middle" fill={`url(#${id}-lower)`} d="M-160 960C130 885 320 988 540 844S840 810 1000 650 1200 355 1450 382 1650 500 1700 520V1200H-160Z" />
        <path className="flowing-background-lower" fill={`url(#${id}-lower)`} d="M670 1200C800 1040 925 820 1110 660S1415 545 1700 450V1200Z" />
      </svg>
    </div>
  );
}
