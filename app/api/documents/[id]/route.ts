import { NextRequest, NextResponse } from "next/server";
import { deleteDocumentById, fetchDocumentById, updateDocumentMeta } from "@/lib/documents";
import { requireWorkspaceAccess, workspaceAccessErrorResponse } from "@/lib/workspace-access";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { workspaceId } = await requireWorkspaceAccess(req);
    const doc = await fetchDocumentById(id, workspaceId);

    if (!doc) {
      return NextResponse.json({ error: "문서를 찾지 못했습니다." }, { status: 404 });
    }

    return NextResponse.json(doc, {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return workspaceAccessErrorResponse(error);
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { workspaceId } = await requireWorkspaceAccess(req);
    const body = (await req.json()) as {
      progressState?: string;
      deliveryHealth?: "red" | "yellow" | "green" | "gray";
      dueDate?: string | null;
      author?: string | null;
      manualPolicy?: boolean;
    };

    const updated = await updateDocumentMeta(
      id,
      {
        progressState: body.progressState,
        deliveryHealth: body.deliveryHealth,
        dueDate: body.dueDate,
        author: body.author,
        manualPolicy: body.manualPolicy,
      },
      workspaceId
    );

    if (!updated) {
      return NextResponse.json({ error: "문서 메타데이터 수정에 실패했습니다." }, { status: 500 });
    }

    return NextResponse.json(updated);
  } catch (error) {
    return workspaceAccessErrorResponse(error);
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { workspaceId } = await requireWorkspaceAccess(req);
    const deleted = await deleteDocumentById(id, workspaceId);
    if (!deleted) {
      return NextResponse.json({ error: "문서 삭제에 실패했습니다." }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return workspaceAccessErrorResponse(error);
  }
}
