import { DeliveryHealth, DocMeta } from "../app/types";

export const PROGRESS_STATE_OPTIONS = ["대기", "진행중", "완료", "보류", "미정"] as const;
export const DELIVERY_HEALTH_OPTIONS = ["red", "yellow", "green", "gray"] as const;

export function resolveDeliveryHealth(meta: DocMeta): DeliveryHealth {
  if (meta.deliveryHealth) return meta.deliveryHealth;
  if (!meta.isDocument) return "gray";

  const completeness = meta.completeness;
  if (typeof completeness !== "number") return "gray";
  if (completeness >= 80) return "green";
  if (completeness >= 45) return "yellow";
  if (completeness > 0) return "red";
  return "gray";
}

export function resolveProgressState(meta: DocMeta): string {
  if (meta.progressState?.trim()) return meta.progressState;
  if (!meta.isDocument) return "참고자료";

  const completeness = meta.completeness;
  if (typeof completeness !== "number") return "미정";
  if (completeness >= 100) return "완료";
  if (completeness > 0) return "진행중";
  return "대기";
}

export function resolveScheduleSummary(meta: DocMeta): string {
  if (meta.dueDate) return formatDueDate(meta.dueDate);
  if (meta.scheduleSummary?.trim()) return meta.scheduleSummary;
  return meta.isDocument ? "일정 미기재" : "일정 없음";
}

export function formatDueDate(dueDate: string) {
  const date = new Date(`${dueDate}T00:00:00`);
  if (Number.isNaN(date.getTime())) return dueDate;
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(date);
}

export function getDueDateTimestamp(dueDate?: string) {
  if (!dueDate) return Number.POSITIVE_INFINITY;
  const date = new Date(`${dueDate}T00:00:00`);
  if (Number.isNaN(date.getTime())) return Number.POSITIVE_INFINITY;
  return date.getTime();
}

export function getDday(meta: DocMeta) {
  if (!meta.dueDate) return null;

  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const due = new Date(`${meta.dueDate}T00:00:00`);
  if (Number.isNaN(due.getTime())) return null;

  const diffDays = Math.round((due.getTime() - startOfToday.getTime()) / 86400000);
  if (diffDays === 0) return "D-Day";
  if (diffDays > 0) return `D-${diffDays}`;
  return `D+${Math.abs(diffDays)}`;
}

export function getHealthLabel(health: DeliveryHealth): string {
  switch (health) {
    case "green":
      return "정상";
    case "yellow":
      return "주의";
    case "red":
      return "지연";
    default:
      return "미정";
  }
}

export function getHealthStyles(health: DeliveryHealth) {
  switch (health) {
    case "green":
      return {
        badge: "border-emerald-200 bg-emerald-50 text-emerald-700",
        accent: "from-emerald-500 to-green-600",
        accentSoft: "bg-emerald-500/12",
        shadow: "shadow-[0_18px_40px_rgba(16,185,129,0.14)]",
      };
    case "yellow":
      return {
        badge: "border-amber-200 bg-amber-50 text-amber-700",
        accent: "from-amber-400 to-yellow-500",
        accentSoft: "bg-amber-500/12",
        shadow: "shadow-[0_18px_40px_rgba(245,158,11,0.14)]",
      };
    case "red":
      return {
        badge: "border-rose-200 bg-rose-50 text-rose-700",
        accent: "from-rose-500 to-red-600",
        accentSoft: "bg-rose-500/12",
        shadow: "shadow-[0_18px_40px_rgba(244,63,94,0.14)]",
      };
    default:
      return {
        badge: "border-slate-200 bg-slate-50 text-slate-600",
        accent: "from-slate-400 to-slate-500",
        accentSoft: "bg-slate-500/10",
        shadow: "shadow-[0_18px_40px_rgba(100,116,139,0.12)]",
      };
  }
}
