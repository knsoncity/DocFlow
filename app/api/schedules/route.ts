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

export async function GET(req: NextRequest) {
  try {
    const { workspaceId } = await requireWorkspaceAccess(req);
    const admin = getSupabaseAdmin();
    let result = await admin
      .from("schedules")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("start_date", { ascending: true });
    let data = result.data;
    let error = result.error;

    if (error && isWorkspaceSchemaError(error)) {
      result = await admin
        .from("schedules")
        .select("*")
        .order("start_date", { ascending: true });
      data = result.data;
      error = result.error;
    }

    if (error) {
      console.error("schedules GET:", error);
      return NextResponse.json({ schedules: [] });
    }

    return NextResponse.json({ schedules: (data ?? []).map(toSchedule) });
  } catch (error) {
    return workspaceAccessErrorResponse(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { workspaceId } = await requireWorkspaceAccess(req);
    const body = (await req.json()) as Partial<Schedule>;

    if (!body.title?.trim() || !body.startDate || !body.endDate) {
      return NextResponse.json({ error: "title, startDate, endDate는 필수입니다." }, { status: 400 });
    }

    const admin = getSupabaseAdmin();
    let result = await admin
      .from("schedules")
      .insert({
        workspace_id: workspaceId,
        title: body.title.trim(),
        start_date: body.startDate,
        end_date: body.endDate,
        category: body.category ?? "기타",
        color: body.color ?? null,
        note: body.note?.trim() ?? null,
      })
      .select("*")
      .single();
    let data = result.data;
    let error = result.error;

    if (error && isWorkspaceSchemaError(error)) {
      result = await admin
        .from("schedules")
        .insert({
          title: body.title.trim(),
          start_date: body.startDate,
          end_date: body.endDate,
          category: body.category ?? "기타",
          color: body.color ?? null,
          note: body.note?.trim() ?? null,
        })
        .select("*")
        .single();
      data = result.data;
      error = result.error;
    }

    if (error || !data) {
      console.error("schedules POST:", error);
      return NextResponse.json({ error: "일정 저장 실패" }, { status: 500 });
    }

    return NextResponse.json({ schedule: toSchedule(data as DbSchedule) });
  } catch (error) {
    return workspaceAccessErrorResponse(error);
  }
}
