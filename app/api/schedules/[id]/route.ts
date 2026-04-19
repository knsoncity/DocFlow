import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { Schedule, ScheduleCategory } from "@/app/types";

type DbSchedule = {
  id: string;
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
  const { id } = await params;
  const body = (await req.json()) as Partial<Schedule>;

  const updates: Record<string, unknown> = {};
  if (body.title !== undefined) updates.title = body.title.trim();
  if (body.startDate !== undefined) updates.start_date = body.startDate;
  if (body.endDate !== undefined) updates.end_date = body.endDate;
  if (body.category !== undefined) updates.category = body.category;
  if (body.color !== undefined) updates.color = body.color;
  if (body.note !== undefined) updates.note = body.note?.trim() || null;

  const { data, error } = await getSupabaseAdmin()
    .from("schedules")
    .update(updates)
    .eq("id", id)
    .select("*")
    .single();

  if (error || !data) {
    console.error("schedules PATCH:", error);
    return NextResponse.json({ error: "일정 수정 실패" }, { status: 500 });
  }

  return NextResponse.json({ schedule: toSchedule(data as DbSchedule) });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const { error } = await getSupabaseAdmin()
    .from("schedules")
    .delete()
    .eq("id", id);

  if (error) {
    console.error("schedules DELETE:", error);
    return NextResponse.json({ error: "일정 삭제 실패" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
