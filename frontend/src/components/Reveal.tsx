import { useEffect, useRef, useState } from "react";

/* Fades a block up into place the first time it scrolls into view.
 *
 * threshold 0 with a negative bottom margin, rather than a threshold like 0.15:
 * a fractional threshold is a share of the element's own height, so a block
 * taller than about six screens (the skills grid on a phone) could never reach
 * it and would stay invisible. Visibility is one-way -- once shown, the observer
 * lets go, so scrolling back up never hides anything again.
 *
 * Reduced motion is handled in CSS: the transition is removed and the block is
 * simply there. */
export default function Reveal({ children, className }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!("IntersectionObserver" in window)) {
      setShown(true);
      return;
    }

    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setShown(true);
          io.disconnect();
        }
      },
      { threshold: 0, rootMargin: "0px 0px -8% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={ref} className={`reveal${shown ? " is-shown" : ""}${className ? ` ${className}` : ""}`}>
      {children}
    </div>
  );
}
