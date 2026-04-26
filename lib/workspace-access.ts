import type { User } from "@supabase/supabase-js";
import { getAuthUserFromRequest } from "./auth";
import { isWorkspaceSchemaError } from "./db-errors";
import { getSupabaseAdmin } from "./supabase";
import { DEFAULT_WORKSPACE_ID, getWorkspaceIdFromRequest } from "./workspace";
import { ensureWorkspace } from "./workspaces";

export class WorkspaceAccessError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export type WorkspaceAccess = {
  workspaceId: string;
  user: User;
};

function isWorkspaceMembershipSchemaError(error: unknown) {
  if (isWorkspaceSchemaError(error)) return true;
  if (!error || typeof error !== "object") return false;
  const { code, message } = error as { code?: string; message?: string };
  return (
    code === "42P01" ||
    code === "PGRST116" ||
    Boolean(message?.includes("workspace_members"))
  );
}

async function ensureDefaultWorkspaceMember(workspaceId: string, user: User) {
  if (workspaceId !== DEFAULT_WORKSPACE_ID) return false;

  const { error } = await getSupabaseAdmin()
    .from("workspace_members")
    .upsert(
      {
        workspace_id: workspaceId,
        user_id: user.id,
        role: "member",
      },
      { onConflict: "workspace_id,user_id" }
    );

  if (error) {
    if (isWorkspaceMembershipSchemaError(error)) return false;
    throw error;
  }

  return true;
}

async function isWorkspaceMember(workspaceId: string, user: User) {
  const { data, error } = await getSupabaseAdmin()
    .from("workspace_members")
    .select("workspace_id")
    .eq("workspace_id", workspaceId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    if (isWorkspaceMembershipSchemaError(error)) return true;
    throw error;
  }

  return Boolean(data);
}

export async function requireWorkspaceAccess(req: Request): Promise<WorkspaceAccess> {
  const user = await getAuthUserFromRequest(req);
  if (!user) {
    throw new WorkspaceAccessError(401, "로그인이 필요합니다.");
  }

  const workspaceId = await ensureWorkspace(getWorkspaceIdFromRequest(req));

  try {
    const joined = await ensureDefaultWorkspaceMember(workspaceId, user);
    if (!joined && !(await isWorkspaceMember(workspaceId, user))) {
      throw new WorkspaceAccessError(403, "이 워크스페이스에 접근할 권한이 없습니다.");
    }
  } catch (error) {
    if (error instanceof WorkspaceAccessError) throw error;
    if (!isWorkspaceMembershipSchemaError(error)) {
      console.error("requireWorkspaceAccess:", error);
      throw new WorkspaceAccessError(500, "워크스페이스 권한 확인에 실패했습니다.");
    }
  }

  return { workspaceId, user };
}

export function workspaceAccessErrorResponse(error: unknown) {
  if (error instanceof WorkspaceAccessError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  console.error("workspaceAccessErrorResponse:", error);
  return Response.json({ error: "워크스페이스 접근 권한을 확인하지 못했습니다." }, { status: 500 });
}
