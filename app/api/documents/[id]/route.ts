import { NextRequest, NextResponse } from "next/server";
import { deleteDocumentById, fetchDocumentById, updateDocumentMeta } from "@/lib/documents";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const doc = await fetchDocumentById(id);

  if (!doc) {
    return NextResponse.json({ error: "문서를 찾지 못했습니다." }, { status: 404 });
  }

  return NextResponse.json(doc, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = (await req.json()) as {
    progressState?: string;
    deliveryHealth?: "red" | "yellow" | "green" | "gray";
    dueDate?: string | null;
    author?: string | null;
    manualPolicy?: boolean;
  };

  const updated = await updateDocumentMeta(id, {
    progressState: body.progressState,
    deliveryHealth: body.deliveryHealth,
    dueDate: body.dueDate,
    author: body.author,
    manualPolicy: body.manualPolicy,
  });

  if (!updated) {
    return NextResponse.json({ error: "문서 메타데이터 수정에 실패했습니다." }, { status: 500 });
  }

  return NextResponse.json(updated);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const deleted = await deleteDocumentById(id);
  if (!deleted) {
    return NextResponse.json({ error: "문서 삭제에 실패했습니다." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
