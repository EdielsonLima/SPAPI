import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { createArrivalConfirmation, getArrivalConfirmations } from "@/lib/db";
import path from "path";
import fs from "fs/promises";

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const orderId = Number(new URL(request.url).searchParams.get("orderId"));
  if (!orderId) return NextResponse.json({ error: "orderId required" }, { status: 400 });

  try {
    const confirmations = await getArrivalConfirmations(orderId);
    return NextResponse.json(confirmations);
  } catch (error) {
    console.error("Error fetching arrival confirmations:", error);
    return NextResponse.json({ error: "Failed to fetch confirmations" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const orderId    = Number(formData.get("orderId"));
  const itemNumber = Number(formData.get("itemNumber"));
  const confirmedBy = String(formData.get("confirmedBy") || "").trim();
  const quantityRaw = formData.get("quantity");
  const quantity   = quantityRaw !== null && quantityRaw !== "" ? Number(quantityRaw) : null;
  const notes      = String(formData.get("notes") || "").trim();
  const file       = formData.get("file") as File | null;

  if (!orderId || !itemNumber || !confirmedBy || !notes || !file) {
    return NextResponse.json({ error: "Campos obrigatórios faltando" }, { status: 400 });
  }
  if (file.size > 15 * 1024 * 1024) {
    return NextResponse.json({ error: "Arquivo maior que 15MB" }, { status: 400 });
  }

  const ext = (file.name.split(".").pop() || "bin").toLowerCase();
  const randomHex = Array.from(crypto.getRandomValues(new Uint8Array(4)))
    .map(b => b.toString(16).padStart(2, "0")).join("");
  const safeName = `${orderId}-${itemNumber}-${Date.now()}-${randomHex}.${ext}`;
  const uploadDir = path.join(process.cwd(), "uploads", "arrival-confirmations");

  try {
    await fs.mkdir(uploadDir, { recursive: true });
    const filePath = path.join(uploadDir, safeName);
    const buffer = Buffer.from(await file.arrayBuffer());
    await fs.writeFile(filePath, buffer);

    const id = await createArrivalConfirmation({
      purchaseOrderId: orderId,
      itemNumber,
      confirmedBy,
      quantity,
      notes,
      fileName: file.name,
      fileMimeType: file.type || "application/octet-stream",
      filePath: path.join("uploads", "arrival-confirmations", safeName),
    });

    return NextResponse.json({ id });
  } catch (error) {
    console.error("Error creating arrival confirmation:", error);
    return NextResponse.json({ error: "Erro ao salvar registro" }, { status: 500 });
  }
}
