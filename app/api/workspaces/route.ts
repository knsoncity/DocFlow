import { NextRequest, NextResponse } from "next/server";
import { getAuthUserFromRequest } from "@/lib/auth";
import { isWorkspaceSchemaError } from "@/lib/db-errors";
import { getSupabaseAdmin } from "@/lib/supabase";
import { DEFAULT_WORKSPACE_ID } from "@/lib/workspace";
import { ensureWorkspace } from "@/lib/workspaces";

type WorkspaceRole = "owner" | "admin" | "member" | "viewer";

type DbWorkspace = {
  id: string;
  name: string;
  created_at: string;
};

type DbWorkspaceMember = {
  workspace_id: string;
  role: WorkspaceRole;
};

function isMembershipSchemaError(error: unknown) {
  if (isWorkspaceSchemaError(error)) return true;
  if (!error || typeof error !== "object") return false;
  const { code, message } = error as { code?: string; message?: string };
  return code === "42P01" || Boolean(message?.includes("workspace_members"));
}

function toWorkspaceSummary(workspace: DbWorkspace, role: WorkspaceRole = "member") {
  return {
    id: workspace.id,
    name: workspace.name,
    role,
    createdAt: workspace.created_at,
  };
}

async function ensureDefaultMembership(userId: string) {
  await ensureWorkspace(DEFAULT_WORKSPACE_ID);
  const { error } = await getSupabaseAdmin()
    .from("workspace_members")
    .upsert(
      {
        workspace_id: DEFAULT_WORKSPACE_ID,
        user_id: userId,
        role: "member",
      },
      { onConflict: "workspace_id,user_id" }
    );

  if (error && !isMembershipSchemaError(error)) throw error;
}

async function getDefaultWorkspaceFallback() {
  const { data } = await getSupabaseAdmin()
    .from("workspaces")
    .select("id, name, created_at")
    .eq("id", DEFAULT_WORKSPACE_ID)
    .maybeSingle();

  return [
    toWorkspaceSummary(
      (data as DbWorkspace | null) ?? {
        id: DEFAULT_WORKSPACE_ID,
        name: "DocFlow Shared Workspace",
        created_at: new Date().toISOString(),
      }
    ),
  ];
}

export async function GET(req: NextRequest) {
  const user = await getAuthUserFromRequest(req);
  if (!user) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  try {
    await ensureDefaultMembership(user.id);

    const admin = getSupabaseAdmin();
    const memberResult = await admin
      .from("workspace_members")
      .select("workspace_id, role")
      .eq("user_id", user.id);

    if (memberResult.error) {
      if (isMembershipSchemaError(memberResult.error)) {
        return NextResponse.json({ workspaces: await getDefaultWorkspaceFallback() });
      }
      throw memberResult.error;
    }

    const memberships = (memberResult.data ?? []) as DbWorkspaceMember[];
    const workspaceIds = memberships.map((membership) => membership.workspace_id);
    if (workspaceIds.length === 0) {
      return NextResponse.json({ workspaces: await getDefaultWorkspaceFallback() });
    }

    const workspaceResult = await admin
      .from("workspaces")
      .select("id, name, created_at")
      .in("id", workspaceIds)
      .order("created_at", { ascending: true });

    if (workspaceResult.error) {
      if (isWorkspaceSchemaError(workspaceResult.error)) {
        return NextResponse.json({ workspaces: await getDefaultWorkspaceFallback() });
      }
      throw workspaceResult.error;
    }

    const roleByWorkspace = new Map(
      memberships.map((membership) => [membership.workspace_id, membership.role])
    );
    const workspaces = ((workspaceResult.data ?? []) as DbWorkspace[]).map((workspace) =>
      toWorkspaceSummary(workspace, roleByWorkspace.get(workspace.id) ?? "member")
    );

    return NextResponse.json({ workspaces });
  } catch (error) {
    console.error("workspaces GET:", error);
    return NextResponse.json({ error: "워크스페이스 목록을 불러오지 못했습니다." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const user = await getAuthUserFromRequest(req);
  if (!user) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as { name?: string };
  const name = body.name?.trim();
  if (!name) {
    return NextResponse.json({ error: "워크스페이스 이름은 필수입니다." }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  const workspaceResult = await admin
    .from("workspaces")
    .insert({
      name,
      owner_user_id: user.id,
    })
    .select("id, name, created_at")
    .single();

  if (workspaceResult.error || !workspaceResult.data) {
    if (isWorkspaceSchemaError(workspaceResult.error)) {
      return NextResponse.json(
        { error: "워크스페이스 스키마가 아직 적용되지 않았습니다." },
        { status: 501 }
      );
    }
    console.error("workspaces POST workspace:", workspaceResult.error);
    return NextResponse.json({ error: "워크스페이스 생성에 실패했습니다." }, { status: 500 });
  }

  const workspace = workspaceResult.data as DbWorkspace;
  const memberResult = await admin.from("workspace_members").insert({
    workspace_id: workspace.id,
    user_id: user.id,
    role: "owner",
  });

  if (memberResult.error) {
    if (isMembershipSchemaError(memberResult.error)) {
      return NextResponse.json(
        { error: "워크스페이스 멤버십 스키마가 아직 적용되지 않았습니다." },
        { status: 501 }
      );
    }
    console.error("workspaces POST member:", memberResult.error);
    return NextResponse.json({ error: "워크스페이스 멤버 등록에 실패했습니다." }, { status: 500 });
  }

  return NextResponse.json({ workspace: toWorkspaceSummary(workspace, "owner") }, { status: 201 });
}
