import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { Schedule, ScheduleCategory } from "@/app/types";
import { isWorkspaceSchemaError } from "@/lib/db-errors";
import { requireWorkspaceAccess, workspaceAccessErrorResponse } from "@/lib/workspace-access";

type DbSchedule = {
  id: string;
  workspace_id?: string | null;
  title: string;
  start_date: string;
  end_date: string;
  category: string;
  color: string | null;
  note: string | null;
  created_at: string;
};

function toSchedule(row: DbSchedule): Schedule {
  return {
    id: row.id,
    workspaceId: row.workspace_id ?? undefined,
    title: row.title,
    startDate: row.start_date,
    endDate: row.end_date,
    category: row.category as ScheduleCategory,
    color: row.color ?? undefined,
    note: row.note ?? undefined,
    createdAt: row.created_at,
  };
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { workspaceId } = await requireWorkspaceAccess(req);
    const body = (await req.json()) as Partial<Schedule>;

    const updates: Record<string, unknown> = {};
    if (body.title !== undefined) updates.title = body.title.trim();
    if (body.startDate !== undefined) updates.start_date = body.startDate;
    if (body.endDate !== undefined) updates.end_date = body.endDate;
    if (body.category !== undefined) updates.category = body.category;
    if (body.color !== undefined) updates.color = body.color;
    if (body.note !== undefined) updates.note = body.note?.trim() || null;

    const admin = getSupabaseAdmin();
    let result = await admin
      .from("schedules")
      .update(updates)
      .eq("id", id)
      .eq("workspace_id", workspaceId)
      .select("*")
      .single();
    let data = result.data;
    let error = result.error;

    if (error && isWorkspaceSchemaError(error)) {
      result = await admin
        .from("schedules")
        .update(updates)
        .eq("id", id)
        .select("*")
        .single();
      data = result.data;
      error = result.error;
    }

    if (error || !data) {
      console.error("schedules PATCH:", error);
      return NextResponse.json({ error: "일정 수정 실패" }, { status: 500 });
    }

    return NextResponse.json({ schedule: toSchedule(data as DbSchedule) });
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

    let result = await getSupabaseAdmin()
      .from("schedules")
      .delete()
      .eq("id", id)
      .eq("workspace_id", workspaceId);
    let error = result.error;

    if (error && isWorkspaceSchemaError(error)) {
      result = await getSupabaseAdmin()
        .from("schedules")
        .delete()
        .eq("id", id);
      error = result.error;
    }

    if (error) {
      console.error("schedules DELETE:", error);
      return NextResponse.json({ error: "일정 삭제 실패" }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return workspaceAccessErrorResponse(error);
  }
}
