"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DocumentSummary, Schedule, ScheduleCategory } from "../types";
import { getDocumentTitle } from "../../lib/document-display";
import { CATEGORY_STYLES, getDocumentCategory } from "../../lib/document-taxonomy";

// ─── constants ───────────────────────────────────────────────────────────────

const DAY_PX = 36;
const SCHEDULE_ROW_H = 32;
const DOC_ROW_H = 28;
const DOC_ROW_GAP = 4;
const LEFT_LABEL_W = 172;
const TODAY = new Date();
TODAY.setHours(0, 0, 0, 0);

const CATEGORY_COLORS: Record<ScheduleCategory, { bg: string; border: string; text: string }> = {
  업무:  { bg: "rgba(59,130,246,0.15)",  border: "#3b82f6", text: "#2563eb" },
  회의:  { bg: "rgba(139,92,246,0.15)",  border: "#8b5cf6", text: "#7c3aed" },
  리뷰:  { bg: "rgba(16,185,129,0.15)",  border: "#10b981", text: "#059669" },
  출장:  { bg: "rgba(245,158,11,0.15)",  border: "#f59e0b", text: "#d97706" },
  휴가:  { bg: "rgba(239,68,68,0.12)",   border: "#ef4444", text: "#dc2626" },
  기타:  { bg: "rgba(107,114,128,0.13)", border: "#6b7280", text: "#4b5563" },
};

const SCHEDULE_CATEGORIES: ScheduleCategory[] = ["업무", "회의", "리뷰", "출장", "휴가", "기타"];

// ─── date helpers ─────────────────────────────────────────────────────────────

