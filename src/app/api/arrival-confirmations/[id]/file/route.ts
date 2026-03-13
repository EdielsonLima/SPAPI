import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getArrivalConfirmationFilePath } from "@/lib/db";
import path from "path";
import fs from "fs/promises";

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) return new NextResponse("Unauthorized", { status: 401 });

  const record = await getArrivalConfirmationFilePath(Number(params.id));
  if (!record) return new NextResponse("Not found", { status: 404 });

  const absolutePath = path.join(process.cwd(), record.filePath);
  const fileBuffer = await fs.readFile(absolutePath).catch(() => null);
  if (!fileBuffer) return new NextResponse("File not found on disk", { status: 404 });

  return new NextResponse(fileBuffer, {
    headers: {
      "Content-Type": record.fileMimeType,
      "Content-Disposition": `inline; filename="${encodeURIComponent(record.fileName)}"`,
      "Cache-Control": "private, max-age=3600",
    },
  });
}
