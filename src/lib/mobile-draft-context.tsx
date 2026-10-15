"use client";
import { createContext, useContext, useEffect } from "react";

/** Signale au shell mobile une saisie active afin de protéger la navigation du bas. */
export const MobileDraftContext = createContext<(dirty: boolean, busy: boolean) => void>(() => {});

export function useMobileDraftProtection(dirty: boolean, busy: boolean) {
  const report = useContext(MobileDraftContext);
  useEffect(() => {
    report(dirty, busy);
    return () => report(false, false);
  }, [report, dirty, busy]);
  useEffect(() => {
    if (!dirty && !busy) return;
    const beforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [dirty, busy]);
}
