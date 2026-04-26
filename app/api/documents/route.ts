import { NextRequest, NextResponse } from "next/server";
import { fetchDocuments } from "@/lib/documents";
import { requireWorkspaceAccess, workspaceAccessErrorResponse } from "@/lib/workspace-access";

export async function GET(req: NextRequest) {
  try {
    const { workspaceId } = await requireWorkspaceAccess(req);
    const docs = await fetchDocuments(workspaceId);
    return NextResponse.json(docs, {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return workspaceAccessErrorResponse(error);
  }
}
