import { useState, useEffect } from "react";

export type ViewportTier = "phone" | "tablet" | "desktop" | "wide";

export function getViewportTier(): ViewportTier {
  if (typeof window === "undefined") return "phone";
  const w = window.innerWidth;
  if (w >= 1600) return "wide";
  if (w >= 1024) return "desktop";
  if (w >= 640) return "tablet";
  return "phone";
}

export function useViewport(): ViewportTier {
  const [tier, setTier] = useState<ViewportTier>(getViewportTier);
  useEffect(() => {
    const onResize = () => setTier(getViewportTier());
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return tier;
}

export function useIsDesktop(breakpoint = 900): boolean {
  const [isDesktop, setIsDesktop] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia(`(min-width: ${breakpoint}px)`).matches : false
  );
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia(`(min-width: ${breakpoint}px)`);
    const onChange = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    if (mq.addEventListener) mq.addEventListener("change", onChange);
    else mq.addListener(onChange);
    setIsDesktop(mq.matches);
    return () => {
      if (mq.removeEventListener) mq.removeEventListener("change", onChange);
      else mq.removeListener(onChange);
    };
  }, [breakpoint]);
  return isDesktop;
}
