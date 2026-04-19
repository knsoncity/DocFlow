"use client";

import Image from "next/image";
import {
  startTransition,
  type ReactNode,
  useDeferredValue,
  useEffect,
  useId,
  useState,
} from "react";
import {
  DeliveryHealth,
  Document,
  DocumentHistoryField,
  PolicyComparisonChange,
  PolicyReference,
  SpreadsheetSheet,
} from "../types";
import {
  DELIVERY_HEALTH_OPTIONS,
  formatDueDate,
  getDday,
  getHealthLabel,
  getHealthStyles,
  PROGRESS_STATE_OPTIONS,
  resolveDeliveryHealth,
  resolveProgressState,
  resolveScheduleSummary,
} from "../../lib/meta";
import {
  CATEGORY_STYLES,
  getDocumentCategory,
  getDocumentTypeLabel,
} from "../../lib/document-taxonomy";
import { getPolicyBadgeLabel } from "../../lib/policy-tracking";

const TYPE_COLORS: Record<string, string> = {
  PRD: "border-blue-500/30 bg-blue-500/10 text-blue-400",
  화면정의서: "border-violet-500/30 bg-violet-500/10 text-violet-400",
  플로우차트: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
  API명세: "border-orange-500/30 bg-orange-500/10 text-orange-400",
  회의록: "border-zinc-500/30 bg-zinc-500/10 text-zinc-400",
  기타: "border-zinc-500/30 bg-zinc-500/10 text-zinc-400",
};

const inputClass =
  "w-full rounded-[12px] border border-[var(--border)] bg-[var(--bg-subtle)] px-3 py-2.5 text-[12px] leading-[1.45] tracking-[-0.01em] text-[var(--text)] placeholder:text-[var(--text-muted)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500";

const POLICY_CHANGE_STYLES = {
  added: {
    badge: "border-emerald-500/20 bg-emerald-500/8 text-emerald-700 dark:text-emerald-300",
    label: "추가",
  },
  removed: {
    badge: "border-rose-500/20 bg-rose-500/8 text-rose-700 dark:text-rose-300",
    label: "삭제",
  },
  changed: {
    badge: "border-blue-500/20 bg-blue-500/8 text-blue-700 dark:text-blue-300",
    label: "수정",
  },
} as const;

