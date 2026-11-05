import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { avisarPresencaPortal } from "@/lib/presenca-portal";

export const dynamic = "force-dynamic";

/** Aviso da tela aberta (`PresencaPortal`): repassa ao Portal o e-mail da sessão deste sistema. */
export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await avisarPresencaPortal(session.user.email);
  return new NextResponse(null, { status: 204 });
}
