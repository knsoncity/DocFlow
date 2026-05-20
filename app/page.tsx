"use client";
import type { User } from "@supabase/supabase-js";
import type { FormEvent } from "react";
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import ChatWindow from "./components/ChatWindow";
import { ConfirmModal } from "./components/ConfirmModal";
import DocCard from "./components/DocCard";
import DocModal from "./components/DocModal";
import GraphView from "./components/GraphView";
import TimelineView from "./components/TimelineView";
import { ToastContainer, ToastItem, ToastType } from "./components/Toast";
import { WorkspaceMembersModal } from "./components/WorkspaceMembersModal";
import { ConfluenceImportModal } from "./components/ConfluenceImportModal";
import {
  DeliveryHealth,
  Document,
  DocumentCategory,
  DocumentSummary,
  Schedule,
  WorkspaceSummary,
} from "./types";
import {
  getDday,
  getDueDateTimestamp,
  getHealthLabel,
  getHealthStyles,
  resolveDeliveryHealth,
  resolveProgressState,
  resolveScheduleSummary,
} from "../lib/meta";
import {
  getDocumentSubtitle,
  getDocumentSummary,
  getDocumentTitle,
} from "../lib/document-display";
import {
  CATEGORY_ORDER,
  CATEGORY_STYLES,
  compareTypeLabels,
  getDocumentCategory,
  getDocumentTypeLabel,
} from "../lib/document-taxonomy";
import { getPolicyBadgeLabel, getPolicyPanelSummary } from "../lib/policy-tracking";
import { supabaseClient } from "../lib/supabase-client";

type Tab = "list" | "graph" | "timeline";
type SortMode = "latest" | "dueDate" | "dday";
type ViewMode = "card" | "compact";
type ThemePreference = "system" | "light" | "dark";
type MobileSurface = "chat" | "workspace";
type SavedViewPreset = {
  id: string;
  label: string;
  description: string;
  category: DocumentCategory | "all";
  detail: string;
  health: DeliveryHealth | "all";
  hideCompleted: boolean;
  hideReferences: boolean;
};

const AUTHOR_STORAGE_KEY = "docflow.authorName";
const AUTHOR_CHANGE_EVENT = "docflow-author-change";
const THEME_STORAGE_KEY = "docflow.themePreference";
const CHAT_PANE_WIDTH_STORAGE_KEY = "docflow.chatPaneWidth";
const WORKSPACE_STORAGE_KEY = "docflow.workspaceId";
const SERVICE_FALLBACK = "미분류";
const MIN_CHAT_PANE_WIDTH = 340;
const MAX_CHAT_PANE_WIDTH = 680;

const TYPE_COLORS: Record<string, string> = {
  PRD: "border-[#ffd0bf] bg-[#fff0e9] text-[#ff3e00]",
  화면정의서: "border-[#b9e4ff] bg-[#eef8ff] text-[#0090ff]",
  플로우차트: "border-[#aef0c6] bg-[#eafff2] text-[#00a83b]",
  API명세: "border-[#ffe29a] bg-[#fff8df] text-[#d48f00]",
  회의록: "border-[#ddd8d1] bg-[#f2f0ed] text-[#474645]",
  기타: "border-[#e8e4de] bg-[#f8f7f4] text-[#848281]",
  참고자료: "border-[#ddd8d1] bg-[#f2f0ed] text-[#474645]",
};

const SAVED_VIEW_PRESETS: SavedViewPreset[] = [
  {
    id: "all-desk",
    label: "전체 데스크",
    description: "전체 문서와 참고자료를 한 번에 봅니다.",
    category: "all",
    detail: "all",
    health: "all",
    hideCompleted: false,
    hideReferences: false,
  },
  {
    id: "planning-focus",
    label: "기획 집중",
    description: "PRD와 정책, 요구사항 검토에 집중합니다.",
    category: "기획",
    detail: "all",
    health: "all",
    hideCompleted: true,
    hideReferences: true,
  },
  {
    id: "design-review",
    label: "설계 리뷰",
    description: "화면정의와 플로우 설계 문서를 모아봅니다.",
    category: "설계",
    detail: "all",
    health: "all",
    hideCompleted: false,
    hideReferences: true,
  },
  {
    id: "api-work",
    label: "API 워크",
    description: "개발 카테고리 중 API 명세만 바로 좁혀봅니다.",
    category: "개발",
    detail: "API명세",
    health: "all",
    hideCompleted: false,
    hideReferences: true,
  },
  {
    id: "ops-followup",
    label: "운영 팔로업",
    description: "운영 문서 중 빨간 상태만 모아봅니다.",
    category: "운영",
    detail: "all",
    health: "red",
    hideCompleted: true,
    hideReferences: true,
  },
  {
    id: "reference-bank",
    label: "참고 큐",
    description: "기사, 리서치, 벤치마크 자료만 분리해서 봅니다.",
    category: "참고",
    detail: "all",
    health: "all",
    hideCompleted: false,
    hideReferences: false,
  },
];

function getStoredAuthorName() {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(AUTHOR_STORAGE_KEY)?.trim() ?? "";
}

function getStoredWorkspaceId() {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(WORKSPACE_STORAGE_KEY)?.trim() ?? "";
}

function getClientAuthDisplayName(user: User | null) {
  if (!user) return "";
  const metadata = user.user_metadata as {
    name?: string;
    full_name?: string;
    preferred_username?: string;
  };

  return (
    metadata.full_name?.trim() ||
    metadata.name?.trim() ||
    metadata.preferred_username?.trim() ||
    user.email?.trim() ||
    ""
  );
}

function AuthGate({
  email,
  notice,
  submitting,
  onEmailChange,
  onSubmit,
}: {
  email: string;
  notice: string;
  submitting: boolean;
  onEmailChange: (email: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-[var(--bg-subtle)] px-4 py-10 font-sans">
      <section className="w-full max-w-[400px] border border-[var(--border-strong)] bg-[var(--bg)] shadow-[var(--shadow-float)]">
        {/* Header bar */}
        <div className="border-b border-[var(--border)] px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center bg-[var(--text)] text-[12px] font-bold text-[var(--bg)]">
              D
            </div>
            <div>
              <h1 className="text-[15px] font-semibold tracking-[-0.022em] text-[var(--text)]">DocFlow</h1>
              <p className="text-[9.5px] font-medium uppercase tracking-[0.16em] text-[var(--text-muted)]">Private workspace</p>
            </div>
          </div>
          <p className="mt-4 text-[12.5px] leading-[1.65] text-[var(--text-subtle)]">
            이메일로 로그인 링크를 받아 작업 공간에 진입합니다.
          </p>
        </div>

        <form onSubmit={onSubmit} className="space-y-3.5 px-6 py-5">
          <label className="block">
            <span className="mb-1.5 block text-[9.5px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">이메일</span>
            <input
              type="email"
              required
              value={email}
              onChange={(event) => onEmailChange(event.target.value)}
              placeholder="name@company.com"
              className="w-full rounded-full border border-[var(--border-strong)] bg-[var(--bg-subtle)] px-4 py-2.5 text-[13px] text-[var(--text)] placeholder:text-[var(--text-muted)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--text)]"
            />
          </label>
          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-full bg-[var(--text)] px-4 py-2.5 text-[13px] font-semibold text-[var(--bg)] transition-opacity hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--text)] focus-visible:ring-offset-2"
          >
            {submitting ? "전송 중…" : "로그인 링크 받기"}
          </button>
          {notice && (
            <p className="border border-[var(--border)] bg-[var(--bg-subtle)] px-4 py-2.5 text-[11.5px] leading-[1.6] text-[var(--text-subtle)]">
              {notice}
            </p>
          )}
        </form>
      </section>
    </main>
  );
}