export default function DocModal({
  doc,
  loading = false,
  deleting = false,
  updating = false,
  onDelete,
  onUpdate,
  onClose,
}: {
  doc: Document | null;
  loading?: boolean;
  deleting?: boolean;
  updating?: boolean;
  onDelete: (doc: Document) => void | Promise<void>;
  onUpdate: (
    docId: string,
    updates: {
      progressState?: string;
      deliveryHealth?: DeliveryHealth;
      dueDate?: string | null;
      author?: string | null;
      manualPolicy?: boolean;
    }
  ) => void | Promise<void>;
  onClose: () => void;
}) {
  const titleId = useId();
  const [draftProgressState, setDraftProgressState] = useState(
    doc ? resolveProgressState(doc.meta) : "미정"
  );
  const [draftDeliveryHealth, setDraftDeliveryHealth] = useState<DeliveryHealth>(
    doc ? resolveDeliveryHealth(doc.meta) : "gray"
  );
  const [draftDueDate, setDraftDueDate] = useState(doc?.meta.dueDate ?? "");
  const [draftAuthor, setDraftAuthor] = useState(doc?.meta.author ?? "");
  const [draftManualPolicy, setDraftManualPolicy] = useState(Boolean(doc?.meta.manualPolicy));
  const [activeSheetIndex, setActiveSheetIndex] = useState(0);
  const [showPolicyComparison, setShowPolicyComparison] = useState(true);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  if (!doc) {
    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-label="문서 상세 로딩 중"
          onClick={(e) => e.stopPropagation()}
          className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-[20px] border border-[var(--border)] bg-[var(--bg)] shadow-[var(--shadow-float)]"
        >
          <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4">
            <h2 className="text-[15px] font-semibold tracking-[-0.02em] text-[var(--text)]">문서 상세</h2>
            <button
              type="button"
              aria-label="닫기"
              onClick={onClose}
              className="rounded-[12px] px-3 py-1.5 text-[12px] text-[var(--text-subtle)] transition-colors hover:bg-[var(--bg-subtle)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              닫기
            </button>
          </div>
          <div role="status" aria-live="polite" className="flex h-64 items-center justify-center gap-3 text-[var(--text-muted)]">
            <div aria-hidden="true" className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--border-strong)] border-t-blue-500" />
            <span className="text-[12px] tracking-[0.01em]">{loading ? "불러오는 중…" : "문서를 불러올 수 없습니다."}</span>
          </div>
        </div>
      </div>
    );
  }

  const { meta } = doc;
  const category = getDocumentCategory(doc);
  const categoryStyle = CATEGORY_STYLES[category];
  const typeLabel = getDocumentTypeLabel(doc);
  const color = TYPE_COLORS[typeLabel] ?? TYPE_COLORS.기타;
  const pct = meta.completeness ?? 0;
  const health = resolveDeliveryHealth(meta);
  const healthLabel = getHealthLabel(health);
  const healthStyles = getHealthStyles(health);
  const progressState = resolveProgressState(meta);
  const scheduleSummary = resolveScheduleSummary(meta);
  const dday = getDday(meta);
  const changeHistory = doc.changeHistory ?? [];
  const spreadsheetSheets =
    doc.spreadsheetSheets?.length
      ? doc.spreadsheetSheets
      : parseSpreadsheetSheetsFromRawContent(doc.rawContent, doc.sourceLabel);
  const resolvedSheetIndex =
    spreadsheetSheets.length > 0
      ? Math.min(activeSheetIndex, spreadsheetSheets.length - 1)
      : 0;
  const title = meta.serviceName ?? doc.sourceLabel ?? "이름 없는 자료";
  const subtitle = meta.featureName ?? (!meta.isDocument ? "참고자료" : undefined);
  const sourceHref = getSourceHref(doc.sourceLabel);
  const policyTracking = doc.policyTracking;
  const policyBadge = getPolicyBadgeLabel(policyTracking);
  const impactCandidates = policyTracking?.impactCandidates ?? [];
  const affectedByPolicies = policyTracking?.affectedByPolicies ?? [];
  const hasPreviousPolicyVersion = Boolean(policyTracking?.isPolicy && policyTracking?.previousDocId);
  const showPolicyPanel = Boolean(
    policyTracking?.isPolicy ||
      impactCandidates.length ||
      affectedByPolicies.length ||
      hasPreviousPolicyVersion
  );
  const policyVersionLabel =
    policyTracking?.isPolicy && policyTracking.versionIndex
      ? `${policyTracking.versionIndex}/${policyTracking.versionCount ?? policyTracking.versionIndex}`
      : null;

  const metaRows = [
    { label: "작성일", value: formatDate(doc.createdAt) },
    { label: "작성자", value: meta.author },
    {
      label: "정책",
      value: meta.manualPolicy
        ? "수동 지정"
        : policyTracking?.isPolicy
          ? "자동 감지"
          : undefined,
    },
    { label: "버전", value: meta.version },
    { label: "카테고리", value: category },
    {
      label: "소스",
      value: sourceHref ? (
        <a href={sourceHref} target="_blank" rel="noreferrer"
          className="inline-flex items-center gap-1 text-blue-400 underline decoration-blue-400/40 underline-offset-4 hover:text-blue-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
        >
          <span className="min-w-0 break-all">{doc.sourceLabel}</span>
        </a>
      ) : doc.sourceLabel,
    },
    { label: "유형", value: typeLabel },
    { label: "이미지", value: doc.sourceType === "image" && doc.imageCount ? `${doc.imageCount}장` : undefined },
  ].filter((item) => item.value);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={onClose}
      aria-hidden="true"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[92vh] w-full max-w-7xl flex-col overflow-hidden rounded-[20px] border border-[var(--border)] bg-[var(--bg)] shadow-[var(--shadow-float)]"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-[var(--border)] px-5 py-4">
          <div className="min-w-0 flex-1">
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
                <span className={`rounded-[10px] border px-2 py-0.5 text-[10px] font-medium tracking-[0.01em] ${color}`}>
                  {typeLabel}
                </span>
              )}
              <span className={`rounded-[10px] border px-2 py-0.5 text-[10px] font-medium tracking-[0.01em] ${healthStyles.badge}`}>
                {healthLabel}
              </span>
              {policyBadge ? (
                <span className="rounded-[10px] border border-sky-200 bg-sky-50 px-2 py-0.5 text-[10px] font-medium tracking-[0.01em] text-sky-700">
                  {policyBadge}
                </span>
              ) : null}
              {meta.version && (
                <span className="rounded-[10px] border border-[var(--border)] bg-[var(--bg-subtle)] px-2 py-0.5 text-[10px] tracking-[0.01em] text-[var(--text-muted)]">
                  {meta.version}
                </span>
              )}
            </div>
            <h2 id={titleId} className="mt-2 text-[17px] font-semibold tracking-[-0.025em] text-[var(--text)]">{title}</h2>
            {subtitle && <p className="mt-0.5 text-[11px] tracking-[0.01em] text-[var(--text-muted)]">{subtitle}</p>}
            {meta.summary && <p className="mt-2 max-w-3xl text-[12.5px] leading-[1.72] tracking-[-0.01em] text-[var(--text-subtle)]">{meta.summary}</p>}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {hasPreviousPolicyVersion ? (
              <button
                type="button"
                onClick={() => setShowPolicyComparison((current) => !current)}
                className="rounded-[12px] border border-sky-500/25 bg-sky-500/8 px-3 py-1.5 text-[11px] font-medium tracking-[0.01em] text-sky-700 transition-colors hover:bg-sky-500/12 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 dark:text-sky-300"
              >
                {showPolicyComparison ? "비교 접기" : "이전 버전 비교"}
              </button>
            ) : null}
            {sourceHref && (
              <a href={sourceHref} target="_blank" rel="noreferrer"
                className="rounded-[12px] border border-blue-500/30 bg-blue-500/10 px-3 py-1.5 text-[11px] font-medium tracking-[0.01em] text-blue-400 transition-colors hover:bg-blue-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >원문 링크</a>
            )}
            <button
              type="button"
              aria-label="문서 삭제"
              onClick={() => void onDelete(doc)}
              disabled={deleting}
              className="rounded-[12px] border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-[11px] font-medium tracking-[0.01em] text-red-400 transition-colors hover:bg-red-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {deleting ? "삭제 중…" : "삭제"}
            </button>
            <button
              type="button"
              aria-label="모달 닫기"
              onClick={onClose}
              className="rounded-[12px] border border-[var(--border)] px-3 py-1.5 text-[11px] font-medium tracking-[0.01em] text-[var(--text-subtle)] transition-colors hover:bg-[var(--bg-subtle)] hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              닫기
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto overscroll-contain p-5">
          <div className="grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)]">
            {/* Sidebar */}
            <aside className="space-y-3 xl:sticky xl:top-0 xl:self-start">
              {/* Overview */}
              <Panel title="상태 요약" action={
                <span className="text-[11px] text-[var(--text-muted)]">
                  {meta.isDocument ? `완성도 ${pct}%` : "참고자료"}
                </span>
              }>
                <div className="grid grid-cols-3 gap-2 xl:grid-cols-1">
                  <MetricCard label="진행여부" value={progressState} />
                  <MetricCard label="일정" value={scheduleSummary} suffix={dday ?? undefined} />
                  <MetricCard label="상태" value={healthLabel} />
                </div>
                <div className="mt-3">
                  <div className="mb-1.5 flex items-center justify-between text-[11px] text-[var(--text-muted)]">
                    <span>{meta.isDocument ? "완성도" : "저장 상태"}</span>
                    <span>{meta.isDocument ? `${pct}%` : "기록됨"}</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-[var(--bg-surface)]">
                    <div
                      className={`h-full rounded-full bg-gradient-to-r ${meta.isDocument ? healthStyles.accent : "from-zinc-500 to-zinc-400"}`}
                      style={{ width: meta.isDocument ? `${pct}%` : "100%" }}
                    />
                  </div>
                </div>
              </Panel>

              {/* Control */}
              <Panel title="상태 관리">
                <div className="space-y-3">
                  <Field label="진행여부">
                    <select value={draftProgressState} onChange={(e) => setDraftProgressState(e.target.value)} className={inputClass}>
                      {PROGRESS_STATE_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </Field>
                  <Field label="색상 상태">
                    <select value={draftDeliveryHealth} onChange={(e) => setDraftDeliveryHealth(e.target.value as DeliveryHealth)} className={inputClass}>
                      {DELIVERY_HEALTH_OPTIONS.map((o) => <option key={o} value={o}>{getHealthLabel(o)}</option>)}
                    </select>
                  </Field>
                  <Field label="마감일">
                    <input type="date" value={draftDueDate} onChange={(e) => setDraftDueDate(e.target.value)} className={inputClass} />
                  </Field>
                  <Field label="작성자">
                    <input type="text" value={draftAuthor} onChange={(e) => setDraftAuthor(e.target.value)} placeholder="작성자 이름…" className={inputClass} />
                  </Field>
                  <label className="flex items-start gap-2 rounded-[12px] border border-[var(--border)] bg-[var(--bg)] px-3 py-2.5">
                    <input
                      type="checkbox"
                      checked={draftManualPolicy}
                      onChange={(event) => setDraftManualPolicy(event.target.checked)}
                      className="mt-0.5 h-4 w-4 rounded border-[var(--border-strong)] text-blue-600 focus:ring-blue-500"
                    />
                    <span className="min-w-0">
                      <span className="block text-[11px] font-medium tracking-[0.01em] text-[var(--text)]">
                        정책 문서로 지정
                      </span>
                      <span className="mt-0.5 block text-[10.5px] leading-[1.6] text-[var(--text-muted)]">
                        자동 감지와 별개로 이 문서를 정책 기준 문서로 직접 추적합니다.
                      </span>
                    </span>
                  </label>
                  <button
                    type="button"
                    disabled={updating}
                    onClick={() => void onUpdate(doc.id, {
                      progressState: draftProgressState,
                      deliveryHealth: draftDeliveryHealth,
                      dueDate: draftDueDate || null,
                      author: draftAuthor.trim() || null,
                      manualPolicy: draftManualPolicy,
                    })}
                    className="w-full rounded-[12px] bg-blue-600 py-2.5 text-[12px] font-semibold tracking-[0.01em] text-white transition-colors hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {updating ? "저장 중…" : "상태 저장"}
                  </button>
                </div>
              </Panel>

              {/* Metadata */}
              <Panel title="기본 정보">
                <dl className="space-y-2">
                  {metaRows.map((item) => (
                    <div key={item.label} className="flex gap-3 border-b border-[var(--border)] pb-2 last:border-none last:pb-0">
                      <dt className="w-12 shrink-0 text-[11px] font-medium text-[var(--text-muted)]">{item.label}</dt>
                      <dd className="min-w-0 text-[12px] text-[var(--text-subtle)] break-words">{item.value}</dd>
                    </div>
                  ))}
                </dl>
              </Panel>

              {showPolicyPanel ? (
                <Panel
                  title="정책 추적"
                  action={
                    policyVersionLabel ? (
                      <span className="text-[11px] text-[var(--text-muted)]">버전 {policyVersionLabel}</span>
                    ) : undefined
                  }
                >
                  <div className="space-y-2.5">
                    <div className="rounded-[12px] border border-[var(--border)] bg-[var(--bg)] px-3 py-2.5">
                      <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--text-muted)]">
                        {policyTracking?.isPolicy ? "정책 기준 문서" : "영향 연결 상태"}
                      </p>
                      <p className="mt-1 text-[12px] leading-[1.65] tracking-[-0.01em] text-[var(--text)]">
                        {policyTracking?.isPolicy
                          ? hasPreviousPolicyVersion
                            ? `이전 버전 ${policyTracking?.previousTitle ?? "문서"}와 비교할 수 있습니다.`
                            : "현재 서비스 정책 문서로 추적됩니다."
                          : (affectedByPolicies[0]?.title
                            ? `${affectedByPolicies[0].title} 변경의 영향 후보입니다.`
                            : "정책 영향 연결이 감지되지 않았습니다.")}
                      </p>
                    </div>
                    {policyTracking?.isPolicy ? (
                      <div className="grid grid-cols-2 gap-2">
                        <MetricCard label="영향 후보" value={`${impactCandidates.length}건`} />
                        <MetricCard
                          label="비교 대상"
                          value={hasPreviousPolicyVersion ? "있음" : "없음"}
                          suffix={policyTracking?.previousVersion ?? undefined}
                        />
                      </div>
                    ) : affectedByPolicies.length > 0 ? (
                      <div className="grid grid-cols-2 gap-2">
                        <MetricCard label="영향 정책" value={`${affectedByPolicies.length}건`} />
                        <MetricCard
                          label="최상위 후보"
                          value={affectedByPolicies[0]?.docType ?? "정책"}
                          suffix={affectedByPolicies[0]?.score ? `${affectedByPolicies[0].score}점` : undefined}
                        />
                      </div>
                    ) : null}
                  </div>
                </Panel>
              ) : null}

              {/* History */}
              <Panel title="변경 이력" action={
                <span className="text-[11px] text-[var(--text-muted)]">{changeHistory.length}건</span>
              }>
                {changeHistory.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-[var(--border-strong)] px-3 py-2.5 text-[12px] text-[var(--text-muted)]">
                    변경 이력이 없습니다.
                  </p>
                ) : (
                  <div className="max-h-[280px] space-y-2 overflow-y-auto">
                    {changeHistory.slice(0, 8).map((entry) => (
                      <div key={entry.id} className="rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] px-3 py-2.5">
                        <p className="text-[10px] text-[var(--text-muted)]">
                          {new Intl.DateTimeFormat("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(entry.changedAt))}
                        </p>
                        <div className="mt-1.5 space-y-1">
                          {entry.changes.map((change) => (
                            <p key={`${entry.id}-${change.field}`} className="text-[12px] text-[var(--text-subtle)]">
                              <span className="font-medium text-[var(--text)]">{change.label}</span>
                              <span className="mx-1.5 text-[var(--text-muted)]">·</span>
                              <span className="text-[var(--text-muted)]">{formatHistoryValue(change.field, change.from)}</span>
                              <span className="mx-1.5 text-[var(--text-muted)]">→</span>
                              <span className="font-medium text-[var(--text)]">{formatHistoryValue(change.field, change.to)}</span>
                            </p>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Panel>
            </aside>

            {/* Main content */}
            <div className="space-y-4">
              {showPolicyPanel ? (
                <PolicyTrackingPanel
                  tracking={policyTracking}
                  showComparison={showPolicyComparison}
                  onToggleComparison={() => setShowPolicyComparison((current) => !current)}
                />
              ) : null}
              {spreadsheetSheets.length > 0 ? (
                <SpreadsheetPanel
                  sheets={spreadsheetSheets}
                  activeSheetIndex={resolvedSheetIndex}
                  onSelectSheet={setActiveSheetIndex}
                />
              ) : null}
              {doc.rawContent?.trim() && (
                <TextPanel
                  eyebrow="원문"
                  title={
                    spreadsheetSheets.length > 0
                      ? "추출 텍스트"
                      : doc.sourceType === "image"
                        ? "분석 입력 내용"
                        : "원문 상세"
                  }
                  subtitle={getTextMeta(doc.rawContent)}
                  tall
                >
                  {doc.rawContent}
                </TextPanel>
              )}
              {(doc.userPrompt?.trim() || doc.ocrText?.trim()) && (
                <div className="grid gap-4 xl:grid-cols-2">
                  {doc.userPrompt?.trim() && (
                    <TextPanel eyebrow="Input" title="사용자 설명" subtitle={getTextMeta(doc.userPrompt ?? "")} compact>
                      {doc.userPrompt ?? ""}
                    </TextPanel>
                  )}
                  {doc.ocrText?.trim() && (
                    <TextPanel eyebrow="OCR" title="OCR 원문" subtitle={getTextMeta(doc.ocrText ?? "")} compact>
                      {doc.ocrText ?? ""}
                    </TextPanel>
                  )}
                </div>
              )}
              {doc.imagePreviews?.length ? (
                <Panel title="첨부 이미지" action={
                  <span className="text-[11px] text-[var(--text-muted)]">{doc.imagePreviews.length}개</span>
                }>
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {doc.imagePreviews.map((image) => (
                      <div key={`${image.name}-${image.previewUrl.slice(0, 32)}`}
                        className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)]">
                        <Image src={image.previewUrl} alt={image.name} width={640} height={480} unoptimized className="h-40 w-full object-cover" />
                        <div className="border-t border-[var(--border)] px-3 py-2 text-[12px] text-[var(--text-subtle)]">{image.name}</div>
                      </div>
                    ))}
                  </div>
                </Panel>
              ) : null}
              {/* Tags */}
              {[
                meta.keywords?.length ? { title: "키워드", items: meta.keywords.map((k) => `#${k}`), tone: "blue" as const } : null,
                meta.relatedDocTypes?.length ? { title: "연관 문서", items: meta.relatedDocTypes, tone: "violet" as const } : null,
                meta.missingParts?.length ? { title: "보완 필요", items: meta.missingParts, tone: "amber" as const } : null,
              ].filter(Boolean).length > 0 && (
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {meta.keywords?.length ? (
                    <TagCard title="키워드" tone="blue">
                      {meta.keywords.map((k) => <TagChip key={k} tone="blue">#{k}</TagChip>)}
                    </TagCard>
                  ) : null}
                  {meta.relatedDocTypes?.length ? (
                    <TagCard title="연관 문서" tone="violet">
                      {meta.relatedDocTypes.map((r) => <TagChip key={r} tone="violet">{r}</TagChip>)}
                    </TagCard>
                  ) : null}
                  {meta.missingParts?.length ? (
                    <TagCard title="보완 필요" tone="amber">
                      {meta.missingParts.map((p) => <TagChip key={p} tone="amber">{p}</TagChip>)}
                    </TagCard>
                  ) : null}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Panel({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <div className="rounded-[16px] border border-[var(--border)] bg-[var(--bg-subtle)] p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-[12px] font-semibold tracking-[-0.01em] text-[var(--text)]">{title}</h3>
        {action}
      </div>
      {children}
    </div>
  );
}

function MetricCard({ label, value, suffix }: { label: string; value: string; suffix?: string }) {
  return (
    <div className="rounded-[12px] border border-[var(--border)] bg-[var(--bg)] px-3 py-2.5">
      <p className="text-[9.5px] font-medium uppercase tracking-[0.12em] text-[var(--text-muted)]">{label}</p>
      <p className="mt-1 text-[12px] font-semibold tracking-[-0.015em] text-[var(--text)]">{value}</p>
      {suffix && <p className="mt-0.5 text-[10px] text-[var(--text-muted)]">{suffix}</p>}
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] font-medium uppercase tracking-[0.14em] text-[var(--text-muted)]">{label}</span>
      {children}
    </label>
  );
}

function TagCard({ title, tone, children }: { title: string; tone: "blue" | "violet" | "amber"; children: ReactNode }) {
  const styles = {
    blue: "border-blue-500/20 bg-blue-500/5",
    violet: "border-violet-500/20 bg-violet-500/5",
    amber: "border-amber-500/20 bg-amber-500/5",
  };
  return (
    <div className={`rounded-xl border p-3 ${styles[tone]}`}>
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">{title}</p>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

function TagChip({ tone, children }: { tone: "blue" | "violet" | "amber"; children: ReactNode }) {
  const styles = {
    blue: "border-blue-500/30 bg-blue-500/10 text-blue-400",
    violet: "border-violet-500/30 bg-violet-500/10 text-violet-400",
    amber: "border-amber-500/30 bg-amber-500/10 text-amber-400",
  };
  return (
    <span className={`rounded-md border px-2 py-0.5 text-[11px] font-medium ${styles[tone]}`}>{children}</span>
  );
}

function PolicyTrackingPanel({
  tracking,
  showComparison,
  onToggleComparison,
}: {
  tracking?: Document["policyTracking"];
  showComparison: boolean;
  onToggleComparison: () => void;
}) {
  if (!tracking) return null;

  const isPolicy = Boolean(tracking.isPolicy);
  const impactCandidates = tracking.impactCandidates ?? [];
  const affectedByPolicies = tracking.affectedByPolicies ?? [];
  const hasComparisonTarget = Boolean(tracking.previousDocId);
  const comparisonStats = tracking.comparisonStats;
  const comparisonChanges = tracking.comparisonChanges ?? [];

  return (
    <div className="rounded-[18px] border border-sky-200/70 bg-gradient-to-br from-sky-50/80 via-[var(--bg)] to-[var(--bg)] p-5 shadow-[var(--shadow-soft)]">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3 border-b border-[var(--border)] pb-4">
        <div>
          <p className="text-[9.5px] font-semibold tracking-[0.16em] text-[var(--text-muted)]">POLICY TRACE</p>
          <h3 className="mt-1 text-[15px] font-semibold leading-tight tracking-[-0.02em] text-[var(--text)]">
            {isPolicy ? "정책 변경 비교" : "정책 영향 매칭"}
          </h3>
          <p className="mt-1 max-w-2xl text-[11.5px] leading-[1.7] tracking-[-0.01em] text-[var(--text-subtle)]">
            {isPolicy
              ? hasComparisonTarget
                ? `${tracking.previousTitle ?? "이전 버전"}과 비교해 바뀐 항목과 영향 후보 문서를 함께 봅니다.`
                : "같은 정책 버전이 아직 없어 기준 문서로만 추적합니다."
              : "같은 서비스 안에서 정책 변경의 영향을 받을 가능성이 있는 문서로 연결합니다."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {tracking.versionIndex ? (
            <span className="rounded-[10px] border border-sky-200 bg-sky-50 px-2.5 py-1 text-[10px] font-medium tracking-[0.01em] text-sky-700">
              버전 {tracking.versionIndex}/{tracking.versionCount ?? tracking.versionIndex}
            </span>
          ) : null}
          {hasComparisonTarget ? (
            <button
              type="button"
              onClick={onToggleComparison}
              className="rounded-[12px] border border-sky-500/25 bg-sky-500/8 px-3 py-1.5 text-[11px] font-medium tracking-[0.01em] text-sky-700 transition-colors hover:bg-sky-500/12 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 dark:text-sky-300"
            >
              {showComparison ? "비교 숨기기" : "비교 보기"}
            </button>
          ) : null}
        </div>
      </div>

      {isPolicy ? (
        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <PolicyStat label="이전 버전" value={tracking.previousTitle ?? "없음"} />
            <PolicyStat label="영향 후보" value={`${impactCandidates.length}건`} />
            <PolicyStat label="변경 항목" value={`${comparisonStats?.total ?? 0}건`} />
            <PolicyStat
              label="비교 상태"
              value={hasComparisonTarget ? "연결됨" : "기준 대기"}
            />
          </div>

          {hasComparisonTarget ? (
            <div className="rounded-[16px] border border-[var(--border)] bg-[var(--bg)] p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-[11px] font-semibold tracking-[0.08em] text-[var(--text)]">이전 버전 비교</p>
                  <p className="mt-1 text-[11px] leading-[1.7] text-[var(--text-muted)]">
                    {tracking.previousTitle ?? "이전 문서"}와 현재 원문을 문단 단위로 비교합니다.
                  </p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <PolicyStatChip label="수정" value={comparisonStats?.changed ?? 0} tone="changed" />
                  <PolicyStatChip label="추가" value={comparisonStats?.added ?? 0} tone="added" />
                  <PolicyStatChip label="삭제" value={comparisonStats?.removed ?? 0} tone="removed" />
                </div>
              </div>
              {showComparison ? (
                comparisonChanges.length > 0 ? (
                  <div className="mt-4 space-y-3">
                    {comparisonChanges.map((change, index) => (
                      <PolicyChangeCard key={`${change.kind}-${index}`} change={change} />
                    ))}
                  </div>
                ) : (
                  <p className="mt-4 rounded-[12px] border border-dashed border-[var(--border-strong)] px-3 py-3 text-[12px] leading-[1.7] text-[var(--text-muted)]">
                    이전 버전과 비교했지만 눈에 띄는 본문 차이를 찾지 못했습니다.
                  </p>
                )
              ) : null}
            </div>
          ) : null}

          <PolicyReferencePanel
            title="영향 문서 후보"
            description="같은 서비스 안에서 정책 변경에 맞춰 다시 검토할 가능성이 높은 문서입니다."
            emptyLabel="영향 후보 문서가 아직 없습니다."
            items={impactCandidates}
          />
        </div>
      ) : (
        <PolicyReferencePanel
          title="연결된 정책 변경"
          description="같은 서비스의 정책 변경 문서와 키워드/유형이 겹쳐 영향 후보로 연결된 문서입니다."
          emptyLabel="연결된 정책 변경이 아직 없습니다."
          items={affectedByPolicies}
        />
      )}
    </div>
  );
}

function PolicyStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[12px] border border-[var(--border)] bg-[var(--bg)] px-3 py-3">
      <p className="text-[9.5px] font-medium uppercase tracking-[0.12em] text-[var(--text-muted)]">{label}</p>
      <p className="mt-1.5 text-[12px] leading-[1.55] tracking-[-0.01em] text-[var(--text)]">{value}</p>
    </div>
  );
}

function PolicyStatChip({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: keyof typeof POLICY_CHANGE_STYLES;
}) {
  const style = POLICY_CHANGE_STYLES[tone];
  return (
    <span className={`rounded-[10px] border px-2.5 py-1 text-[10px] font-medium tracking-[0.01em] ${style.badge}`}>
      {label} {value}
    </span>
  );
}

function PolicyChangeCard({
  change,
}: {
  change: PolicyComparisonChange;
}) {
  const style = POLICY_CHANGE_STYLES[change.kind];
  return (
    <div className="rounded-[14px] border border-[var(--border)] bg-[var(--bg-subtle)] p-4">
      <div className="mb-3 flex items-center gap-2">
        <span className={`rounded-[10px] border px-2.5 py-0.5 text-[10px] font-medium tracking-[0.01em] ${style.badge}`}>
          {style.label}
        </span>
      </div>
      <div className={`grid gap-3 ${change.kind === "changed" ? "xl:grid-cols-2" : ""}`}>
        {change.previous ? (
          <div className="rounded-[12px] border border-[var(--border)] bg-[var(--bg)] px-3 py-3">
            <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--text-muted)]">이전</p>
            <p className="mt-2 text-[12px] leading-[1.75] tracking-[-0.01em] text-[var(--text)] text-pretty">
              {change.previous}
            </p>
          </div>
        ) : null}
        {change.current ? (
          <div className="rounded-[12px] border border-[var(--border)] bg-[var(--bg)] px-3 py-3">
            <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--text-muted)]">현재</p>
            <p className="mt-2 text-[12px] leading-[1.75] tracking-[-0.01em] text-[var(--text)] text-pretty">
              {change.current}
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function PolicyReferencePanel({
  title,
  description,
  emptyLabel,
  items,
}: {
  title: string;
  description: string;
  emptyLabel: string;
  items: PolicyReference[];
}) {
  return (
    <div className="rounded-[16px] border border-[var(--border)] bg-[var(--bg)] p-4">
      <div className="mb-3">
        <p className="text-[11px] font-semibold tracking-[0.08em] text-[var(--text)]">{title}</p>
        <p className="mt-1 text-[11px] leading-[1.7] text-[var(--text-muted)]">{description}</p>
      </div>
      {items && items.length > 0 ? (
        <div className="space-y-2.5">
          {items.map((item) => (
            <div key={`${item.docId}-${item.title}`} className="rounded-[12px] border border-[var(--border)] bg-[var(--bg-subtle)] px-3 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <p className="min-w-0 flex-1 text-[12px] font-semibold leading-[1.45] tracking-[-0.01em] text-[var(--text)]">
                  {item.title}
                </p>
                {item.docType ? (
                  <span className="rounded-[10px] border border-[var(--border)] bg-[var(--bg)] px-2 py-0.5 text-[10px] tracking-[0.01em] text-[var(--text-muted)]">
                    {item.docType}
                  </span>
                ) : null}
                {item.score ? (
                  <span className="rounded-[10px] border border-sky-200 bg-sky-50 px-2 py-0.5 text-[10px] font-medium tracking-[0.01em] text-sky-700">
                    {item.score}점
                  </span>
                ) : null}
              </div>
              {item.reason ? (
                <p className="mt-1.5 text-[11px] leading-[1.7] tracking-[-0.01em] text-[var(--text-subtle)]">
                  {item.reason}
                </p>
              ) : null}
            </div>
          ))}
        </div>
      ) : (
        <p className="rounded-[12px] border border-dashed border-[var(--border-strong)] px-3 py-3 text-[12px] leading-[1.7] text-[var(--text-muted)]">
          {emptyLabel}
        </p>
      )}
    </div>
  );
}

function TextPanel({ eyebrow, title, subtitle, children, compact = false, tall = false }: {
  eyebrow: string; title: string; subtitle?: string; children: string; compact?: boolean; tall?: boolean;
}) {
  const blocks = buildReaderBlocks(children);

  return (
    <div className="rounded-[18px] border border-[var(--border)] bg-[var(--bg)] p-5 shadow-[var(--shadow-soft)]">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] pb-4">
        <div>
          <p className="text-[9.5px] font-semibold tracking-[0.16em] text-[var(--text-muted)]">{eyebrow}</p>
          <h3 className="mt-1 text-[15px] font-semibold leading-tight tracking-[-0.02em] text-[var(--text)]">{title}</h3>
        </div>
        {subtitle && <span className="text-[10.5px] tracking-[0.01em] text-[var(--text-muted)]">{subtitle}</span>}
      </div>
      <div className={`overflow-y-auto pr-1 ${compact ? "max-h-[320px]" : tall ? "max-h-[68vh]" : "max-h-[440px]"}`}>
        <div className="space-y-4">
          {blocks.length > 0 ? (
            blocks.map((block, index) => <ReaderBlockView key={`${block.type}-${index}`} block={block} />)
          ) : (
            <p className="text-[14px] leading-[1.9] text-[var(--text-subtle)]">내용이 없습니다.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function SpreadsheetPanel({
  sheets,
  activeSheetIndex,
  onSelectSheet,
}: {
  sheets: SpreadsheetSheet[];
  activeSheetIndex: number;
  onSelectSheet: (index: number) => void;
}) {
  const activeSheet = sheets[activeSheetIndex] ?? sheets[0];

  if (!activeSheet) return null;

  return (
    <div className="rounded-[18px] border border-[var(--border)] bg-[var(--bg)] p-5 shadow-[var(--shadow-soft)]">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] pb-4">
        <div>
          <p className="text-[10px] font-semibold tracking-[0.18em] text-[var(--text-muted)]">
            SPREADSHEET
          </p>
          <h3 className="mt-1 text-[15px] font-semibold leading-tight tracking-[-0.02em] text-[var(--text)]">
            시트 상세 보기
          </h3>
        </div>
        <span className="text-[10.5px] tracking-[0.01em] text-[var(--text-muted)]">
          {sheets.length}개 시트 · {activeSheet.rows.length.toLocaleString("ko-KR")}행
        </span>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {sheets.map((sheet, index) => (
          <button
            key={sheet.name}
            type="button"
            onClick={() => {
              startTransition(() => onSelectSheet(index));
            }}
            className={`rounded-[12px] border px-3 py-1.5 text-[11px] font-medium tracking-[0.01em] transition-colors ${
              index === activeSheetIndex
                ? "border-blue-500/30 bg-blue-500/10 text-blue-600"
                : "border-[var(--border)] bg-[var(--bg-subtle)] text-[var(--text-subtle)] hover:bg-[var(--bg-surface)]"
            }`}
          >
            {sheet.name}
          </button>
        ))}
      </div>

      <SpreadsheetSheetView
        key={`${activeSheet.name}-${activeSheet.rows.length}`}
        sheet={activeSheet}
      />
    </div>
  );
}

function SpreadsheetSheetView({ sheet }: { sheet: SpreadsheetSheet }) {
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query.trim().toLowerCase());
  const [headerEnabled, setHeaderEnabled] = useState(() =>
    detectHeaderRow(sheet.rows)
  );
  const [sortState, setSortState] = useState<{
    columnIndex: number | null;
    direction: "asc" | "desc";
  }>({
    columnIndex: null,
    direction: "asc",
  });
  const [scrollTop, setScrollTop] = useState(0);

  const totalColumnCount = Math.max(
    ...sheet.rows.map((row) => row.length),
    1
  );
  const rawHeader = headerEnabled ? sheet.rows[0] ?? [] : [];
  const dataRows = headerEnabled ? sheet.rows.slice(1) : sheet.rows;
  const normalizedHeader = headerEnabled
    ? normalizeSheetRow(rawHeader, totalColumnCount, "항목")
    : Array.from({ length: totalColumnCount }, (_, index) => `열 ${index + 1}`);

  const normalizedRows = dataRows.map((row) =>
    normalizeSheetRow(row, totalColumnCount, "")
  );
  const filteredRows = deferredQuery
    ? normalizedRows.filter((row) =>
        row.some((cell) => cell.toLowerCase().includes(deferredQuery))
      )
    : normalizedRows;
  const sortColumnIndex = sortState.columnIndex;
  const sortedRows =
    sortColumnIndex === null
      ? filteredRows
      : [...filteredRows].sort((left, right) =>
          compareSpreadsheetValues(
            left[sortColumnIndex] ?? "",
            right[sortColumnIndex] ?? "",
            sortState.direction
          )
        );

  const totalRows = sortedRows.length;
  const isVirtualized = totalRows > 80;
  const rowHeight = 30;
  const viewportHeight = 520;
  const overscan = 8;
  const startIndex = isVirtualized
    ? Math.max(0, Math.floor(scrollTop / rowHeight) - overscan)
    : 0;
  const endIndex = isVirtualized
    ? Math.min(
        totalRows,
        startIndex + Math.ceil(viewportHeight / rowHeight) + overscan * 2
      )
    : totalRows;
  const visibleRows = sortedRows.slice(startIndex, endIndex);
  const topSpacer = isVirtualized ? startIndex * rowHeight : 0;
  const bottomSpacer = isVirtualized ? (totalRows - endIndex) * rowHeight : 0;
  const gridTemplateColumns = `64px repeat(${totalColumnCount}, minmax(180px, 1fr))`;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2.5 rounded-[14px] border border-[var(--border)] bg-[var(--bg-subtle)] px-3.5 py-3.5">
        <div className="min-w-[220px] flex-1">
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="행 내용 검색…"
            className="w-full rounded-[12px] border border-[var(--border)] bg-[var(--bg)] px-3 py-2.5 text-[12px] tracking-[-0.01em] text-[var(--text)] placeholder:text-[var(--text-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          />
        </div>
        <button
          type="button"
          onClick={() => setHeaderEnabled((value) => !value)}
          className={`rounded-[12px] border px-3 py-2.5 text-[11px] font-medium tracking-[0.01em] transition-colors ${
            headerEnabled
              ? "border-blue-500/30 bg-blue-500/10 text-blue-600"
              : "border-[var(--border)] bg-[var(--bg)] text-[var(--text-subtle)] hover:bg-[var(--bg-surface)]"
          }`}
        >
          첫 행 헤더 {headerEnabled ? "사용" : "해제"}
        </button>
        {sortState.columnIndex !== null ? (
          <button
            type="button"
            onClick={() =>
              setSortState({
                columnIndex: null,
                direction: "asc",
              })
            }
            className="rounded-[12px] border border-[var(--border)] bg-[var(--bg)] px-3 py-2.5 text-[11px] font-medium tracking-[0.01em] text-[var(--text-subtle)] transition-colors hover:bg-[var(--bg-surface)]"
          >
            정렬 초기화
          </button>
        ) : null}
        <div className="ml-auto flex flex-wrap items-center gap-2 text-[10.5px] tracking-[0.01em] text-[var(--text-muted)]">
          <span>{sheet.rows.length.toLocaleString("ko-KR")}행 원본</span>
          <span>·</span>
          <span>{totalRows.toLocaleString("ko-KR")}행 표시</span>
          {isVirtualized ? (
            <>
              <span>·</span>
              <span>대용량 최적화</span>
            </>
          ) : null}
        </div>
      </div>

      <div className="overflow-hidden rounded-[16px] border border-[var(--border)] bg-[var(--bg-subtle)]">
        <div className="overflow-x-auto">
          <div
            className="min-w-max"
            style={{ minWidth: `${64 + totalColumnCount * 180}px` }}
          >
            <div
              className="sticky top-0 z-10 border-b border-[var(--border)] bg-[var(--bg)]"
              style={{
                display: "grid",
                gridTemplateColumns,
              }}
            >
              <div className="border-r border-[var(--border)] px-2.5 py-1.5 text-[10px] font-semibold tracking-[0.01em] text-[var(--text-muted)]">
                행
              </div>
              {normalizedHeader.map((cell, index) => {
                const isActive = sortState.columnIndex === index;
                return (
                  <button
                    key={`${sheet.name}-head-${index}`}
                    type="button"
                    onClick={() =>
                      setSortState((current) => ({
                        columnIndex: index,
                        direction:
                          current.columnIndex === index &&
                          current.direction === "asc"
                            ? "desc"
                            : "asc",
                      }))
                    }
                    className="flex items-center justify-between gap-2 border-l border-[var(--border)] px-2.5 py-1.5 text-left transition-colors hover:bg-[var(--bg-subtle)]"
                  >
                    <span className="truncate text-[11px] font-semibold leading-4 tracking-[-0.01em] text-[var(--text)]">
                      {cell || `열 ${index + 1}`}
                    </span>
                    <span
                      className={`shrink-0 text-[10px] ${
                        isActive
                          ? "text-blue-600"
                          : "text-[var(--text-muted)]"
                      }`}
                    >
                      {isActive
                        ? sortState.direction === "asc"
                          ? "▲"
                          : "▼"
                        : "↕"}
                    </span>
                  </button>
                );
              })}
            </div>

            {totalRows > 0 ? (
              <div
                className="overflow-y-auto"
                style={{ maxHeight: `${viewportHeight}px` }}
                onScroll={(event) =>
                  setScrollTop(event.currentTarget.scrollTop)
                }
              >
                {topSpacer > 0 ? <div style={{ height: topSpacer }} /> : null}

                {visibleRows.map((row, rowIndex) => {
                  const displayIndex = (isVirtualized ? startIndex : 0) + rowIndex;
                  return (
                    <div
                      key={`${sheet.name}-row-${displayIndex}`}
                      className="border-t border-[var(--border)]"
                      style={{
                        display: "grid",
                        gridTemplateColumns,
                        minHeight: `${rowHeight}px`,
                      }}
                    >
                      <div className="border-r border-[var(--border)] bg-[var(--bg)] px-2.5 py-1.5 text-[10px] font-medium tracking-[0.01em] text-[var(--text-muted)]">
                        {displayIndex + (headerEnabled ? 2 : 1)}
                      </div>
                      {row.map((cell, columnIndex) => (
                        <div
                          key={`${sheet.name}-cell-${displayIndex}-${columnIndex}`}
                          className="border-l border-[var(--border)] px-2.5 py-1.5 text-[11px] leading-4 tracking-[-0.01em] text-[var(--text)]"
                          title={cell || "빈 셀"}
                        >
                          <div
                            className="truncate whitespace-nowrap"
                          >
                            {cell || "—"}
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })}

                {bottomSpacer > 0 ? <div style={{ height: bottomSpacer }} /> : null}
              </div>
            ) : (
              <div className="px-4 py-8 text-center text-[12px] tracking-[0.01em] text-[var(--text-muted)]">
                검색 결과가 없습니다.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function getTextMeta(text: string) {
  const normalized = text.trim();
  if (!normalized) return "내용 없음";
  const paragraphCount = normalized.split(/\n{2,}/).filter((line) => line.trim()).length;
  const lineCount = normalized.split(/\r?\n/).length;
  return `${paragraphCount.toLocaleString("ko-KR")}단락 · ${lineCount.toLocaleString("ko-KR")}줄 · ${normalized.length.toLocaleString("ko-KR")}자`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "long", day: "numeric" }).format(new Date(value));
}

function formatHistoryValue(field: DocumentHistoryField, value?: string | null) {
  if (!value) return "없음";
  if (field === "deliveryHealth") return getHealthLabel(value as DeliveryHealth);
  if (field === "dueDate") return formatDueDate(value);
  return value;
}

function getSourceHref(sourceLabel?: string) {
  if (!sourceLabel?.trim()) return null;
  try {
    const url = new URL(sourceLabel);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

type ReaderBlock =
  | { type: "heading"; text: string }
  | { type: "paragraph"; text: string }
  | { type: "list"; ordered: boolean; items: string[] }
  | { type: "keyValue"; items: Array<{ label: string; value: string }> }
  | { type: "quote"; lines: string[] };

function ReaderBlockView({ block }: { block: ReaderBlock }) {
  if (block.type === "heading") {
    return (
      <div className="space-y-2 pt-1">
        <h4 className="text-[12px] font-semibold tracking-[0.12em] text-[var(--text)]">
          {block.text}
        </h4>
        <div className="h-px w-16 bg-[var(--border-strong)]" />
      </div>
    );
  }

  if (block.type === "paragraph") {
    return (
      <p className="text-[14px] leading-[1.95] text-[var(--text)] text-pretty">
        {block.text}
      </p>
    );
  }

  if (block.type === "list") {
    const ListTag = block.ordered ? "ol" : "ul";
    return (
      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)] px-4 py-3">
        <ListTag className="space-y-2 pl-5 text-[14px] leading-[1.85] text-[var(--text)] marker:text-[var(--text-muted)]">
          {block.items.map((item, index) => (
            <li key={`${index}-${item}`} className="text-pretty">
              {item}
            </li>
          ))}
        </ListTag>
      </div>
    );
  }

  if (block.type === "keyValue") {
    return (
      <dl className="grid gap-3 md:grid-cols-2">
        {block.items.map((item) => (
          <div
            key={`${item.label}-${item.value}`}
            className="rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)] px-4 py-3"
          >
            <dt className="text-[11px] font-medium tracking-[0.08em] text-[var(--text-muted)]">
              {item.label}
            </dt>
            <dd className="mt-1.5 text-[14px] leading-[1.8] text-[var(--text)] text-pretty">
              {item.value}
            </dd>
          </div>
        ))}
      </dl>
    );
  }

  return (
    <blockquote className="rounded-r-xl border-l-2 border-[var(--border-strong)] bg-[var(--bg-subtle)] px-4 py-3">
      <div className="space-y-2 text-[14px] leading-[1.9] text-[var(--text-subtle)]">
        {block.lines.map((line) => (
          <p key={line} className="text-pretty">
            {line}
          </p>
        ))}
      </div>
    </blockquote>
  );
}

function buildReaderBlocks(text: string) {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (!normalized) return [] as ReaderBlock[];

  const chunks = normalized
    .split(/\n{2,}/)
    .map((chunk) => chunk.trim())
    .filter(Boolean);

  const blocks: ReaderBlock[] = [];

  chunks.forEach((chunk, index) => {
    let lines = chunk
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    if (!lines.length) return;

    if (lines.length > 1 && isReaderHeading(lines[0], index === 0)) {
      blocks.push({ type: "heading", text: cleanReaderHeading(lines[0]) });
      lines = lines.slice(1);
      if (!lines.length) return;
    }

    if (lines.length === 1 && isReaderHeading(lines[0], index === 0)) {
      blocks.push({ type: "heading", text: cleanReaderHeading(lines[0]) });
      return;
    }

    const quoteBlock = parseQuoteBlock(lines);
    if (quoteBlock) {
      blocks.push(quoteBlock);
      return;
    }

    const listBlock = parseListBlock(lines);
    if (listBlock) {
      blocks.push(listBlock);
      return;
    }

    const keyValueBlock = parseKeyValueBlock(lines);
    if (keyValueBlock) {
      blocks.push(keyValueBlock);
      return;
    }

    blocks.push(...buildParagraphBlocks(lines));
  });

  return blocks;
}

function isReaderHeading(line: string, isFirstBlock: boolean) {
  const value = line.trim();
  if (!value || value.length > 40) return false;
  if (/[:：]$/.test(value)) return true;
  if (/^[#\[\(【].+[\]\)】]$/.test(value)) return true;
  return isFirstBlock && !/[.!?]$/.test(value);
}

function cleanReaderHeading(line: string) {
  return line.replace(/[:：]$/, "").trim();
}

function parseQuoteBlock(lines: string[]): ReaderBlock | null {
  if (!lines.every((line) => line.startsWith(">"))) return null;
  return {
    type: "quote",
    lines: lines.map((line) => line.replace(/^>\s?/, "").trim()).filter(Boolean),
  };
}

function parseListBlock(lines: string[]): ReaderBlock | null {
  const parsedItems = lines.map((line) => {
    const match = line.match(/^(?:[-*•·]|(?:\d+[.)]))\s+(.+)$/);
    const checkboxMatch = line.match(/^\[(?: |x|X)\]\s+(.+)$/);
    return match?.[1]?.trim() ?? checkboxMatch?.[1]?.trim() ?? null;
  });

  if (parsedItems.some((item) => !item)) return null;

  return {
    type: "list",
    ordered: lines.some((line) => /^\d+[.)]\s+/.test(line)),
    items: parsedItems.filter((item): item is string => Boolean(item)),
  };
}

function parseKeyValueBlock(lines: string[]): ReaderBlock | null {
  const items = lines.map((line) => {
    const match = line.match(/^([^:：]{1,18})[:：]\s+(.+)$/);
    return match
      ? { label: match[1].trim(), value: match[2].trim() }
      : null;
  });

  if (items.length < 2 || items.some((item) => !item)) return null;

  return {
    type: "keyValue",
    items: items.filter(
      (item): item is { label: string; value: string } => Boolean(item)
    ),
  };
}

function buildParagraphBlocks(lines: string[]) {
  if (lines.every((line) => line.length <= 92)) {
    return lines.map(
      (line) =>
        ({
          type: "paragraph",
          text: line,
        }) satisfies ReaderBlock
    );
  }

  const joined = lines.join(" ").replace(/\s+/g, " ").trim();
  if (!joined) return [] as ReaderBlock[];

  if (joined.length <= 240) {
    return [{ type: "paragraph", text: joined }] satisfies ReaderBlock[];
  }

  const sentences = splitReaderSentences(joined);
  if (sentences.length < 3) {
    return [{ type: "paragraph", text: joined }] satisfies ReaderBlock[];
  }

  const paragraphs: ReaderBlock[] = [];
  let current = "";

  sentences.forEach((sentence) => {
    if (current && current.length + sentence.length + 1 > 210) {
      paragraphs.push({ type: "paragraph", text: current });
      current = sentence;
      return;
    }

    current = current ? `${current} ${sentence}` : sentence;
  });

  if (current) {
    paragraphs.push({ type: "paragraph", text: current });
  }

  return paragraphs;
}

function splitReaderSentences(text: string) {
  return text
    .match(/[^.!?。]+[.!?。]?/g)
    ?.map((sentence) => sentence.trim())
    .filter(Boolean) ?? [text];
}

function normalizeSheetRow(row: string[], columnCount: number, fallbackPrefix: string) {
  return Array.from({ length: columnCount }, (_, index) => {
    const cell = row[index]?.trim();
    if (cell) return cell;
    return fallbackPrefix ? `${fallbackPrefix} ${index + 1}` : "";
  });
}

function detectHeaderRow(rows: string[][]) {
  const firstRow = rows[0]?.map((cell) => cell.trim()).filter(Boolean) ?? [];
  const secondRow = rows[1]?.map((cell) => cell.trim()).filter(Boolean) ?? [];

  if (firstRow.length < 2) return false;

  const uniqueRatio =
    new Set(firstRow.map((cell) => cell.toLowerCase())).size / firstRow.length;
  const labelLikeRatio =
    firstRow.filter(
      (cell) =>
        cell.length <= 24 &&
        !looksNumeric(cell) &&
        !looksDateLike(cell)
    ).length / firstRow.length;
  const secondRowNumericRatio =
    secondRow.length > 0
      ? secondRow.filter((cell) => looksNumeric(cell) || looksDateLike(cell)).length /
        secondRow.length
      : 0;

  return uniqueRatio >= 0.8 && (labelLikeRatio >= 0.6 || secondRowNumericRatio >= 0.35);
}

function compareSpreadsheetValues(
  left: string,
  right: string,
  direction: "asc" | "desc"
) {
  const leftValue = left.trim();
  const rightValue = right.trim();

  const leftNumber = parseNumberLike(leftValue);
  const rightNumber = parseNumberLike(rightValue);

  let result = 0;

  if (leftNumber !== null && rightNumber !== null) {
    result = leftNumber - rightNumber;
  } else {
    result = leftValue.localeCompare(rightValue, "ko", {
      numeric: true,
      sensitivity: "base",
    });
  }

  return direction === "asc" ? result : result * -1;
}

function looksNumeric(value: string) {
  return parseNumberLike(value) !== null;
}

function parseNumberLike(value: string) {
  const normalized = value.replace(/,/g, "").trim();
  if (!normalized) return null;
  if (!/^-?\d+(?:\.\d+)?$/.test(normalized)) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function looksDateLike(value: string) {
  return /^\d{4}[./-]\d{1,2}[./-]\d{1,2}$/.test(value.trim());
}

function parseSpreadsheetSheetsFromRawContent(
  rawContent?: string,
  sourceLabel?: string
) {
  const normalized = rawContent?.trim();
  if (!normalized) return [] as SpreadsheetSheet[];

  const looksLikeSpreadsheetSource = /\.(xlsx|xls|csv)$/i.test(sourceLabel ?? "");
  const hasMarkdownTable = /\|.+\|/.test(normalized) && /\|\s*---/.test(normalized);
  const hasDelimitedRows = hasDelimitedTableContent(normalized);

  if (!looksLikeSpreadsheetSource && !hasMarkdownTable && !hasDelimitedRows) {
    return [] as SpreadsheetSheet[];
  }

  const matches = Array.from(
    normalized.matchAll(
      /(?:^|\n)(?:#{2,3}\s*시트:\s*(.+?)\s*\n+)?((?:\|.*\|\n?)+)/g
    )
  );

  const sheets = matches
    .map((match, index) => {
      const rows = parseMarkdownTable(match[2]);
      if (rows.length === 0) return null;
      return {
        name: match[1]?.trim() || `시트 ${index + 1}`,
        rows,
      } satisfies SpreadsheetSheet;
    })
    .filter((sheet): sheet is SpreadsheetSheet => Boolean(sheet));

  if (sheets.length > 0) {
    return sheets;
  }

  const delimitedRows = parseDelimitedTable(normalized);
  if (delimitedRows.length > 0) {
    return [
      {
        name: "시트 1",
        rows: delimitedRows,
      },
    ] satisfies SpreadsheetSheet[];
  }

  const fallbackRows = parseMarkdownTable(normalized);
  if (fallbackRows.length === 0) {
    return [] as SpreadsheetSheet[];
  }

  return [
    {
      name: "시트 1",
      rows: fallbackRows,
    },
  ] satisfies SpreadsheetSheet[];
}

function parseMarkdownTable(markdown: string) {
  const lines = markdown
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("|") && line.endsWith("|"));

  if (lines.length < 2) {
    return [] as string[][];
  }

  const rows = lines
    .filter((line, index) => {
      if (index === 1 && /^\|\s*:?-{3,}/.test(line)) {
        return false;
      }
      return !/^\|\s*:?-{3,}(?:\s*\|\s*:?-{3,})+\s*\|?$/.test(line);
    })
    .map((line) =>
      line
        .slice(1, -1)
        .split("|")
        .map((cell) => cell.trim())
    )
    .filter((row) => row.some((cell) => cell.length > 0));

  return rows;
}

function hasDelimitedTableContent(text: string) {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 6);

  if (lines.length < 2) return false;

  return [",", "\t", ";"].some((delimiter) =>
    lines.filter((line) => splitDelimitedLine(line, delimiter).length >= 2).length >= 2
  );
}

function parseDelimitedTable(text: string) {
  const lines = text
    .split("\n")
    .map((line) => line.replace(/\r$/, ""))
    .filter((line) => line.trim().length > 0);

  if (lines.length < 2) {
    return [] as string[][];
  }

  const delimiter = detectDelimiter(lines);
  const rows = lines
    .map((line) => splitDelimitedLine(line, delimiter).map((cell) => cell.trim()))
    .filter((row) => row.some((cell) => cell.length > 0));

  if (rows.length < 2) {
    return [] as string[][];
  }

  return rows;
}

function detectDelimiter(lines: string[]) {
  const candidates = [",", "\t", ";"];
  let bestDelimiter = ",";
  let bestScore = -1;

  candidates.forEach((delimiter) => {
    const counts = lines
      .slice(0, 12)
      .map((line) => splitDelimitedLine(line, delimiter).length)
      .filter((count) => count > 1);

    if (counts.length < 2) return;

    const score = counts.reduce((sum, count) => sum + count, 0);
    if (score > bestScore) {
      bestScore = score;
      bestDelimiter = delimiter;
    }
  });

  return bestDelimiter;
}

function splitDelimitedLine(line: string, delimiter: string) {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === delimiter && !inQuotes) {
      cells.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  cells.push(current);
  return cells;
}
