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

export async function GET() {
  const { data, error } = await getSupabaseAdmin()
    .from("schedules")
    .select("*")
    .order("start_date", { ascending: true });

  if (error) {
    console.error("schedules GET:", error);
    return NextResponse.json({ schedules: [] });
  }

  return NextResponse.json({ schedules: (data ?? []).map(toSchedule) });
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as Partial<Schedule>;

  if (!body.title?.trim() || !body.startDate || !body.endDate) {
    return NextResponse.json({ error: "title, startDate, endDate는 필수입니다." }, { status: 400 });
  }

  const { data, error } = await getSupabaseAdmin()
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

  if (error || !data) {
    console.error("schedules POST:", error);
    return NextResponse.json({ error: "일정 저장 실패" }, { status: 500 });
  }

  return NextResponse.json({ schedule: toSchedule(data as DbSchedule) });
}
