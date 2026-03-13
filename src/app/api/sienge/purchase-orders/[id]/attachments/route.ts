import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { siengePostFormData } from "@/lib/sienge";

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const description = String(formData.get("description") || "").trim();
  const file = formData.get("file") as File | null;

  if (!description || !file) {
    return NextResponse.json({ error: "description e file são obrigatórios" }, { status: 400 });
  }

  // Sienge expects the field named "attachment"
  const siengeFd = new FormData();
  siengeFd.append("description", description.slice(0, 200));
  siengeFd.append("attachment", file, file.name.slice(0, 100));

  try {
    const result = await siengePostFormData(
      `/purchase-orders/${params.id}/attachments`,
      siengeFd
    );

    if (!result.ok) {
      console.error(`Sienge attachments error ${result.status}:`, result.body);
      return NextResponse.json(
        { error: `Sienge retornou ${result.status}`, detail: result.body },
        { status: result.status >= 400 && result.status < 600 ? result.status : 502 }
      );
    }

    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) {
    console.error("Error posting attachment to Sienge:", error);
    return NextResponse.json({ error: "Erro ao enviar para o Sienge" }, { status: 502 });
  }
}
