import { getSupabaseAdmin } from "./supabase";
import { DEFAULT_WORKSPACE_ID, normalizeWorkspaceId } from "./workspace";
import { isWorkspaceSchemaError } from "./db-errors";

export async function ensureWorkspace(workspaceId = DEFAULT_WORKSPACE_ID) {
  const id = normalizeWorkspaceId(workspaceId);
  const { error } = await getSupabaseAdmin()
    .from("workspaces")
    .upsert(
      {
        id,
        name: id === DEFAULT_WORKSPACE_ID ? "DocFlow Shared Workspace" : "DocFlow Workspace",
      },
      { onConflict: "id" }
    );

  if (error) {
    if (isWorkspaceSchemaError(error)) {
      return id;
    }

    console.error("ensureWorkspace:", error);
  }

  return id;
}
