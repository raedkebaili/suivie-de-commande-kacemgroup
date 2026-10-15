import type { ReactNode } from "react";
import ServiceWorkerRegister from "@/components/mobile/ServiceWorkerRegister";

/** Version mobile (PWA) : même API et mêmes règles que le bureau, interface dédiée. */
export default function MobileLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <ServiceWorkerRegister />
      {children}
    </>
  );
}
