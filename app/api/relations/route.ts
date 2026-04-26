import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { isWorkspaceSchemaError } from "@/lib/db-errors";
import { requireWorkspaceAccess, workspaceAccessErrorResponse } from "@/lib/workspace-access";

export async function GET(req: NextRequest) {
  try {
    const { workspaceId } = await requireWorkspaceAccess(req);
    const admin = getSupabaseAdmin();
    let result = await admin
      .from("doc_relations")
      .select("from_doc, to_doc, relation_type")
      .eq("workspace_id", workspaceId);
    let data = result.data;
    let error = result.error;

    if (error && isWorkspaceSchemaError(error)) {
      result = await admin
        .from("doc_relations")
        .select("from_doc, to_doc, relation_type");
      data = result.data;
      error = result.error;
    }

    if (error) {
      console.error("relations GET:", error);
      return NextResponse.json({ relations: [] });
    }

    return NextResponse.json({ relations: data ?? [] });
  } catch (error) {
    return workspaceAccessErrorResponse(error);
  }
}