function parseDate(s: string): Date {
  const d = new Date(s);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function diffDays(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

function formatKo(d: Date, opts: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat("ko-KR", opts).format(d);
}

function isSameMonth(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

function buildDayRange(start: Date, totalDays: number): Date[] {
  return Array.from({ length: totalDays }, (_, i) => addDays(start, i));
}

function groupDocsByService(docs: DocumentSummary[]): { service: string; docs: DocumentSummary[] }[] {
  const map = new Map<string, DocumentSummary[]>();
  for (const doc of docs) {
    const key = doc.meta.serviceName?.trim() || "미분류";
    const bucket = map.get(key) ?? [];
    bucket.push(doc);
    map.set(key, bucket);
  }
  return Array.from(map.entries())
    .sort((a, b) => a[0].localeCompare(b[0], "ko"))
    .map(([service, docs]) => ({ service, docs }));
}

function mergeSchedules(baseSchedules: Schedule[], externalSchedules: Schedule[]) {
  const merged = new Map(baseSchedules.map((schedule) => [schedule.id, schedule]));
  externalSchedules.forEach((schedule) => {
    if (!merged.has(schedule.id)) {
      merged.set(schedule.id, schedule);
    }
  });
  return Array.from(merged.values()).sort((left, right) =>
    left.startDate.localeCompare(right.startDate)
  );
}

// ─── schedule form (add / edit) ───────────────────────────────────────────────

function ScheduleForm({
  initial,
  defaultDate,
  onSave,
  onCancel,
}: {
  initial?: Schedule;
  defaultDate: string;
  onSave: (s: Omit<Schedule, "id" | "createdAt">, id?: string) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [startDate, setStartDate] = useState(initial?.startDate ?? defaultDate);
  const [endDate, setEndDate] = useState(initial?.endDate ?? defaultDate);
  const [category, setCategory] = useState<ScheduleCategory>(initial?.category ?? "업무");
  const [note, setNote] = useState(initial?.note ?? "");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    onSave({ title: title.trim(), startDate, endDate, category, note: note.trim() || undefined }, initial?.id);
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 rounded-xl border border-[var(--border)] bg-[var(--bg)] p-4 shadow-lg">
      <p className="text-[11px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">
        {initial ? "일정 수정" : "일정 추가"}
      </p>
      <input
        autoFocus
        type="text"
        placeholder="일정 제목"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] px-3 py-2 text-[13px] text-[var(--text)] placeholder:text-[var(--text-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
      />
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="mb-1 block text-[10px] text-[var(--text-muted)]">시작일</label>
          <input type="date" value={startDate} onChange={(e) => { setStartDate(e.target.value); if (e.target.value > endDate) setEndDate(e.target.value); }}
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] px-2 py-1.5 text-[12px] text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500" />
        </div>
        <div>
          <label className="mb-1 block text-[10px] text-[var(--text-muted)]">종료일</label>
          <input type="date" value={endDate} min={startDate} onChange={(e) => setEndDate(e.target.value)}
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] px-2 py-1.5 text-[12px] text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500" />
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {SCHEDULE_CATEGORIES.map((cat) => (
          <button key={cat} type="button" onClick={() => setCategory(cat)}
            className="rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors"
            style={{
              borderColor: category === cat ? CATEGORY_COLORS[cat].border : "var(--border)",
              backgroundColor: category === cat ? CATEGORY_COLORS[cat].bg : "transparent",
              color: category === cat ? CATEGORY_COLORS[cat].text : "var(--text-muted)",
            }}
          >{cat}</button>
        ))}
      </div>
      <textarea placeholder="메모 (선택)" value={note} onChange={(e) => setNote(e.target.value)} rows={2}
        className="resize-none rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] px-3 py-2 text-[12px] text-[var(--text)] placeholder:text-[var(--text-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500" />
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel}
          className="rounded-lg px-3 py-1.5 text-[12px] text-[var(--text-muted)] hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
          취소
        </button>
        <button type="submit" disabled={!title.trim()}
          className="rounded-lg bg-blue-600 px-4 py-1.5 text-[12px] font-medium text-white hover:bg-blue-700 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
          {initial ? "저장" : "추가"}
        </button>
      </div>
    </form>
  );
}

// ─── bulk due-date panel ──────────────────────────────────────────────────────

function BulkDueDatePanel({
  docs,
  onUpdated,
}: {
  docs: DocumentSummary[];
  onUpdated: (id: string, dueDate: string) => void;
}) {
  const noDue = docs.filter((d) => !d.meta.dueDate && d.meta.isDocument);
  const [saving, setSaving] = useState<string | null>(null);

  if (noDue.length === 0) return null;

  const handleSet = async (id: string, dueDate: string) => {
    if (!dueDate) return;
    setSaving(id);
    try {
      await fetch(`/api/documents/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dueDate }),
      });
      onUpdated(id, dueDate);
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className="shrink-0 border-b border-[var(--border)] bg-[var(--bg-subtle)]">
      <details>
        <summary className="flex cursor-pointer items-center gap-2 px-4 py-2.5 text-[11px] font-medium text-[var(--text-subtle)] hover:text-[var(--text)]">
          <span className="rounded-full bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-amber-600">
            {noDue.length}
          </span>
          마감일 없는 문서 — 클릭해서 일괄 설정
          <svg className="ml-auto h-3 w-3 shrink-0" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" d="M4 6l4 4 4-4" />
          </svg>
        </summary>
        <div className="flex flex-col divide-y divide-[var(--border)] border-t border-[var(--border)]">
          {noDue.map((doc) => (
            <div key={doc.id} className="flex items-center gap-3 px-4 py-2">
              <p className="min-w-0 flex-1 truncate text-[12px] text-[var(--text)]" title={getDocumentTitle(doc)}>
                {getDocumentTitle(doc)}
              </p>
              <span className="shrink-0 text-[10px] text-[var(--text-muted)]">{doc.meta.serviceName ?? "미분류"}</span>
              <input
                type="date"
                disabled={saving === doc.id}
                onChange={(e) => { if (e.target.value) void handleSet(doc.id, e.target.value); }}
                className="shrink-0 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-2 py-1 text-[11px] text-[var(--text)] disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              />
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}

// ─── main component ───────────────────────────────────────────────────────────

export default function TimelineView({
  docs: initialDocs,
  onOpenDoc,
  externalSchedules,
}: {
  docs: DocumentSummary[];
  onOpenDoc: (doc: DocumentSummary) => void;
  externalSchedules?: Schedule[];
}) {
  const [storedSchedules, setStoredSchedules] = useState<Schedule[]>([]);
  const [docDueDateOverrides, setDocDueDateOverrides] = useState<Record<string, string>>({});
  // form state: null = closed, "new" = add, Schedule = edit
  const [formState, setFormState] = useState<null | "new" | Schedule>(null);
  const [formDate, setFormDate] = useState(() => TODAY.toISOString().slice(0, 10));
  const [hovered, setHovered] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const docs = useMemo(
    () =>
      initialDocs.map((doc) => {
        const overriddenDueDate = docDueDateOverrides[doc.id];
        return overriddenDueDate
          ? { ...doc, meta: { ...doc.meta, dueDate: overriddenDueDate } }
          : doc;
      }),
    [docDueDateOverrides, initialDocs]
  );
  const schedules = useMemo(
    () => mergeSchedules(storedSchedules, externalSchedules ?? []),
    [externalSchedules, storedSchedules]
  );

  // range: 30 days before → 90 days after
  const rangeStart = addDays(TODAY, -30);
  const totalDays = 121;
  const days = buildDayRange(rangeStart, totalDays);
  const canvasW = totalDays * DAY_PX;
  const todayOffset = diffDays(rangeStart, TODAY);

  const docGroups = groupDocsByService(docs);

  // fetch schedules on mount
  useEffect(() => {
    fetch("/api/schedules")
      .then((r) => r.json())
      .then((d: { schedules?: Schedule[] }) => setStoredSchedules(d.schedules ?? []))
      .catch(console.error);
  }, []);

  // scroll to today
  useEffect(() => {
    if (!scrollRef.current) return;
    const x = LEFT_LABEL_W + todayOffset * DAY_PX - scrollRef.current.clientWidth / 2 + DAY_PX / 2;
    scrollRef.current.scrollLeft = Math.max(0, x);
  }, [todayOffset]);

  // ── schedule CRUD ──────────────────────────────────────────────────────────

  const saveSchedule = useCallback(async (
    data: Omit<Schedule, "id" | "createdAt">,
    editId?: string
  ) => {
    if (editId) {
      const res = await fetch(`/api/schedules/${editId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const json = (await res.json()) as { schedule?: Schedule };
      if (json.schedule) {
        setStoredSchedules((prev) => prev.map((s) => s.id === editId ? json.schedule! : s));
      }
    } else {
      const res = await fetch("/api/schedules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const json = (await res.json()) as { schedule?: Schedule };
      if (json.schedule) {
        setStoredSchedules((prev) =>
          [...prev, json.schedule!].sort((a, b) => a.startDate.localeCompare(b.startDate))
        );
      }
    }
    setFormState(null);
  }, []);

  const deleteSchedule = useCallback(async (id: string) => {
    setDeletingId(id);
    await fetch(`/api/schedules/${id}`, { method: "DELETE" });
    setStoredSchedules((prev) => prev.filter((s) => s.id !== id));
    setDeletingId(null);
  }, []);

  const handleDayClick = (day: Date) => {
    setFormDate(day.toISOString().slice(0, 10));
    setFormState("new");
  };

  const handleDocDueUpdated = (id: string, dueDate: string) => {
    setDocDueDateOverrides((prev) => ({
      ...prev,
      [id]: dueDate,
    }));
  };

  // ── bar geometry ───────────────────────────────────────────────────────────

  function scheduleBar(s: Schedule) {
    const start = parseDate(s.startDate);
    const end = parseDate(s.endDate);
    const x = diffDays(rangeStart, start);
    const w = Math.max(1, diffDays(start, end) + 1);
    return { x: x * DAY_PX, w: w * DAY_PX - 3 };
  }

  function docBar(doc: DocumentSummary) {
    const created = parseDate(doc.createdAt);
    const due = doc.meta.dueDate ? parseDate(doc.meta.dueDate) : null;
    const startX = Math.max(0, diffDays(rangeStart, created));
    const endX = due
      ? Math.max(startX + 1, diffDays(rangeStart, due) + 1)
      : startX + 3;
    const w = Math.max(1, endX - startX);
    const outOfRange = startX >= totalDays || endX < 0;
    return { x: startX * DAY_PX, w: w * DAY_PX - 2, outOfRange };
  }

  // ── month header groups ────────────────────────────────────────────────────

  const monthGroups: { label: string; startIdx: number; count: number }[] = [];
  days.forEach((day, i) => {
    const last = monthGroups[monthGroups.length - 1];
    if (!last || !isSameMonth(day, days[last.startIdx])) {
      monthGroups.push({ label: formatKo(day, { year: "numeric", month: "long" }), startIdx: i, count: 1 });
    } else {
      last.count++;
    }
  });

  // ── render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg)]">

      {/* top bar */}
      <div className="flex shrink-0 items-center justify-between border-b border-[var(--border)] px-4 py-3">
        <div className="flex items-center gap-3">
          <p className="text-[13px] font-semibold text-[var(--text)]">타임라인</p>
          <span className="rounded-md border border-[var(--border)] bg-[var(--bg-subtle)] px-2 py-0.5 text-[10px] text-[var(--text-muted)]">
            내 일정 {schedules.length} · 문서 {docs.length}
          </span>
        </div>
        <button
          type="button"
          onClick={() => { setFormDate(TODAY.toISOString().slice(0, 10)); setFormState("new"); }}
          className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] px-3 py-1.5 text-[11px] font-medium text-[var(--text)] transition-colors hover:border-blue-500 hover:bg-blue-500/10 hover:text-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          <svg className="h-3 w-3" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2.2}>
            <path strokeLinecap="round" d="M8 3v10M3 8h10" />
          </svg>
          일정 추가
        </button>
      </div>

      {/* schedule form (add / edit) */}
      {formState !== null && (
        <div className="shrink-0 border-b border-[var(--border)] p-4">
          <ScheduleForm
            initial={typeof formState === "object" ? formState : undefined}
            defaultDate={formDate}
            onSave={saveSchedule}
            onCancel={() => setFormState(null)}
          />
        </div>
      )}

      {/* bulk due-date panel */}
      <BulkDueDatePanel docs={docs} onUpdated={handleDocDueUpdated} />

      {/* legend */}
      <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 border-b border-[var(--border)] px-4 py-1.5">
        {SCHEDULE_CATEGORIES.map((cat) => (
          <div key={cat} className="flex items-center gap-1.5">
            <span className="h-2 w-4 rounded-sm" style={{ backgroundColor: CATEGORY_COLORS[cat].bg, border: `1px solid ${CATEGORY_COLORS[cat].border}` }} />
            <span className="text-[10px] text-[var(--text-muted)]">{cat}</span>
          </div>
        ))}
        <span className="mx-1 text-[var(--border-strong)]">·</span>
        <div className="flex items-center gap-1.5">
          <span className="h-2 w-4 rounded-sm" style={{ background: "rgba(16,185,129,0.2)", border: "1px solid #10b981" }} />
          <span className="text-[10px] text-[var(--text-muted)]">문서 기간</span>
        </div>
        <span className="ml-auto text-[10px] text-[var(--text-muted)]">날짜 클릭 → 일정 추가 · 일정 클릭 → 수정</span>
      </div>

      {/* scrollable grid */}
      <div ref={scrollRef} className="flex-1 overflow-auto">
        <div style={{ width: LEFT_LABEL_W + canvasW, minHeight: "100%" }}>

          {/* sticky date header */}
          <div className="sticky top-0 z-20 flex" style={{ height: 56, backgroundColor: "var(--bg)" }}>
            <div className="shrink-0 border-b border-r border-[var(--border)]" style={{ width: LEFT_LABEL_W }} />
            <div className="relative border-b border-[var(--border)]" style={{ width: canvasW }}>
              {monthGroups.map((mg) => (
                <div key={mg.label} className="absolute top-0 flex items-center border-l border-[var(--border)] px-2" style={{ left: mg.startIdx * DAY_PX, width: mg.count * DAY_PX, height: 22 }}>
                  <span className="truncate text-[10px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">{mg.label}</span>
                </div>
              ))}
              <div className="absolute bottom-0 flex" style={{ height: 30 }}>
                {days.map((day, i) => {
                  const isToday = i === todayOffset;
                  const isWeekend = day.getDay() === 0 || day.getDay() === 6;
                  return (
                    <button key={i} type="button" onClick={() => handleDayClick(day)}
                      title={formatKo(day, { month: "long", day: "numeric", weekday: "short" })}
                      style={{ width: DAY_PX }}
                      className={`relative shrink-0 border-l border-t border-[var(--border)] text-center transition-colors hover:bg-blue-500/10 focus-visible:outline-none
                        ${isToday ? "bg-blue-500/10 font-bold text-blue-500" : isWeekend ? "text-[var(--text-muted)]" : "text-[var(--text-subtle)]"}
                        text-[9px]`}
                    >
                      <span className="absolute inset-0 flex items-center justify-center">{day.getDate()}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* ── 내 일정 레이어 ── */}
          <div className="flex border-b border-[var(--border)]" style={{ minHeight: Math.max(48, schedules.length * (SCHEDULE_ROW_H + 4) + 16) }}>
            <div className="sticky left-0 z-10 shrink-0 border-r border-[var(--border)] bg-[var(--bg-subtle)] px-3 py-3" style={{ width: LEFT_LABEL_W }}>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">내 일정</p>
              {schedules.length === 0 && <p className="mt-1 text-[10px] text-[var(--text-muted)]">날짜를 클릭해 추가</p>}
            </div>
            <div className="relative" style={{ width: canvasW }}>
              {/* today line */}
              <div className="pointer-events-none absolute bottom-0 top-0 w-px bg-blue-500 opacity-30" style={{ left: todayOffset * DAY_PX + DAY_PX / 2 }} />
              {/* weekend shading */}
              {days.map((day, i) => (day.getDay() === 0 || day.getDay() === 6) ? (
                <div key={i} className="pointer-events-none absolute bottom-0 top-0" style={{ left: i * DAY_PX, width: DAY_PX, backgroundColor: "color-mix(in srgb, var(--text) 3%, transparent)" }} />
              ) : null)}
              {/* bars */}
              {schedules.map((s, rowIdx) => {
                const { x, w } = scheduleBar(s);
                const colors = CATEGORY_COLORS[s.category] ?? CATEGORY_COLORS["기타"];
                const isHov = hovered === s.id;
                return (
                  <div key={s.id}
                    style={{ position: "absolute", left: x, top: 8 + rowIdx * (SCHEDULE_ROW_H + 4), width: w, height: SCHEDULE_ROW_H }}
                    className="group"
                    onMouseEnter={() => setHovered(s.id)}
                    onMouseLeave={() => setHovered(null)}
                  >
                    <button
                      type="button"
                      onClick={() => setFormState(s)}
                      title={`${s.title} — 클릭해서 수정`}
                      style={{ backgroundColor: colors.bg, border: `1px solid ${colors.border}`, color: colors.text, opacity: deletingId === s.id ? 0.4 : 1, boxShadow: isHov ? `0 0 0 2px ${colors.border}44` : undefined }}
                      className="flex h-full w-full items-center overflow-hidden rounded-md px-2 text-[11px] font-medium transition-shadow"
                    >
                      <span className="truncate">{s.title}</span>
                      {s.note && <span className="ml-1 shrink-0 text-[9px] opacity-60">📝</span>}
                    </button>
                    {isHov && (
                      <button type="button" onClick={(e) => { e.stopPropagation(); void deleteSchedule(s.id); }}
                        aria-label="일정 삭제"
                        className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--bg)] text-[9px] text-[var(--text-muted)] shadow hover:bg-red-500 hover:text-white focus-visible:outline-none">
                        ✕
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── 문서 레이어 ── */}
          {docGroups.map(({ service, docs: groupDocs }) => (
            <div key={service} className="flex border-b border-[var(--border)]" style={{ minHeight: groupDocs.length * (DOC_ROW_H + DOC_ROW_GAP) + 20 }}>
              <div className="sticky left-0 z-10 shrink-0 border-r border-[var(--border)] bg-[var(--bg-subtle)] px-3 py-3" style={{ width: LEFT_LABEL_W }}>
                <p className="truncate text-[10px] font-semibold uppercase tracking-widest text-[var(--text-muted)]" title={service}>{service}</p>
                <p className="mt-0.5 text-[10px] text-[var(--text-muted)]">{groupDocs.length}개 문서</p>
              </div>
              <div className="relative" style={{ width: canvasW, minHeight: groupDocs.length * (DOC_ROW_H + DOC_ROW_GAP) + 20 }}>
                <div className="pointer-events-none absolute bottom-0 top-0 w-px bg-blue-500 opacity-20" style={{ left: todayOffset * DAY_PX + DAY_PX / 2 }} />
                {days.map((day, i) => (day.getDay() === 0 || day.getDay() === 6) ? (
                  <div key={i} className="pointer-events-none absolute bottom-0 top-0" style={{ left: i * DAY_PX, width: DAY_PX, backgroundColor: "color-mix(in srgb, var(--text) 3%, transparent)" }} />
                ) : null)}
                {groupDocs.map((doc, rowIdx) => {
                  const { x, w, outOfRange } = docBar(doc);
                  if (outOfRange) return null;
                  const category = getDocumentCategory(doc);
                  const style = CATEGORY_STYLES[category];
                  const dueDate = doc.meta.dueDate ? parseDate(doc.meta.dueDate) : null;
                  const isOverdue = dueDate ? dueDate < TODAY : false;
                  return (
                    <button key={doc.id} type="button" onClick={() => onOpenDoc(doc)} title={getDocumentTitle(doc)}
                      style={{
                        position: "absolute", left: x,
                        top: 10 + rowIdx * (DOC_ROW_H + DOC_ROW_GAP),
                        width: w, height: DOC_ROW_H,
                        backgroundColor: style.soft,
                        border: `1px solid ${isOverdue ? "#ef4444" : style.stroke}`,
                        color: style.accent,
                      }}
                      className="flex items-center overflow-hidden rounded-md px-2 text-[10.5px] font-medium transition-all hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                    >
                      <span className="truncate">{getDocumentTitle(doc)}</span>
                      {!doc.meta.dueDate && <span className="ml-1 shrink-0 text-[9px] opacity-40">미정</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          {docs.length === 0 && (
            <div className="flex h-32 items-center justify-center">
              <p className="text-[12px] text-[var(--text-muted)]">등록된 문서가 없습니다</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
