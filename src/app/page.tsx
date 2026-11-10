import { redirect } from "next/navigation";
import { PAGINA_INICIAL } from "@/lib/pagina-inicial";

export default function Home() {
  redirect(PAGINA_INICIAL);
}