function getStoredThemePreference(): ThemePreference {
  if (typeof window === "undefined") return "system";
  const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
  return stored === "light" || stored === "dark" || stored === "system" ? stored : "system";
}

function subscribeToAuthorStore(callback: () => void) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("storage", callback);
  window.addEventListener(AUTHOR_CHANGE_EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(AUTHOR_CHANGE_EVENT, callback);
  };
}

function subscribeToMobileViewport(callback: () => void) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("resize", callback);
  return () => window.removeEventListener("resize", callback);
}

function getIsMobileViewport() {
  if (typeof window === "undefined") return false;
  return window.innerWidth < 1024;
}

function clampChatPaneWidth(width: number) {
  return Math.min(MAX_CHAT_PANE_WIDTH, Math.max(MIN_CHAT_PANE_WIDTH, width));
}

function getStoredChatPaneWidth() {
  if (typeof window === "undefined") return 440;
  const raw = Number(window.localStorage.getItem(CHAT_PANE_WIDTH_STORAGE_KEY));
  return Number.isFinite(raw) ? clampChatPaneWidth(raw) : 440;
}

function getServiceGroupName(doc: DocumentSummary) {
  return doc.meta.serviceName?.trim() || SERVICE_FALLBACK;
}

function summarizeDocument(doc: Document | DocumentSummary): DocumentSummary {
  return {
    id: doc.id,
    meta: doc.meta,
    createdAt: doc.createdAt,
    sourceType: doc.sourceType,
    sourceLabel: doc.sourceLabel,
    imageCount: doc.imageCount,
  };
}

function CompactDocRow({ doc, onClick }: { doc: DocumentSummary; onClick: () => void }) {
  const health = resolveDeliveryHealth(doc.meta);
  const healthStyles = getHealthStyles(health);
  const progressState = resolveProgressState(doc.meta);
  const scheduleSummary = resolveScheduleSummary(doc.meta);
  const dday = getDday(doc.meta);
  const category = getDocumentCategory(doc);
  const categoryStyle = CATEGORY_STYLES[category];
  const typeLabel = getDocumentTypeLabel(doc);
  const typeColor = TYPE_COLORS[typeLabel] ?? TYPE_COLORS["기타"];
  const title = getDocumentTitle(doc);
  const subtitle = getDocumentSubtitle(doc);
  const summary = getDocumentSummary(doc);
  const createdLabel = new Intl.DateTimeFormat("ko-KR", { month: "2-digit", day: "2-digit" }).format(new Date(doc.createdAt));
  const policyBadge = getPolicyBadgeLabel(doc.policyTracking);
  const policySummary = getPolicyPanelSummary(doc);

  return (
    <button
      type="button"
      onClick={onClick}
      className="grid w-full grid-cols-1 gap-3 px-4 py-3 text-left transition-colors hover:bg-[var(--bg-subtle)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 lg:grid-cols-[minmax(0,2.15fr)_minmax(0,2.35fr)_128px_148px_84px]"
      aria-label={`${title} 문서 열기`}
      style={{ borderLeft: `3px solid ${categoryStyle.accent}` }}
    >
      <div className="min-w-0">
        <div className="flex min-h-[22px] items-start justify-between gap-3">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
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
            {doc.meta.isDocument && (
              <span className={`rounded-[10px] border px-2 py-0.5 text-[10px] font-medium tracking-[0.01em] ${typeColor}`}>
                {typeLabel}
              </span>
            )}
            <span className={`rounded-[10px] border px-2 py-0.5 text-[10px] font-medium tracking-[0.01em] ${healthStyles.badge}`}>
              {getHealthLabel(health)}
            </span>
            {policyBadge ? (
              <span className="rounded-[10px] border border-sky-200 bg-sky-50 px-2 py-0.5 text-[10px] font-medium tracking-[0.01em] text-sky-700">
                {policyBadge}
              </span>
            ) : null}
          </div>
          <span className="shrink-0 pt-0.5 text-[10px] tracking-[0.01em] text-[var(--text-muted)]">{createdLabel}</span>
        </div>
        <p className="mt-2 truncate text-[13px] font-semibold leading-[1.35] tracking-[-0.02em] text-[var(--text)]">{title}</p>
        <p className="mt-0.5 truncate text-[10.5px] tracking-[0.01em] text-[var(--text-subtle)]">{subtitle}</p>
      </div>
      <div className="min-w-0 hidden lg:block">
        <p className="line-clamp-2 text-[11.5px] leading-[1.68] tracking-[-0.01em] text-[var(--text-subtle)]">{summary}</p>
        <p className="mt-1 text-[10.5px] tracking-[0.01em] text-[var(--text-muted)]">
          {policySummary ?? `작성자 ${doc.meta.author || "미정"}`}
        </p>
      </div>
      <div className="hidden lg:block">
        <p className="text-[11.5px] font-semibold tracking-[-0.01em] text-[var(--text)]">{progressState}</p>
        <p className="mt-0.5 text-[10px] tracking-[0.01em] text-[var(--text-muted)]">{getHealthLabel(health)}</p>
      </div>
      <div className="hidden lg:block">
        <p className="truncate text-[11.5px] font-semibold tracking-[-0.01em] text-[var(--text)]">{scheduleSummary}</p>
      </div>
      <div className="hidden lg:block">
        <p className="text-[11.5px] font-semibold tracking-[-0.01em] text-[var(--text)]">{dday ?? "—"}</p>
      </div>
    </button>
  );
}

