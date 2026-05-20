"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { DocumentSummary } from "../types";

interface ConfluencePage {
  id: string;
  title: string;
  url: string;
  childCount: number;
}

interface Props {
  open: boolean;
  workspaceId: string;
  accessToken: string;
  onImported: (docs: DocumentSummary[]) => void;
  onClose: () => void;
}

const PAT_KEY = "docflow.confluencePat";
const BASE_URL_KEY = "docflow.confluenceBaseUrl";

function extractPageId(input: string): string | null {
  // https://wiki.daumkakao.com/pages/viewpage.action?pageId=12345
  const viewMatch = input.match(/[?&]pageId=(\d+)/);
  if (viewMatch) return viewMatch[1];

  // https://wiki.daumkakao.com/spaces/SPACE/pages/12345/title
  const pathMatch = input.match(/\/pages\/(\d+)/);
  if (pathMatch) return pathMatch[1];

  // pure numeric
  if (/^\d+$/.test(input.trim())) return input.trim();

  return null;
}

function extractBaseUrl(input: string): string | null {
  try {
    const u = new URL(input);
    return `${u.protocol}//${u.host}`;
  } catch {
    return null;
  }
}

export function ConfluenceImportModal({ open, workspaceId, accessToken, onImported, onClose }: Props) {
  const titleId = useId();

  const [pat, setPat] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [urlInput, setUrlInput] = useState("");
  const [pages, setPages] = useState<ConfluencePage[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [browseLoading, setBrowseLoading] = useState(false);
  const [importLoading, setImportLoading] = useState(false);
  const [browseError, setBrowseError] = useState("");
  const [importProgress, setImportProgress] = useState<{ done: number; total: number } | null>(null);
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setPat(localStorage.getItem(PAT_KEY) ?? "");
    setBaseUrl(localStorage.getItem(BASE_URL_KEY) ?? "https://wiki.daumkakao.com");
    setPages([]);
    setSelected(new Set());
    setBrowseError("");
    setImportProgress(null);
    setImportErrors([]);
    setTimeout(() => inputRef.current?.focus(), 50);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  const handleBrowse = useCallback(async () => {
    setBrowseError("");
    setPages([]);
    setSelected(new Set());

    const pageId = extractPageId(urlInput);
    if (!pageId) {
      setBrowseError("유효한 Confluence URL 또는 페이지 ID를 입력해주세요.");
      return;
    }
    if (!pat.trim()) {
      setBrowseError("PAT 토큰을 입력해주세요.");
      return;
    }

    const detectedBase = extractBaseUrl(urlInput) ?? baseUrl;
    localStorage.setItem(PAT_KEY, pat.trim());
    localStorage.setItem(BASE_URL_KEY, detectedBase);
    setBaseUrl(detectedBase);

    setBrowseLoading(true);
    try {
      const res = await fetch(
        `/api/confluence/pages?baseUrl=${encodeURIComponent(detectedBase)}&pageId=${pageId}`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "x-docflow-workspace-id": workspaceId,
            "x-confluence-token": pat.trim(),
          },
        }
      );
      const data = (await res.json()) as { pages?: ConfluencePage[]; error?: string };
      if (!res.ok || data.error) {
        setBrowseError(data.error ?? "페이지 목록을 가져오지 못했습니다.");
        return;
      }
      const list = data.pages ?? [];
      setPages(list);
      if (list.length === 0) setBrowseError("하위 페이지가 없습니다. 상위 페이지 URL을 확인해주세요.");
    } catch {
      setBrowseError("네트워크 오류가 발생했습니다.");
    } finally {
      setBrowseLoading(false);
    }
  }, [urlInput, pat, baseUrl, accessToken, workspaceId]);

  const togglePage = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    setSelected((prev) =>
      prev.size === pages.length ? new Set() : new Set(pages.map((p) => p.id))
    );
  };

  const handleImport = useCallback(async () => {
    if (selected.size === 0 || importLoading) return;
    setImportLoading(true);
    setImportErrors([]);
    setImportProgress({ done: 0, total: selected.size });

    try {
      const res = await fetch("/api/confluence/import", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
          "x-docflow-workspace-id": workspaceId,
          "x-confluence-token": pat.trim(),
        },
        body: JSON.stringify({
          baseUrl,
          pageIds: Array.from(selected),
        }),
      });

      const data = (await res.json()) as {
        results?: Array<{ pageId: string; status: "ok" | "error"; error?: string; docId?: string }>;
        succeeded?: number;
        error?: string;
      };

      if (!res.ok || data.error) {
        setImportErrors([data.error ?? "가져오기에 실패했습니다."]);
        return;
      }

      const errors = (data.results ?? [])
        .filter((r) => r.status === "error")
        .map((r) => {
          const page = pages.find((p) => p.id === r.pageId);
          return `"${page?.title ?? r.pageId}": ${r.error ?? "실패"}`;
        });

      setImportErrors(errors);
      setImportProgress({ done: data.succeeded ?? 0, total: selected.size });

      if ((data.succeeded ?? 0) > 0) {
        // Reload docs from server after import
        const docsRes = await fetch("/api/documents", {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "x-docflow-workspace-id": workspaceId,
          },
          cache: "no-store",
        });
        if (docsRes.ok) {
          const allDocs = (await docsRes.json()) as DocumentSummary[];
          const importedIds = new Set(
            (data.results ?? []).filter((r) => r.status === "ok" && r.docId).map((r) => r.docId!)
          );
          onImported(allDocs.filter((d) => importedIds.has(d.id)));
        }
      }
    } catch {
      setImportErrors(["네트워크 오류가 발생했습니다."]);
    } finally {
      setImportLoading(false);
    }
  }, [selected, importLoading, accessToken, workspaceId, pat, baseUrl, pages, onImported]);

  if (!open) return null;

  const allSelected = pages.length > 0 && selected.size === pages.length;
  const isDone = importProgress !== null && !importLoading;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onClick={onClose}
      aria-hidden="true"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
        className="flex w-full max-w-lg flex-col gap-0 overflow-hidden rounded-[4px] border border-[var(--border)] bg-[var(--bg)] shadow-[var(--shadow-float)]"
        style={{ maxHeight: "min(680px, 90dvh)" }}
      >
        {/* Header */}
        <div className="border-b border-[var(--border)] px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 id={titleId} className="text-[14px] font-semibold tracking-[-0.022em] text-[var(--text)]">
                Confluence 가져오기
              </h2>
              <p className="mt-0.5 text-[11px] leading-[1.6] text-[var(--text-subtle)]">
                위키 페이지를 DocFlow 문서로 가져옵니다. PAT 토큰은 이 기기에만 저장됩니다.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="shrink-0 rounded-full p-1.5 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-subtle)] hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--text)]"
              aria-label="닫기"
            >
              <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          <div className="space-y-3.5">
            {/* PAT token */}
            <label className="block">
              <span className="mb-1.5 block text-[9.5px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">
                PAT 토큰
              </span>
              <input
                type="password"
                value={pat}
                onChange={(e) => setPat(e.target.value)}
                placeholder="개인 액세스 토큰 (Personal Access Token)"
                className="w-full rounded-full border border-[var(--border-strong)] bg-[var(--bg-subtle)] px-4 py-2 text-[12px] text-[var(--text)] placeholder:text-[var(--text-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--text)]"
              />
              <span className="mt-1 block text-[10px] text-[var(--text-muted)]">
                Confluence → 프로필 → 설정 → 개인 액세스 토큰에서 발급
              </span>
            </label>

            {/* Page URL */}
            <label className="block">
              <span className="mb-1.5 block text-[9.5px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">
                상위 페이지 URL 또는 ID
              </span>
              <div className="flex gap-2">
                <input
                  ref={inputRef}
                  type="text"
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") void handleBrowse(); }}
                  placeholder="https://wiki.daumkakao.com/... 또는 페이지 ID"
                  className="min-w-0 flex-1 rounded-full border border-[var(--border-strong)] bg-[var(--bg-subtle)] px-4 py-2 text-[12px] text-[var(--text)] placeholder:text-[var(--text-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--text)]"
                />
                <button
                  type="button"
                  onClick={() => void handleBrowse()}
                  disabled={browseLoading || !urlInput.trim()}
                  className="shrink-0 rounded-full bg-[var(--text)] px-4 py-2 text-[11px] font-semibold text-[var(--bg)] transition-opacity hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--text)]"
                >
                  {browseLoading ? "조회 중…" : "조회"}
                </button>
              </div>
            </label>

            {browseError && (
              <p className="rounded-[4px] border border-red-200 bg-red-50 px-3 py-2 text-[11.5px] text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-400">
                {browseError}
              </p>
            )}

            {/* Page list */}
            {pages.length > 0 && (
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-[9.5px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">
                    하위 페이지 {pages.length}개
                  </span>
                  <button
                    type="button"
                    onClick={toggleAll}
                    className="text-[10.5px] font-medium text-[var(--text-subtle)] underline-offset-2 hover:text-[var(--text)] hover:underline focus-visible:outline-none"
                  >
                    {allSelected ? "전체 해제" : "전체 선택"}
                  </button>
                </div>
                <div className="space-y-0.5 overflow-hidden rounded-[4px] border border-[var(--border)]">
                  {pages.map((page) => {
                    const isSelected = selected.has(page.id);
                    return (
                      <label
                        key={page.id}
                        className={`flex cursor-pointer items-start gap-3 px-3.5 py-2.5 transition-colors hover:bg-[var(--bg-subtle)] ${
                          isSelected ? "bg-[var(--bg-subtle)]" : "bg-[var(--bg)]"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => togglePage(page.id)}
                          className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-[var(--text)]"
                        />
                        <div className="min-w-0">
                          <p className="truncate text-[12px] font-medium leading-[1.4] text-[var(--text)]">{page.title}</p>
                          {page.childCount > 0 && (
                            <p className="mt-0.5 text-[10px] text-[var(--text-muted)]">하위 {page.childCount}개</p>
                          )}
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Import result */}
            {isDone && (
              <div className={`rounded-[4px] border px-3 py-2.5 text-[11.5px] leading-[1.6] ${
                importErrors.length === 0
                  ? "border-green-200 bg-green-50 text-green-800 dark:border-green-900/40 dark:bg-green-900/20 dark:text-green-400"
                  : "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/40 dark:bg-amber-900/20 dark:text-amber-400"
              }`}>
                <p className="font-semibold">
                  {importProgress!.done}/{importProgress!.total}개 가져오기 완료
                </p>
                {importErrors.length > 0 && (
                  <ul className="mt-1 space-y-0.5 opacity-80">
                    {importErrors.map((e, i) => <li key={i}>• {e}</li>)}
                  </ul>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-[var(--border)] px-5 py-3.5">
          <div className="flex items-center justify-between gap-3">
            <span className="text-[10.5px] text-[var(--text-muted)]">
              {selected.size > 0 ? `${selected.size}개 선택됨` : "페이지를 선택하세요"}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-full border border-[var(--border-strong)] px-4 py-2 text-[11px] font-medium text-[var(--text-subtle)] transition-colors hover:bg-[var(--bg-subtle)] hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--text)]"
              >
                {isDone ? "닫기" : "취소"}
              </button>
              {!isDone && (
                <button
                  type="button"
                  onClick={() => void handleImport()}
                  disabled={selected.size === 0 || importLoading}
                  className="rounded-full bg-[var(--text)] px-4 py-2 text-[11px] font-semibold text-[var(--bg)] transition-opacity hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--text)]"
                >
                  {importLoading
                    ? `가져오는 중… (${selected.size}개)`
                    : `가져오기 (${selected.size}개)`}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
