import { useEffect, useState } from "react";

/* Follows the visitor's "reduce motion" setting, including a change made while
   the page is open. The journey map and the card tunnel both need it, so it
   lives in one place. It reads the setting before the first render, so a visitor
   who asked for less motion never sees the animated version flash up first. */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false,
  );

  useEffect(() => {
    const mq = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!mq) return;
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return reduced;
}