export default function Home() {
  const [docs, setDocs] = useState<DocumentSummary[]>([]);
  const [tab, setTab] = useState<Tab>("list");
  const [loading, setLoading] = useState(true);
  const [selectedDoc, setSelectedDoc] = useState<Document | null>(null);
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [selectedDocLoading, setSelectedDocLoading] = useState(false);
  const [deletingDocId, setDeletingDocId] = useState<string | null>(null);
  const [updatingDocId, setUpdatingDocId] = useState<string | null>(null);
  const [healthFilter, setHealthFilter] = useState<DeliveryHealth | "all">("all");
  const [categoryFilter, setCategoryFilter] = useState<DocumentCategory | "all">("all");
  const [detailFilter, setDetailFilter] = useState<string>("all");
  const [sortMode, setSortMode] = useState<SortMode>("latest");
  const [viewMode, setViewMode] = useState<ViewMode>("card");
  const [hideCompleted, setHideCompleted] = useState(false);
  const [hideReferences, setHideReferences] = useState(false);
  const [showMineOnly, setShowMineOnly] = useState(false);
  const [collapsedServices, setCollapsedServices] = useState<Record<string, boolean>>({});
  const [searchQuery, setSearchQuery] = useState("");
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [authorDraft, setAuthorDraft] = useState("");
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [authAccessToken, setAuthAccessToken] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authEmail, setAuthEmail] = useState("");
  const [authNotice, setAuthNotice] = useState("");
  const [authSubmitting, setAuthSubmitting] = useState(false);
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([]);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState(getStoredWorkspaceId);
  const [workspaceDraft, setWorkspaceDraft] = useState("");
  const [workspaceCreating, setWorkspaceCreating] = useState(false);
  const [membersModalOpen, setMembersModalOpen] = useState(false);
  const [confluenceImportOpen, setConfluenceImportOpen] = useState(false);
  const [themePreference, setThemePreference] = useState<ThemePreference>(getStoredThemePreference);
  const [themeDraft, setThemeDraft] = useState<ThemePreference>(getStoredThemePreference);
  const [chatPaneWidth, setChatPaneWidth] = useState(440);
  const [mobileSurface, setMobileSurface] = useState<MobileSurface>("chat");
  const [isResizingChatPane, setIsResizingChatPane] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<{ doc: Document } | null>(null);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [newSchedules, setNewSchedules] = useState<Schedule[]>([]);
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const authorName = useSyncExternalStore(subscribeToAuthorStore, getStoredAuthorName, () => "");
  const isMobileViewport = useSyncExternalStore(subscribeToMobileViewport, getIsMobileViewport, () => false);
  const settingsTitleId = useId();
  const chatResizeRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const authDisplayName = getClientAuthDisplayName(authUser);
  const effectiveAuthorName = authDisplayName || authorName;

  const showToast = useCallback((type: ToastType, message: string) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((prev) => [...prev, { id, type, message }]);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const buildAuthHeaders = useCallback(
    (headers: Record<string, string> = {}) =>
      ({
        ...headers,
        ...(authAccessToken ? { Authorization: `Bearer ${authAccessToken}` } : {}),
        ...(selectedWorkspaceId ? { "x-docflow-workspace-id": selectedWorkspaceId } : {}),
      }),
    [authAccessToken, selectedWorkspaceId]
  );

  useEffect(() => {
    let active = true;

    supabaseClient.auth
      .getSession()
      .then(({ data }) => {
        if (!active) return;
        setAuthUser(data.session?.user ?? null);
        setAuthAccessToken(data.session?.access_token ?? null);
      })
      .catch((error) => {
        console.error(error);
        if (active) setAuthNotice("로그인 상태를 확인하지 못했습니다. 다시 시도해주세요.");
      })
      .finally(() => {
        if (active) setAuthLoading(false);
      });

    const { data } = supabaseClient.auth.onAuthStateChange((_event, session) => {
      setAuthUser(session?.user ?? null);
      setAuthAccessToken(session?.access_token ?? null);
      setAuthLoading(false);
    });

    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!authUser || !authAccessToken) return;

    fetch("/api/workspaces", {
      headers: { Authorization: `Bearer ${authAccessToken}` },
      cache: "no-store",
    })
      .then((r) => {
        if (!r.ok) throw new Error("워크스페이스 목록을 불러오지 못했습니다.");
        return r.json() as Promise<{ workspaces?: WorkspaceSummary[] }>;
      })
      .then((data) => {
        const items = data.workspaces ?? [];
        setWorkspaces(items);
        const storedWorkspaceId = getStoredWorkspaceId();
        const nextWorkspaceId =
          (storedWorkspaceId && items.some((workspace) => workspace.id === storedWorkspaceId)
            ? storedWorkspaceId
            : items[0]?.id) ?? "";
        setSelectedWorkspaceId(nextWorkspaceId);
        if (nextWorkspaceId) {
          window.localStorage.setItem(WORKSPACE_STORAGE_KEY, nextWorkspaceId);
        }
      })
      .catch((error) => {
        console.error(error);
        showToast("error", "워크스페이스 목록을 불러오지 못했습니다.");
      });
  }, [authAccessToken, authLoading, authUser, showToast]);

  useEffect(() => {
    if (authLoading) return;
    if (!authUser || !selectedWorkspaceId) return;

    fetch("/api/documents", { headers: buildAuthHeaders(), cache: "no-store" })
      .then((r) => {
        if (!r.ok) throw new Error("문서 목록을 불러오지 못했습니다.");
        return r.json() as Promise<DocumentSummary[]>;
      })
      .then(setDocs)
      .catch(() => showToast("error", "문서 목록을 불러오지 못했습니다."))
      .finally(() => setLoading(false));
  }, [authLoading, authUser, selectedWorkspaceId, buildAuthHeaders, showToast]);

  useEffect(() => {
    if (!settingsOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSettingsOpen(false);
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [settingsOpen]);

  useEffect(() => {
    const root = document.documentElement;
    if (themePreference === "system") {
      root.removeAttribute("data-theme");
      root.style.removeProperty("color-scheme");
      window.localStorage.removeItem(THEME_STORAGE_KEY);
      return;
    }

    root.dataset.theme = themePreference;
    root.style.colorScheme = themePreference;
    window.localStorage.setItem(THEME_STORAGE_KEY, themePreference);
  }, [themePreference]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setIsHydrated(true);
      setChatPaneWidth(getStoredChatPaneWidth());
    });

    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    window.localStorage.setItem(
      CHAT_PANE_WIDTH_STORAGE_KEY,
      String(clampChatPaneWidth(chatPaneWidth))
    );
  }, [chatPaneWidth]);

  useEffect(() => {
    if (!isResizingChatPane) return;

    const handlePointerMove = (event: PointerEvent) => {
      if (!chatResizeRef.current) return;
      const nextWidth =
        chatResizeRef.current.startWidth +
        (event.clientX - chatResizeRef.current.startX);
      setChatPaneWidth(clampChatPaneWidth(nextWidth));
    };

    const stopResizing = () => {
      chatResizeRef.current = null;
      setIsResizingChatPane(false);
      document.body.style.removeProperty("user-select");
      document.body.style.removeProperty("cursor");
    };

    document.body.style.setProperty("user-select", "none");
    document.body.style.setProperty("cursor", "col-resize");
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", stopResizing);
    window.addEventListener("pointercancel", stopResizing);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", stopResizing);
      window.removeEventListener("pointercancel", stopResizing);
      document.body.style.removeProperty("user-select");
      document.body.style.removeProperty("cursor");
    };
  }, [isResizingChatPane]);

  const openDocument = async (doc: DocumentSummary) => {
    setSelectedDocId(doc.id);
    setSelectedDoc(null);
    setSelectedDocLoading(true);
    if (isMobileViewport) setMobileSurface("workspace");
    try {
      const res = await fetch(`/api/documents/${doc.id}`, {
        cache: "no-store",
        headers: buildAuthHeaders(),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? "문서 상세 조회에 실패했습니다.");
      }
      setSelectedDoc((await res.json()) as Document);
    } catch (error) {
      showToast("error", error instanceof Error ? error.message : "문서 상세 조회 중 오류가 발생했습니다.");
      setSelectedDocId(null);
    } finally {
      setSelectedDocLoading(false);
    }
  };

  const handleDocAdded = (doc: DocumentSummary) => {
    setDocs((prev) => [summarizeDocument(doc), ...prev]);
    if (isMobileViewport) setMobileSurface("workspace");
  };

  const applyUpdatedDoc = (updatedDoc: DocumentSummary) => {
    const summary = summarizeDocument(updatedDoc);
    setDocs((prev) => prev.map((d) => (d.id === updatedDoc.id ? summary : d)));
    setSelectedDoc((prev) => {
      if (prev?.id !== updatedDoc.id) return prev;
      if ("rawContent" in updatedDoc) return updatedDoc as Document;
      return { ...prev, ...summary, meta: summary.meta };
    });
  };

  const applyDeletedDoc = (docId: string) => {
    setDocs((prev) => prev.filter((item) => item.id !== docId));
    setSelectedDoc((prev) => (prev?.id === docId ? null : prev));
    setSelectedDocId((prev) => (prev === docId ? null : prev));
  };

  const handleDocUpdated = async (docId: string, updates: {
    progressState?: string;
    deliveryHealth?: DeliveryHealth;
    dueDate?: string | null;
    author?: string | null;
    manualPolicy?: boolean;
  }) => {
    setUpdatingDocId(docId);
    try {
      const res = await fetch(`/api/documents/${docId}`, {
        method: "PATCH",
        headers: buildAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(updates),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? "문서 수정에 실패했습니다.");
      }
      applyUpdatedDoc((await res.json()) as Document);
      showToast("success", "문서가 수정됐습니다.");
    } catch (error) {
      showToast("error", error instanceof Error ? error.message : "문서 수정 중 오류가 발생했습니다.");
    } finally {
      setUpdatingDocId(null);
    }
  };

  const handleDocDeleted = async (doc: Document) => {
    setConfirmDelete({ doc });
  };

  const executeDelete = async () => {
    if (!confirmDelete) return;
    const { doc } = confirmDelete;
    setConfirmDelete(null);
    setDeletingDocId(doc.id);
    try {
      const res = await fetch(`/api/documents/${doc.id}`, {
        method: "DELETE",
        headers: buildAuthHeaders(),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? "문서 삭제에 실패했습니다.");
      }
      applyDeletedDoc(doc.id);
      showToast("success", "문서가 삭제됐습니다.");
    } catch (error) {
      showToast("error", error instanceof Error ? error.message : "문서 삭제 중 오류가 발생했습니다.");
    } finally {
      setDeletingDocId(null);
    }
  };

  const handleSaveSettings = () => {
    const nextAuthorName = authorDraft.trim();
    if (nextAuthorName) {
      window.localStorage.setItem(AUTHOR_STORAGE_KEY, nextAuthorName);
    } else {
      window.localStorage.removeItem(AUTHOR_STORAGE_KEY);
    }
    window.dispatchEvent(new Event(AUTHOR_CHANGE_EVENT));
    setThemePreference(themeDraft);
    setSettingsOpen(false);
    showToast("success", "환경설정이 저장됐습니다.");
  };

  const handleAuthSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const email = authEmail.trim();
    if (!email) return;

    setAuthSubmitting(true);
    setAuthNotice("");
    const { error } = await supabaseClient.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: window.location.origin,
      },
    });
    setAuthSubmitting(false);
    setAuthNotice(
      error
        ? `로그인 링크 전송에 실패했습니다. ${error.message}`
        : "이메일로 로그인 링크를 보냈습니다. 메일함에서 링크를 열면 DocFlow에 접속됩니다."
    );
  };

  const handleSignOut = async () => {
    await supabaseClient.auth.signOut();
    setDocs([]);
    setWorkspaces([]);
    setSelectedWorkspaceId("");
    setSelectedDoc(null);
    setSelectedDocId(null);
    setNewSchedules([]);
    showToast("success", "로그아웃됐습니다.");
  };

  const handleWorkspaceChange = (workspaceId: string) => {
    setSelectedWorkspaceId(workspaceId);
    window.localStorage.setItem(WORKSPACE_STORAGE_KEY, workspaceId);
    setDocs([]);
    setNewSchedules([]);
    setSelectedDoc(null);
    setSelectedDocId(null);
    setLoading(true);
  };

  const handleCreateWorkspace = async () => {
    const name = workspaceDraft.trim();
    if (!name || workspaceCreating) return;

    setWorkspaceCreating(true);
    try {
      const res = await fetch("/api/workspaces", {
        method: "POST",
        headers: buildAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ name }),
      });
      const data = (await res.json().catch(() => null)) as {
        workspace?: WorkspaceSummary;
        error?: string;
      } | null;
      if (!res.ok || !data?.workspace) {
        throw new Error(data?.error ?? "워크스페이스 생성에 실패했습니다.");
      }

      setWorkspaces((prev) => [...prev, data.workspace!]);
      setWorkspaceDraft("");
      handleWorkspaceChange(data.workspace.id);
      showToast("success", "워크스페이스가 생성됐습니다.");
    } catch (error) {
      showToast("error", error instanceof Error ? error.message : "워크스페이스 생성 중 오류가 발생했습니다.");
    } finally {
      setWorkspaceCreating(false);
    }
  };

  const serviceCount = new Set(docs.map((d) => d.meta.serviceName).filter(Boolean)).size;
  const activeWorkspace =
    workspaces.find((workspace) => workspace.id === selectedWorkspaceId) ?? workspaces[0] ?? null;
  const normalizedSearchQuery = deferredSearchQuery.trim().toLowerCase();
  const searchedDocs = docs.filter((doc) => {
    if (!normalizedSearchQuery) return true;
    return [
      doc.meta.serviceName,
      doc.meta.featureName,
      doc.meta.summary,
      doc.meta.author,
      doc.meta.docType,
      getDocumentCategory(doc),
      getDocumentTypeLabel(doc),
      doc.sourceLabel,
      ...(doc.meta.keywords ?? []),
    ]
      .filter(Boolean).join(" ").toLowerCase().includes(normalizedSearchQuery);
  });
  const completedCount = searchedDocs.filter((doc) => resolveProgressState(doc.meta) === "완료").length;
  const referenceCount = searchedDocs.filter((doc) => !doc.meta.isDocument).length;
  const mineDocsCount = effectiveAuthorName ? searchedDocs.filter((doc) => doc.meta.author?.trim() === effectiveAuthorName).length : 0;
  const toggleFilteredDocs = searchedDocs.filter((doc) => {
    if (showMineOnly && doc.meta.author?.trim() !== effectiveAuthorName) return false;
    if (hideCompleted && resolveProgressState(doc.meta) === "완료") return false;
    if (hideReferences && !doc.meta.isDocument) return false;
    return true;
  });
  const categoryCounts = toggleFilteredDocs.reduce<Record<DocumentCategory, number>>(
    (acc, doc) => {
      acc[getDocumentCategory(doc)] += 1;
      return acc;
    },
    { 기획: 0, 설계: 0, 개발: 0, 운영: 0, 참고: 0, 기타: 0 }
  );
  const activeCategoryFilter =
    categoryFilter !== "all" && categoryCounts[categoryFilter] > 0 ? categoryFilter : "all";
  const categoryScopedDocs = toggleFilteredDocs.filter(
    (doc) => activeCategoryFilter === "all" || getDocumentCategory(doc) === activeCategoryFilter
  );
  const detailCounts = categoryScopedDocs.reduce<Record<string, number>>((acc, doc) => {
    const label = getDocumentTypeLabel(doc);
    acc[label] = (acc[label] ?? 0) + 1;
    return acc;
  }, {});
  const detailOptions = Object.keys(detailCounts).sort(compareTypeLabels);
  const activeDetailFilter =
    detailFilter !== "all" && detailOptions.includes(detailFilter) ? detailFilter : "all";
  const detailScopedDocs = categoryScopedDocs.filter(
    (doc) => activeDetailFilter === "all" || getDocumentTypeLabel(doc) === activeDetailFilter
  );
  const healthCounts = detailScopedDocs.reduce<Record<DeliveryHealth, number>>(
    (acc, doc) => { acc[resolveDeliveryHealth(doc.meta)] += 1; return acc; },
    { red: 0, yellow: 0, green: 0, gray: 0 }
  );
  const activeHealthLabel = healthFilter === "all" ? "전체" : getHealthLabel(healthFilter);
  const activeSavedView =
    SAVED_VIEW_PRESETS.find(
      (preset) =>
        preset.category === categoryFilter &&
        preset.detail === detailFilter &&
        preset.health === healthFilter &&
        preset.hideCompleted === hideCompleted &&
        preset.hideReferences === hideReferences
    )?.id ?? null;
  const activeSavedViewLabel =
    SAVED_VIEW_PRESETS.find((preset) => preset.id === activeSavedView)?.label ?? "사용 안 함";
  const countDocumentsForPreset = (preset: SavedViewPreset) =>
    searchedDocs.filter((doc) => {
      if (showMineOnly && doc.meta.author?.trim() !== effectiveAuthorName) return false;
      if (preset.hideCompleted && resolveProgressState(doc.meta) === "완료") return false;
      if (preset.hideReferences && !doc.meta.isDocument) return false;
      if (preset.category !== "all" && getDocumentCategory(doc) !== preset.category) return false;
      if (preset.detail !== "all" && getDocumentTypeLabel(doc) !== preset.detail) return false;
      if (preset.health !== "all" && resolveDeliveryHealth(doc.meta) !== preset.health) return false;
      return true;
    }).length;
  const visibleDocs = detailScopedDocs
    .filter((doc) => healthFilter === "all" || resolveDeliveryHealth(doc.meta) === healthFilter)
    .sort((a, b) => {
      if (sortMode === "dueDate" || sortMode === "dday") {
        const diff = getDueDateTimestamp(a.meta.dueDate) - getDueDateTimestamp(b.meta.dueDate);
        if (diff !== 0) return diff;
      }
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

  const serviceGroups = Array.from(
    visibleDocs.reduce((map, doc) => {
      const key = getServiceGroupName(doc);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(doc);
      return map;
    }, new Map<string, DocumentSummary[]>())
  ).map(([key, groupDocs]) => {
    const dominantCategory =
      CATEGORY_ORDER.map((category) => ({
        category,
        count: groupDocs.filter((doc) => getDocumentCategory(doc) === category).length,
      }))
        .sort((a, b) => b.count - a.count || a.category.localeCompare(b.category, "ko"))[0]?.category ?? "기타";

    return {
      key,
      title: key,
      docs: groupDocs,
      dominantCategory,
      riskCount: groupDocs.filter((d) => resolveDeliveryHealth(d.meta) === "red").length,
    };
  });

  const toggleServiceCollapse = (key: string) => setCollapsedServices((prev) => ({ ...prev, [key]: !prev[key] }));
  const setAllServicesCollapsed = (collapsed: boolean) => setCollapsedServices(Object.fromEntries(serviceGroups.map((g) => [g.key, collapsed])));


  const confirmDocTitle = confirmDelete
    ? [confirmDelete.doc.meta.serviceName, confirmDelete.doc.meta.featureName].filter(Boolean).join(" · ") || "이 문서"
    : "";
  const openSettings = () => {
    setAuthorDraft(authorName);
    setThemeDraft(themePreference);
    setSettingsOpen(true);
  };
  const applySavedView = (preset: SavedViewPreset) => {
    setCategoryFilter(preset.category);
    setDetailFilter(preset.detail);
    setHealthFilter(preset.health);
    setHideCompleted(preset.hideCompleted);
    setHideReferences(preset.hideReferences);
    setFiltersExpanded(false);
  };
  const startChatPaneResize = (clientX: number) => {
    chatResizeRef.current = {
      startX: clientX,
      startWidth: clampChatPaneWidth(chatPaneWidth),
    };
    setIsResizingChatPane(true);
  };
  const effectiveIsMobileViewport = isHydrated ? isMobileViewport : false;
  const desktopChatPaneWidth = isHydrated ? clampChatPaneWidth(chatPaneWidth) : 440;
  const showMobileChat = effectiveIsMobileViewport && mobileSurface === "chat";
  const showMobileWorkspace = effectiveIsMobileViewport && mobileSurface === "workspace";

  if (authLoading) {
    return (
      <main className="flex min-h-[100dvh] items-center justify-center bg-[var(--bg-subtle)] font-sans">
        <span className="text-[11px] uppercase tracking-[0.16em] text-[var(--text-muted)]">확인 중…</span>
      </main>
    );
  }

  if (!authUser) {
    return (
      <AuthGate
        email={authEmail}
        notice={authNotice}
        submitting={authSubmitting}
        onEmailChange={setAuthEmail}
        onSubmit={handleAuthSubmit}
      />
    );
  }

  return (
    <div
      className={`flex h-[100dvh] overflow-hidden bg-[var(--bg)] font-sans ${
        isResizingChatPane ? "cursor-col-resize" : ""
      }`}
    >
      {/* Left: Chat */}
      <aside
        className={`min-h-0 w-full flex-col border-[var(--border)] bg-[var(--bg)] pb-20 lg:pb-0 ${
          effectiveIsMobileViewport ? (showMobileChat ? "flex" : "hidden") : "flex"
        } border-b lg:border-b-0 lg:border-r`}
        style={
          !effectiveIsMobileViewport
            ? {
                width: `${desktopChatPaneWidth}px`,
                minWidth: `${MIN_CHAT_PANE_WIDTH}px`,
                maxWidth: `${MAX_CHAT_PANE_WIDTH}px`,
                flex: `0 0 ${desktopChatPaneWidth}px`,
              }
            : undefined
        }
      >
        {/* Header */}
        <div className="border-b border-[var(--border)] px-4 py-3.5 lg:px-5">
          {/* Brand row */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center bg-[var(--text)] text-[11px] font-bold text-[var(--bg)]">
                D
              </div>
              <div>
                <h1 className="text-[14px] font-semibold tracking-[-0.022em] text-[var(--text)]">DocFlow</h1>
                <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-[var(--text-muted)]">AI 기획 문서 관리</p>
              </div>
            </div>
            <button
              type="button"
              onClick={openSettings}
              className="rounded-full border border-[var(--border-strong)] px-3 py-1.5 text-[10.5px] font-medium tracking-[0.02em] text-[var(--text-subtle)] transition-colors hover:bg-[var(--bg-subtle)] hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--text)]"
            >
              설정
            </button>
          </div>

          {/* Workspace selector */}
          <div className="mt-3.5 border-t border-[var(--border)] pt-3.5">
            <p className="mb-1.5 text-[9px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">워크스페이스</p>
            <select
              value={selectedWorkspaceId}
              onChange={(event) => handleWorkspaceChange(event.target.value)}
              className="w-full border-b border-[var(--border-strong)] bg-transparent pb-1.5 text-[12px] font-medium tracking-[-0.01em] text-[var(--text)] focus-visible:outline-none"
              aria-label="워크스페이스 선택"
            >
              {workspaces.map((workspace) => (
                <option key={workspace.id} value={workspace.id}>
                  {workspace.name}
                </option>
              ))}
            </select>
            <div className="mt-2 flex gap-1.5">
              <input
                type="text"
                value={workspaceDraft}
                onChange={(event) => setWorkspaceDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void handleCreateWorkspace();
                  }
                }}
                placeholder="새 워크스페이스 이름"
                className="min-w-0 flex-1 rounded-full border border-[var(--border-strong)] bg-[var(--bg-subtle)] px-3 py-1.5 text-[10.5px] text-[var(--text)] placeholder:text-[var(--text-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--text)]"
              />
              <button
                type="button"
                onClick={() => void handleCreateWorkspace()}
                disabled={!workspaceDraft.trim() || workspaceCreating}
                className="rounded-full bg-[var(--text)] px-3 py-1.5 text-[10.5px] font-semibold text-[var(--bg)] transition-opacity hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--text)]"
              >
                생성
              </button>
              <button
                type="button"
                onClick={() => setMembersModalOpen(true)}
                disabled={!activeWorkspace}
                className="rounded-full border border-[var(--border-strong)] px-3 py-1.5 text-[10.5px] font-medium text-[var(--text-subtle)] transition-colors hover:bg-[var(--bg-subtle)] hover:text-[var(--text)] disabled:cursor-not-allowed disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--text)]"
                title="멤버 관리"
              >
                멤버
              </button>
              <button
                type="button"
                onClick={() => setConfluenceImportOpen(true)}
                disabled={!activeWorkspace}
                className="rounded-full border border-[var(--border-strong)] px-3 py-1.5 text-[10.5px] font-medium text-[var(--text-subtle)] transition-colors hover:bg-[var(--bg-subtle)] hover:text-[var(--text)] disabled:cursor-not-allowed disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--text)]"
                title="Confluence 페이지 가져오기"
              >
                Wiki
              </button>
            </div>
          </div>

          {/* Status strip */}
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-[var(--border)] pt-3">
            <span className="text-[10px] tracking-[0.01em] text-[var(--text-muted)]">
              {effectiveAuthorName || "작성자 미설정"}
            </span>
            <span className="text-[var(--border-strong)]">·</span>
            <span className="text-[10px] tracking-[0.01em] text-[var(--text-muted)]">
              문서 {docs.length}
            </span>
            <span className="text-[var(--border-strong)]">·</span>
            <span className="text-[10px] tracking-[0.01em] text-[var(--text-muted)]">
              서비스 {serviceCount}
            </span>
            <button
              type="button"
              onClick={handleSignOut}
              className="ml-auto rounded-full border border-[var(--border-strong)] px-2.5 py-1 text-[9.5px] font-medium tracking-[0.04em] text-[var(--text-muted)] transition-colors hover:border-[var(--text)] hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--text)]"
            >
              로그아웃
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-hidden">
          <ChatWindow
            onDocAdded={handleDocAdded}
            onDocUpdated={applyUpdatedDoc}
            onDocDeleted={applyDeletedDoc}
            onScheduleAdded={(s) => {
              setNewSchedules((prev) => [...prev, s]);
              showToast("success", `"${s.title}" 일정이 등록됐습니다.`);
            }}
            authorName={effectiveAuthorName}
            accessToken={authAccessToken ?? undefined}
            workspaceId={selectedWorkspaceId}
          />
        </div>
      </aside>

      {!effectiveIsMobileViewport && (
        <div className="group relative hidden w-5 shrink-0 items-stretch justify-center lg:flex">
          <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-[var(--border)]" />
          <button
            type="button"
            aria-label="채팅창 너비 조절"
            onPointerDown={(event) => {
              event.preventDefault();
              startChatPaneResize(event.clientX);
            }}
            className="relative z-10 my-4 flex w-5 cursor-col-resize items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            <span className="flex h-16 w-2.5 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--bg)] shadow-sm transition-colors group-hover:border-blue-500/40 group-hover:bg-blue-500/5">
              <span className="h-7 w-[3px] rounded-full bg-[var(--border-strong)]" />
            </span>
          </button>
        </div>
      )}

      {/* Right: Dashboard */}
      <main
        id="main"
        className={`min-h-0 flex-1 flex-col overflow-hidden bg-[var(--bg-subtle)]/35 pb-20 lg:pb-0 ${
          effectiveIsMobileViewport ? (showMobileWorkspace ? "flex" : "hidden") : "flex"
        }`}
      >
        {/* Toolbar */}
        <div className="border-b border-[var(--border)] bg-[var(--bg)] px-3 py-2.5 lg:px-5 lg:py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-1.5">
              {(["list", "graph", "timeline"] as Tab[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  role="tab"
                  aria-selected={tab === t}
                  onClick={() => setTab(t)}
                  className={`rounded-full border px-3.5 py-1.5 text-[10.5px] font-medium uppercase tracking-[0.06em] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--text)] ${
                    tab === t
                      ? "border-[var(--text)] bg-[var(--text)] text-[var(--bg)]"
                      : "border-[var(--border-strong)] bg-transparent text-[var(--text-subtle)] hover:border-[var(--text)] hover:text-[var(--text)]"
                  }`}
                >
                  {t === "list" ? "목록" : t === "graph" ? "관계도" : "타임라인"}
                </button>
              ))}
            </div>
            <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-[var(--text-muted)]">
              작업 공간
            </p>
          </div>
        </div>

        <div className="flex-1 overflow-hidden p-3 lg:p-4">
          {tab === "list" ? (
            <div className="h-full overflow-y-auto">
              {loading ? (
                <div role="status" aria-live="polite" className="flex h-64 items-center justify-center">
                  <span className="text-[10.5px] font-medium uppercase tracking-[0.14em] text-[var(--text-muted)]">불러오는 중…</span>
                </div>
              ) : docs.length === 0 ? (
                <div className="flex h-64 flex-col items-center justify-center border border-[var(--border)] text-center">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text)]">문서가 없습니다</p>
                  <p className="mt-2 text-[11.5px] text-[var(--text-muted)]">좌측 채팅창에 기획 문서를 붙여넣으면 자동 등록됩니다</p>
                </div>
              ) : (
                <div className="space-y-3">
                  <section className="space-y-2 border border-[var(--border)] bg-[var(--bg)] px-3 py-2.5 lg:px-3.5">
                    {/* Search row */}
                    <div className="flex items-center gap-2">
                      <label className="relative min-w-0 flex-1">
                        <span className="sr-only">문서 검색</span>
                        <svg aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
                        </svg>
                        <input
                          type="search"
                          aria-label="문서 검색"
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          placeholder="문서, 서비스, 작성자, 키워드"
                          className="w-full rounded-full border border-[var(--border-strong)] bg-[var(--bg-subtle)] py-1.5 pl-8 pr-3 text-[11px] text-[var(--text)] placeholder:text-[var(--text-muted)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--text)]"
                        />
                      </label>
                      <div className="flex shrink-0 items-center gap-1">
                        {([{ value: "card", label: "카드" }, { value: "compact", label: "리스트" }] as const).map((o) => (
                          <button key={o.value} type="button" onClick={() => setViewMode(o.value)}
                            className={`rounded-full border px-3 py-1.5 text-[10px] font-medium uppercase tracking-[0.06em] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--text)] ${
                              viewMode === o.value
                                ? "border-[var(--text)] bg-[var(--text)] text-[var(--bg)]"
                                : "border-[var(--border-strong)] text-[var(--text-muted)] hover:border-[var(--text)] hover:text-[var(--text)]"
                            }`}
                          >{o.label}</button>
                        ))}
                      </div>
                      <select
                        value={sortMode}
                        onChange={(e) => setSortMode(e.target.value as SortMode)}
                        aria-label="정렬 기준"
                        className="shrink-0 rounded-full border border-[var(--border-strong)] bg-[var(--bg-subtle)] px-3 py-1.5 text-[10px] font-medium text-[var(--text-subtle)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--text)]"
                      >
                        <option value="latest">최신순</option>
                        <option value="dueDate">일정순</option>
                        <option value="dday">D-day순</option>
                      </select>
                      <span className="shrink-0 text-[10px] text-[var(--text-muted)]">{visibleDocs.length}/{docs.length}</span>
                    </div>

                    {/* Category chips — dense documentation filter pattern */}
                    <div className="border-t border-[var(--border)] pt-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => { setCategoryFilter("all"); setDetailFilter("all"); }}
                          className={`rounded-full border px-3 py-1.5 text-[10px] font-medium uppercase tracking-[0.06em] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--text)] ${
                            activeCategoryFilter === "all"
                              ? "border-[var(--text)] bg-[var(--text)] text-[var(--bg)]"
                              : "border-[var(--border-strong)] text-[var(--text-subtle)] hover:border-[var(--text)] hover:text-[var(--text)]"
                          }`}
                        >
                          전체 <span className="opacity-60">{toggleFilteredDocs.length}</span>
                        </button>
                        {CATEGORY_ORDER.map((category) => {
                          const active = activeCategoryFilter === category;
                          return (
                            <button
                              key={category}
                              type="button"
                              onClick={() => { setCategoryFilter(category); setDetailFilter("all"); }}
                              className={`rounded-full border px-3 py-1.5 text-[10px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--text)] ${
                                active
                                  ? "border-[var(--text)] bg-[var(--text)] text-[var(--bg)]"
                                  : "border-[var(--border-strong)] text-[var(--text-subtle)] hover:border-[var(--text)] hover:text-[var(--text)]"
                              }`}
                            >
                              {category} <span className="opacity-60">{categoryCounts[category]}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Expand toggle */}
                    <div className="border-t border-[var(--border)] pt-1.5">
                      <button
                        type="button"
                        onClick={() => setFiltersExpanded((prev) => !prev)}
                        className="flex w-full items-center justify-between gap-3 px-1 py-1 text-left transition-colors hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--text)]"
                      >
                        <div className="min-w-0">
                          <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">보기 옵션</p>
                          <p className="mt-0.5 truncate text-[10px] text-[var(--text-subtle)]">
                            {activeSavedViewLabel} · {activeDetailFilter === "all" ? "세부 유형 전체" : activeDetailFilter} · {activeHealthLabel}
                          </p>
                        </div>
                        <svg
                          aria-hidden="true"
                          className={`h-3.5 w-3.5 shrink-0 text-[var(--text-muted)] transition-transform ${filtersExpanded ? "rotate-180" : ""}`}
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={2}
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>

                      {filtersExpanded && (
                        <div className="mt-2.5 space-y-3 border-t border-[var(--border)] pt-2.5">
                          <div>
                            <p className="mb-2 text-[9px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">저장된 보기</p>
                            <div className="flex flex-wrap gap-1.5">
                              {SAVED_VIEW_PRESETS.map((preset) => {
                                const active = activeSavedView === preset.id;
                                return (
                                  <button
                                    key={preset.id}
                                    type="button"
                                    onClick={() => applySavedView(preset)}
                                    className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[10px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--text)] ${
                                      active
                                        ? "border-[var(--text)] bg-[var(--text)] text-[var(--bg)]"
                                        : "border-[var(--border-strong)] text-[var(--text-subtle)] hover:border-[var(--text)] hover:text-[var(--text)]"
                                    }`}
                                  >
                                    <span>{preset.label}</span>
                                    <span className="opacity-50">{countDocumentsForPreset(preset)}</span>
                                  </button>
                                );
                              })}
                            </div>
                          </div>

                          <div>
                            <p className="mb-2 text-[9px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">기타 옵션</p>
                            <div className="flex flex-wrap items-center gap-1.5">
                              <select
                                value={activeDetailFilter}
                                onChange={(e) => setDetailFilter(e.target.value)}
                                aria-label="세부 유형 선택"
                                className="rounded-full border border-[var(--border-strong)] bg-[var(--bg-subtle)] px-3 py-1.5 text-[10px] text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--text)]"
                              >
                                <option value="all">세부 유형 전체 {categoryScopedDocs.length}</option>
                                {detailOptions.map((type) => (
                                  <option key={type} value={type}>{type} {detailCounts[type]}</option>
                                ))}
                              </select>
                              <select
                                value={healthFilter}
                                onChange={(e) => setHealthFilter(e.target.value as DeliveryHealth | "all")}
                                aria-label="상태 선택"
                                className="rounded-full border border-[var(--border-strong)] bg-[var(--bg-subtle)] px-3 py-1.5 text-[10px] text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--text)]"
                              >
                                <option value="all">상태 전체 {detailScopedDocs.length}</option>
                                {(["red", "yellow", "green", "gray"] as const).map((value) => (
                                  <option key={value} value={value}>{getHealthLabel(value)} {healthCounts[value]}</option>
                                ))}
                              </select>
                              {[
                                { label: `내 문서 ${mineDocsCount}`, active: showMineOnly, onClick: () => setShowMineOnly((p) => !p), disabled: !effectiveAuthorName },
                                { label: `완료 숨기기 ${completedCount}`, active: hideCompleted, onClick: () => setHideCompleted((p) => !p) },
                                { label: `참고자료 숨기기 ${referenceCount}`, active: hideReferences, onClick: () => setHideReferences((p) => !p) },
                              ].map((btn) => (
                                <button key={btn.label} type="button" onClick={btn.onClick} disabled={btn.disabled}
                                  className={`rounded-full border px-3 py-1.5 text-[10px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--text)] disabled:cursor-not-allowed disabled:opacity-30 ${
                                    btn.active
                                      ? "border-[var(--text)] bg-[var(--text)] text-[var(--bg)]"
                                      : "border-[var(--border-strong)] text-[var(--text-subtle)] hover:border-[var(--text)] hover:text-[var(--text)]"
                                  }`}
                                >{btn.label}</button>
                              ))}
                              <button type="button" onClick={() => setAllServicesCollapsed(true)}
                                className="rounded-full border border-[var(--border-strong)] px-3 py-1.5 text-[10px] text-[var(--text-subtle)] transition-colors hover:border-[var(--text)] hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--text)]"
                              >전체 접기</button>
                              <button type="button" onClick={() => setAllServicesCollapsed(false)}
                                className="rounded-full border border-[var(--border-strong)] px-3 py-1.5 text-[10px] text-[var(--text-subtle)] transition-colors hover:border-[var(--text)] hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--text)]"
                              >전체 펼치기</button>
                              {(activeCategoryFilter !== "all" || activeDetailFilter !== "all") && (
                                <button
                                  type="button"
                                  onClick={() => { setCategoryFilter("all"); setDetailFilter("all"); }}
                                  className="rounded-full border border-[var(--border-strong)] px-3 py-1.5 text-[10px] text-[var(--text-subtle)] transition-colors hover:border-[var(--text)] hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--text)]"
                                >
                                  분류 초기화
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </section>

                  {/* Service Groups */}
                  {serviceGroups.length === 0 ? (
                    <div className="flex h-48 flex-col items-center justify-center rounded-xl border border-dashed border-[var(--border-strong)] text-center">
                      <p className="text-[12px] text-[var(--text-muted)]">조건에 맞는 문서가 없습니다</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {serviceGroups.map((group) => {
                        const isCollapsed = collapsedServices[group.key] ?? false;
                        const groupCategoryStyle = CATEGORY_STYLES[group.dominantCategory];
                        return (
                          <section key={group.key} aria-label={`${group.title} 서비스 그룹`}
                            className="overflow-hidden rounded-[16px] border border-[var(--border)] bg-[var(--bg-elevated)]"
                            style={{
                              boxShadow: `inset 3px 0 0 ${groupCategoryStyle.accent}`,
                            }}
                          >
                            <div
                              className="flex items-center justify-between gap-3 px-4 py-2.5"
                              style={{
                                background: `linear-gradient(90deg, ${groupCategoryStyle.soft} 0%, transparent 70%)`,
                              }}
                            >
                              <div className="flex min-w-0 items-center gap-3">
                                <h3 className="truncate text-[13px] font-semibold tracking-[-0.02em] text-[var(--text)]">{group.title}</h3>
                                <div className="flex flex-wrap gap-1.5">
                                  <span
                                    className="rounded-[10px] border px-1.5 py-0.5 text-[9.5px] font-medium tracking-[0.01em]"
                                    style={{
                                      borderColor: groupCategoryStyle.stroke,
                                      backgroundColor: groupCategoryStyle.soft,
                                      color: groupCategoryStyle.accent,
                                    }}
                                  >
                                    {group.dominantCategory}
                                  </span>
                                  <span className="text-[10px] tracking-[0.01em] text-[var(--text-muted)]">총 {group.docs.length}</span>
                                  {group.riskCount > 0 && (
                                    <span className="rounded-[10px] border border-red-500/30 bg-red-500/10 px-1.5 py-0.5 text-[9.5px] font-medium tracking-[0.01em] text-red-400">
                                      지연 {group.riskCount}
                                    </span>
                                  )}
                                </div>
                              </div>
                              <button
                                type="button"
                                aria-expanded={!isCollapsed}
                                onClick={() => toggleServiceCollapse(group.key)}
                                className="shrink-0 rounded-[10px] p-1.5 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-surface)] hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                                aria-label={isCollapsed ? "펼치기" : "접기"}
                              >
                                <svg aria-hidden="true" className={`h-4 w-4 transition-transform ${isCollapsed ? "" : "rotate-180"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                                </svg>
                              </button>
                            </div>
                            {!isCollapsed && (
                              viewMode === "card" ? (
                                <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,220px),1fr))] gap-3 p-3">
                                  {group.docs.map((doc) => (
                                    <DocCard key={doc.id} doc={doc} onClick={() => void openDocument(doc)} />
                                  ))}
                                </div>
                              ) : (
                                <div className="border-t border-[var(--border)]">
                                  <div className="hidden border-b border-[var(--border)] bg-[var(--bg)] px-4 py-2 text-[9.5px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)] lg:grid lg:grid-cols-[minmax(0,2fr)_minmax(0,2.4fr)_140px_150px_90px]">
                                    <span>문서</span><span>요약</span><span>진행 상태</span><span>일정</span><span>D-day</span>
                                  </div>
                                  <div className="divide-y divide-[var(--border)] bg-[var(--bg)]">
                                    {group.docs.map((doc) => (
                                      <CompactDocRow key={doc.id} doc={doc} onClick={() => void openDocument(doc)} />
                                    ))}
                                  </div>
                                </div>
                              )
                            )}
                          </section>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : tab === "graph" ? (
            <div className="h-full overflow-hidden rounded-[16px] border border-[var(--border)] bg-[var(--bg-subtle)]">
              <GraphView
                docs={docs}
                onOpenDoc={(doc) => void openDocument(doc)}
                accessToken={authAccessToken ?? undefined}
                workspaceId={selectedWorkspaceId}
              />
            </div>
          ) : (
            <div className="h-full overflow-hidden">
              <TimelineView
                docs={docs}
                onOpenDoc={(doc) => void openDocument(doc)}
                externalSchedules={newSchedules}
                accessToken={authAccessToken ?? undefined}
                workspaceId={selectedWorkspaceId}
              />
            </div>
          )}
        </div>
      </main>

      {effectiveIsMobileViewport && (
        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 px-3 pb-3">
          <div className="pointer-events-auto mx-auto flex max-w-md items-center gap-2 rounded-[16px] border border-[var(--border)] bg-[var(--bg)]/95 p-2 shadow-lg backdrop-blur">
            {(
              [
                { key: "chat", label: "대화" },
                { key: "workspace", label: "워크스페이스" },
              ] as const
            ).map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setMobileSurface(item.key)}
                className={`flex-1 rounded-[12px] px-3 py-2 text-[11px] font-medium tracking-[0.01em] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                  mobileSurface === item.key
                    ? "bg-blue-600 text-white"
                    : "bg-[var(--bg-subtle)] text-[var(--text-subtle)]"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Doc Modal */}
      {(selectedDoc || selectedDocLoading) && (
        <DocModal
          key={`${selectedDocId ?? "loading"}-${selectedDoc?.meta.progressState ?? ""}-${selectedDoc?.meta.deliveryHealth ?? ""}-${selectedDoc?.meta.dueDate ?? ""}-${selectedDoc?.meta.author ?? ""}-${selectedDoc?.meta.manualPolicy ? "policy" : "plain"}`}
          doc={selectedDoc}
          loading={selectedDocLoading}
          deleting={deletingDocId === selectedDocId}
          updating={updatingDocId === selectedDocId}
          onDelete={handleDocDeleted}
          onUpdate={handleDocUpdated}
          onClose={() => { setSelectedDoc(null); setSelectedDocId(null); }}
        />
      )}

      {/* Settings Modal */}
      {settingsOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => setSettingsOpen(false)}
          aria-hidden="true"
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={settingsTitleId}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-[20px] border border-[var(--border)] bg-[var(--bg)] p-6 shadow-[var(--shadow-float)]"
          >
            <h2 id={settingsTitleId} className="text-[15px] font-semibold tracking-[-0.02em] text-[var(--text)]">환경설정</h2>
            <p className="mt-1 text-[12px] leading-[1.65] tracking-[-0.01em] text-[var(--text-subtle)]">테마와 로그인 계정 정보를 확인합니다.</p>
            <div className="mt-5">
              <span className="mb-2 block text-[10px] font-medium uppercase tracking-[0.14em] text-[var(--text-subtle)]">테마</span>
              <div className="grid grid-cols-3 gap-2 rounded-[14px] border border-[var(--border)] bg-[var(--bg-subtle)] p-1">
                {([
                  { value: "system", label: "시스템", desc: "기기 설정 따름" },
                  { value: "light", label: "라이트", desc: "밝은 화면" },
                  { value: "dark", label: "다크", desc: "어두운 화면" },
                ] as const).map((option) => {
                  const active = themeDraft === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setThemeDraft(option.value)}
                      className={`rounded-[12px] px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                        active
                          ? "bg-[var(--bg)] text-[var(--text)] shadow-sm"
                          : "text-[var(--text-subtle)] hover:bg-[var(--bg)]/70"
                      }`}
                    >
                      <p className="text-[11px] font-semibold tracking-[-0.01em]">{option.label}</p>
                      <p className="mt-0.5 text-[10px] tracking-[0.01em] text-[var(--text-muted)]">{option.desc}</p>
                    </button>
                  );
                })}
              </div>
            </div>
            <label className="mt-4 block">
              <span className="mb-1.5 block text-[10px] font-medium uppercase tracking-[0.14em] text-[var(--text-subtle)]">로그인 작성자</span>
              <input
                type="text"
                value={authDisplayName || authorDraft}
                onChange={(e) => setAuthorDraft(e.target.value)}
                disabled={Boolean(authDisplayName)}
                placeholder="예: 홍길동…"
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] px-3 py-2 text-[14px] text-[var(--text)] placeholder:text-[var(--text-muted)] transition-colors disabled:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              />
              <span className="mt-1.5 block text-[10.5px] leading-[1.55] text-[var(--text-muted)]">
                로그인 계정 이름이 있으면 서버에서 이 값을 작성자로 사용합니다.
              </span>
            </label>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setSettingsOpen(false)}
                className="rounded-lg px-3 py-2 text-[13px] font-medium text-[var(--text-subtle)] transition-colors hover:bg-[var(--bg-subtle)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >취소</button>
              <button
                type="button"
                onClick={handleSaveSettings}
                className="rounded-lg bg-blue-600 px-3 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
              >저장</button>
            </div>
          </div>
        </div>
      )}

      {/* Workspace Members Modal */}
      {activeWorkspace && authUser && authAccessToken && (
        <WorkspaceMembersModal
          open={membersModalOpen}
          workspaceId={activeWorkspace.id}
          workspaceName={activeWorkspace.name}
          currentUserId={authUser.id}
          currentUserRole={activeWorkspace.role}
          authToken={authAccessToken}
          onClose={() => setMembersModalOpen(false)}
        />
      )}

      {/* Confluence Import Modal */}
      {activeWorkspace && authAccessToken && (
        <ConfluenceImportModal
          open={confluenceImportOpen}
          workspaceId={activeWorkspace.id}
          accessToken={authAccessToken}
          onImported={(newDocs) => {
            setDocs((prev) => {
              const existingIds = new Set(prev.map((d) => d.id));
              return [...newDocs.filter((d) => !existingIds.has(d.id)), ...prev];
            });
            showToast("success", `${newDocs.length}개 문서를 가져왔습니다.`);
            setConfluenceImportOpen(false);
          }}
          onClose={() => setConfluenceImportOpen(false)}
        />
      )}

      {/* Delete Confirm Modal */}
      <ConfirmModal
        open={!!confirmDelete}
        title="문서를 삭제할까요?"
        description={`"${confirmDocTitle}" 카드가 영구 삭제됩니다. 이 작업은 되돌릴 수 없습니다.`}
        confirmLabel="삭제"
        cancelLabel="취소"
        danger
        onConfirm={executeDelete}
        onCancel={() => setConfirmDelete(null)}
      />

      {/* Toast */}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
