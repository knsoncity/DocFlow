"use client";

import { Document, DocumentSummary } from "../types";
import {
  getDday,
  getHealthLabel,
  resolveDeliveryHealth,
  resolveProgressState,
  resolveScheduleSummary,
} from "../../lib/meta";
import {
  getDocumentSubtitle,
  getDocumentSummary,
  getDocumentTitle,
} from "../../lib/document-display";
import {
  CATEGORY_STYLES,
  getDocumentCategory,
  getDocumentTypeLabel,
} from "../../lib/document-taxonomy";
import { getPolicyBadgeLabel, getPolicyPanelSummary } from "../../lib/policy-tracking";

const TYPE_COLORS: Record<string, string> = {
  PRD: "border-blue-500/30 bg-blue-500/10 text-blue-400",
  화면정의서: "border-violet-500/30 bg-violet-500/10 text-violet-400",
  플로우차트: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
  API명세: "border-orange-500/30 bg-orange-500/10 text-orange-400",
  회의록: "border-zinc-500/30 bg-zinc-500/10 text-zinc-400",
  기타: "border-zinc-500/30 bg-zinc-500/10 text-zinc-400",
};

export default function DocCard({
  doc,
  onClick,
}: {
  doc: Document | DocumentSummary;
  onClick?: () => void;
}) {
  const { meta, createdAt } = doc;
  const category = getDocumentCategory(doc);
  const categoryStyle = CATEGORY_STYLES[category];
  const typeLabel = getDocumentTypeLabel(doc);
  const typeColor = TYPE_COLORS[typeLabel] ?? TYPE_COLORS["기타"];
  const title = getDocumentTitle(doc);
  const subtitle = getDocumentSubtitle(doc);
  const health = resolveDeliveryHealth(meta);
  const healthLabel = getHealthLabel(health);
  const progressState = resolveProgressState(meta);
  const scheduleSummary = resolveScheduleSummary(meta);
  const dday = getDday(meta);
  const displayedKeywords = meta.keywords?.slice(0, 2) ?? [];
  const keywordOverflow = Math.max((meta.keywords?.length ?? 0) - displayedKeywords.length, 0);
  const createdLabel = new Intl.DateTimeFormat("ko-KR", { month: "2-digit", day: "2-digit" }).format(new Date(createdAt));
  const summary = getDocumentSummary(doc);
  const policySummary = getPolicyPanelSummary(doc);
  const metaLine = [subtitle, meta.author?.trim() ? `작성자 ${meta.author.trim()}` : undefined]
    .filter(Boolean)
    .join(" · ");
  const policyBadge = getPolicyBadgeLabel(doc.policyTracking);

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${title} 문서 열기`}
      className="group relative grid h-full min-h-[304px] w-full grid-rows-[auto_auto_1fr_auto_auto] overflow-hidden rounded-[16px] border border-[var(--border)] bg-[var(--bg)] px-4 py-3.5 text-left transition-[border-color,box-shadow,transform] hover:border-[var(--border-strong)] hover:shadow-[var(--shadow-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
      style={{
        boxShadow: `inset 0 1px 0 ${categoryStyle.soft}`,
      }}
    >
      <div
        className="absolute inset-x-0 top-0 h-[2px]"
        style={{
          background: `linear-gradient(90deg, ${categoryStyle.accent} 0%, ${categoryStyle.stroke} 100%)`,
        }}
        aria-hidden="true"
      />

      <div className="flex items-start justify-between gap-2.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <span
            className="rounded-[10px] border px-2 py-0.5 text-[10px] font-medium tracking-[0.01em]"
            style={{
              borderColor: categoryStyle.stroke,
              backgroundColor: categoryStyle.soft,
              color: categoryStyle.accent,
            }}
          >
            {category}
          </span>
          {meta.isDocument && (
            <span className={`rounded-[10px] border px-2 py-0.5 text-[10px] font-medium tracking-[0.01em] ${typeColor}`}>
              {typeLabel}
            </span>
          )}
          <span className="rounded-[10px] border border-[var(--border)] bg-[var(--bg-subtle)] px-2 py-0.5 text-[10px] font-medium tracking-[0.01em] text-[var(--text-subtle)]">
            {healthLabel}
          </span>
          {policyBadge ? (
            <span className="rounded-[10px] border border-sky-200 bg-sky-50 px-2 py-0.5 text-[10px] font-medium tracking-[0.01em] text-sky-700">
              {policyBadge}
            </span>
          ) : null}
        </div>
        <span className="shrink-0 pt-0.5 text-[10px] tracking-[0.01em] text-[var(--text-muted)]">{createdLabel}</span>
      </div>

      <div className="mt-3 min-w-0">
        <h3
          className="line-clamp-2 text-[14px] font-semibold leading-[1.34] tracking-[-0.022em] text-[var(--text)]"
          title={title}
        >
          {title}
        </h3>
        {metaLine || policySummary ? (
          <p
            className="mt-1 truncate text-[10.5px] leading-4 tracking-[0.01em] text-[var(--text-muted)]"
            title={policySummary ?? metaLine}
          >
            {policySummary ?? metaLine}
          </p>
        ) : null}
      </div>

      <div className="mt-3 flex-1">
        <p
          className="line-clamp-4 text-[11.5px] leading-[1.72] tracking-[-0.01em] text-[var(--text-subtle)]"
          title={summary}
        >
          {summary}
        </p>
      </div>

      <div className="mt-3 rounded-[12px] border border-[var(--border)] bg-[var(--bg-subtle)] px-3 py-2.5">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10.5px] tracking-[0.01em]">
          <span className="font-medium text-[var(--text)]">{progressState}</span>
          <span className="text-[var(--text-subtle)]">{scheduleSummary}</span>
          <span className="text-[var(--text-muted)]">{dday ?? "D-day —"}</span>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between gap-3 border-t border-[var(--border)] pt-2.5">
        <div className="flex flex-wrap gap-1">
          {displayedKeywords.length > 0 ? (
            <>
              {displayedKeywords.map((kw) => (
                <span
                  key={kw}
                  className="max-w-[88px] truncate rounded-[10px] border border-[var(--border)] bg-[var(--bg-subtle)] px-2 py-0.5 text-[10px] tracking-[0.01em] text-[var(--text-muted)]"
                  title={kw}
                >
                  #{kw}
                </span>
              ))}
              {keywordOverflow > 0 && (
                <span className="rounded-[10px] border border-[var(--border)] bg-[var(--bg-subtle)] px-2 py-0.5 text-[10px] tracking-[0.01em] text-[var(--text-muted)]">
                  +{keywordOverflow}
                </span>
              )}
            </>
          ) : (
            <span className="text-[10.5px] tracking-[0.01em] text-[var(--text-muted)]">태그 없음</span>
          )}
        </div>
        <span className="shrink-0 text-[10px] tracking-[0.01em] text-[var(--text-muted)]">
          {meta.isDocument ? `완성도 ${meta.completeness ?? 0}%` : "참고자료"}
        </span>
      </div>
    </button>
  );
}
