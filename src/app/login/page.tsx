import { LoginForm } from "@/components/login-form";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { PAGINA_INICIAL } from "@/lib/pagina-inicial";

export default async function LoginPage() {
  const session = await getServerSession(authOptions);
  if (session) {
    redirect(PAGINA_INICIAL);
  }

  return <LoginForm />;
}
