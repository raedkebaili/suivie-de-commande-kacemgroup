import { notFound } from "next/navigation";
import DpmSiteMapping from "./site-mapping";
export const dynamic = "force-dynamic";
export default function Page() {
  if (process.env.DPM_CONFIGURATION_ENABLED !== "true") notFound();
  return <DpmSiteMapping />;
}
