import type { Metadata } from "next";
import { PortalSso } from "./portal-sso";

// O bilhete vem na URL: não deixa ele vazar no Referer de nada que a página carregue.
export const metadata: Metadata = { referrer: "no-referrer" };
export const dynamic = "force-dynamic";

export default function PortalSsoPage({ searchParams }: { searchParams: { t?: string } }) {
  return <PortalSso token={searchParams.t ?? ""} />;
}
