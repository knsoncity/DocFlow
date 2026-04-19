"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DocumentSummary } from "../types";
import { getDocumentTitle } from "../../lib/document-display";
import { resolveDeliveryHealth } from "../../lib/meta";
import { getDocumentTypeLabel } from "../../lib/document-taxonomy";

// ─── types ─────────────────────────────────────────────────────────────────

type DocRelation = { from_doc: string; to_doc: string; relation_type: string };

type FNode = {
  id: string;
  doc: DocumentSummary;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  pinned: boolean;
};

type FEdge = {
  source: string;
  target: string;
  kind: "service" | "keyword";
  weight: number;
};

// ─── constants ──────────────────────────────────────────────────────────────

const TYPE_COLOR: Record<string, string> = {
  PRD: "#3b82f6",
  화면정의서: "#8b5cf6",
  플로우차트: "#10b981",
  API명세: "#f59e0b",
  회의록: "#6b7280",
  기타: "#a16207",
  참고자료: "#9ca3af",
};

const TYPE_SOFT: Record<string, string> = {
  PRD: "rgba(59,130,246,0.15)",
  화면정의서: "rgba(139,92,246,0.15)",
  플로우차트: "rgba(16,185,129,0.15)",
  API명세: "rgba(245,158,11,0.15)",
  회의록: "rgba(107,114,128,0.15)",
  기타: "rgba(161,98,7,0.15)",
  참고자료: "rgba(156,163,175,0.12)",
};

const HEALTH_RING: Record<string, string> = {
  red: "#ef4444",
  yellow: "#f59e0b",
  green: "#10b981",
  gray: "rgba(120,120,120,0.3)",
};

const LEGEND = [
  { label: "PRD", color: TYPE_COLOR.PRD },
  { label: "화면정의서", color: TYPE_COLOR.화면정의서 },
  { label: "플로우차트", color: TYPE_COLOR.플로우차트 },
  { label: "API명세", color: TYPE_COLOR.API명세 },
  { label: "회의록", color: TYPE_COLOR.회의록 },
  { label: "참고자료", color: TYPE_COLOR.참고자료 },
];

// ─── physics helpers ─────────────────────────────────────────────────────────

function scoreKeywordSimilarity(a: DocumentSummary, b: DocumentSummary) {
  const kA = new Set(a.meta.keywords ?? []);
  const kB = b.meta.keywords ?? [];
  if (kA.size === 0 || kB.length === 0) return 0;
  return kB.filter((k) => kA.has(k)).length;
}

function buildGraph(
  docs: DocumentSummary[],
  relations: DocRelation[]
): { nodes: FNode[]; edges: FEdge[] } {
  const cx = 600;
  const cy = 400;
  const angle = (Math.PI * 2) / Math.max(docs.length, 1);

  const nodes: FNode[] = docs.map((doc, i) => {
    const r = Math.max(180, Math.min(320, docs.length * 16));
    const isDoc = doc.meta.isDocument !== false;
    const completeness = doc.meta.completeness ?? 60;
    const radius = isDoc ? 10 + completeness * 0.08 : 8;
    return {
      id: doc.id,
      doc,
      x: cx + Math.cos(angle * i) * r + (Math.random() - 0.5) * 60,
      y: cy + Math.sin(angle * i) * r + (Math.random() - 0.5) * 60,
      vx: 0,
      vy: 0,
      radius,
      pinned: false,
    };
  });

  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const edgeSet = new Set<string>();
  const edges: FEdge[] = [];

  const addEdge = (src: string, tgt: string, kind: FEdge["kind"], weight: number) => {
    const key = [src, tgt].sort().join("|") + kind;
    if (edgeSet.has(key)) return;
    edgeSet.add(key);
    edges.push({ source: src, target: tgt, kind, weight });
  };

  for (const rel of relations) {
    if (nodeMap.has(rel.from_doc) && nodeMap.has(rel.to_doc)) {
      addEdge(rel.from_doc, rel.to_doc, "service", 1.2);
    }
  }

  for (let i = 0; i < docs.length; i++) {
    for (let j = i + 1; j < docs.length; j++) {
      const score = scoreKeywordSimilarity(docs[i], docs[j]);
      if (score >= 2) {
        addEdge(docs[i].id, docs[j].id, "keyword", Math.min(score / 4, 1));
      }
    }
  }

  return { nodes, edges };
}

function tickPhysics(
  nodes: FNode[],
  edges: FEdge[],
  canvasW: number,
  canvasH: number,
  alpha: number
) {
  const K_REPEL = 4800;
  const K_ATTRACT = 0.025;
  const K_CENTER = 0.004;
  const DAMP = 0.82;
  const cx = canvasW / 2;
  const cy = canvasH / 2;

  // centre gravity
  for (const n of nodes) {
    if (n.pinned) continue;
    n.vx += (cx - n.x) * K_CENTER * alpha;
    n.vy += (cy - n.y) * K_CENTER * alpha;
  }

  // repulsion (Barnes–Hut style skipped → O(n²) is fine for ≤200 nodes)
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i];
      const b = nodes[j];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist2 = dx * dx + dy * dy + 1;
      const dist = Math.sqrt(dist2);
      const force = (K_REPEL * alpha) / dist2;
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;
      if (!a.pinned) { a.vx -= fx; a.vy -= fy; }
      if (!b.pinned) { b.vx += fx; b.vy += fy; }
    }
  }

  // spring attraction
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  for (const e of edges) {
    const a = nodeMap.get(e.source);
    const b = nodeMap.get(e.target);
    if (!a || !b) continue;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dist = Math.sqrt(dx * dx + dy * dy) + 0.01;
    const restLen = e.kind === "service" ? 120 : 180;
    const stretch = dist - restLen;
    const force = K_ATTRACT * stretch * e.weight * alpha * 12;
    const fx = (dx / dist) * force;
    const fy = (dy / dist) * force;
    if (!a.pinned) { a.vx += fx; a.vy += fy; }
    if (!b.pinned) { b.vx -= fx; b.vy -= fy; }
  }

  // integrate + dampen + collide + clamp
  const pad = 60;
  for (const n of nodes) {
    if (n.pinned) continue;
    n.vx *= DAMP;
    n.vy *= DAMP;
    n.x += n.vx;
    n.y += n.vy;
    n.x = Math.max(pad + n.radius, Math.min(canvasW - pad - n.radius, n.x));
    n.y = Math.max(pad + n.radius, Math.min(canvasH - pad - n.radius, n.y));
  }
}

// ─── canvas draw ─────────────────────────────────────────────────────────────

function getThemeColors() {
  if (typeof window === "undefined") {
    return { bg: "#ffffff", text: "#0f0f0e", textMuted: "#9b9b97", border: "rgba(0,0,0,0.08)" };
  }
  const style = getComputedStyle(document.documentElement);
  return {
    bg: style.getPropertyValue("--bg").trim() || "#ffffff",
    text: style.getPropertyValue("--text").trim() || "#0f0f0e",
    textMuted: style.getPropertyValue("--text-muted").trim() || "#9b9b97",
    border: style.getPropertyValue("--border").trim() || "rgba(0,0,0,0.08)",
  };
}

function drawFrame(
  ctx: CanvasRenderingContext2D,
  nodes: FNode[],
  edges: FEdge[],
  hoveredId: string | null,
  selectedId: string | null,
  dpr: number
) {
  const w = ctx.canvas.width / dpr;
  const h = ctx.canvas.height / dpr;
  const { bg, text, textMuted } = getThemeColors();

  ctx.save();
  ctx.scale(dpr, dpr);

  // background
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  // subtle dot grid
  ctx.fillStyle = textMuted.startsWith("rgba") ? textMuted : `${textMuted}22`;
  for (let x = 24; x < w; x += 28) {
    for (let y = 24; y < h; y += 28) {
      ctx.beginPath();
      ctx.arc(x, y, 1, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const connected = new Set<string>();
  if (hoveredId || selectedId) {
    const activeId = selectedId ?? hoveredId;
    for (const e of edges) {
      if (e.source === activeId || e.target === activeId) {
        connected.add(e.source);
        connected.add(e.target);
      }
    }
  }
  const hasHighlight = connected.size > 0;

  // edges
  for (const e of edges) {
    const a = nodeMap.get(e.source);
    const b = nodeMap.get(e.target);
    if (!a || !b) continue;
    const isActive =
      !hasHighlight ||
      connected.has(e.source) ||
      connected.has(e.target);

    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);

    if (e.kind === "service") {
      ctx.strokeStyle = isActive
        ? "rgba(59,130,246,0.45)"
        : "rgba(59,130,246,0.08)";
      ctx.lineWidth = isActive ? 1.5 * e.weight : 0.8;
      ctx.setLineDash([]);
    } else {
      ctx.strokeStyle = isActive
        ? `rgba(120,120,120,0.32)`
        : `rgba(120,120,120,0.07)`;
      ctx.lineWidth = 0.8;
      ctx.setLineDash([4, 5]);
    }
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // nodes
  for (const n of nodes) {
    const typeLabel = getDocumentTypeLabel(n.doc);
    const color = TYPE_COLOR[typeLabel] ?? TYPE_COLOR["기타"];
    const soft = TYPE_SOFT[typeLabel] ?? TYPE_SOFT["기타"];
    const health = resolveDeliveryHealth(n.doc.meta);
    const ring = HEALTH_RING[health] ?? HEALTH_RING.gray;
    const isActive = !hasHighlight || connected.has(n.id);
    const isHovered = n.id === hoveredId;
    const isSelected = n.id === selectedId;
    const alpha = isActive ? 1 : 0.2;

    ctx.globalAlpha = alpha;

    // shadow glow on hover/select
    if (isHovered || isSelected) {
      ctx.shadowColor = color;
      ctx.shadowBlur = 16;
    }

    // fill
    ctx.beginPath();
    ctx.arc(n.x, n.y, n.radius, 0, Math.PI * 2);
    ctx.fillStyle = soft;
    ctx.fill();

    // stroke
    ctx.strokeStyle = color;
    ctx.lineWidth = isSelected ? 2.5 : isHovered ? 2 : 1.5;
    ctx.stroke();

    ctx.shadowBlur = 0;

    // health ring (outer)
    if (health !== "gray" || isHovered || isSelected) {
      ctx.beginPath();
      ctx.arc(n.x, n.y, n.radius + 4, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * 0.75);
      ctx.strokeStyle = ring;
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // label
    const title = getDocumentTitle(n.doc);
    const labelText = title.length > 12 ? title.slice(0, 11) + "…" : title;
    ctx.fillStyle = text;
    ctx.font = `500 10px "Pretendard Variable", "Pretendard", sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText(labelText, n.x, n.y + n.radius + 5);

    // type badge under label
    ctx.fillStyle = color;
    ctx.font = `500 8.5px "Avenir Next Condensed", "Arial Narrow", sans-serif`;
    ctx.fillText(typeLabel, n.x, n.y + n.radius + 17);

    ctx.globalAlpha = 1;
  }

  ctx.restore();
}

// ─── component ───────────────────────────────────────────────────────────────

export default function ForceGraph({
  docs,
  onOpenDoc,
}: {
  docs: DocumentSummary[];
  onOpenDoc: (doc: DocumentSummary) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const nodesRef = useRef<FNode[]>([]);
  const edgesRef = useRef<FEdge[]>([]);
  const alphaRef = useRef(1);
  const rafRef = useRef<number | null>(null);
  const dragRef = useRef<{ nodeId: string; ox: number; oy: number } | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [selectedDoc, setSelectedDoc] = useState<DocumentSummary | null>(null);
  const [relations, setRelations] = useState<DocRelation[]>([]);
  const [canvasSize, setCanvasSize] = useState({ w: 900, h: 600 });
  const graphData = useMemo(() => buildGraph(docs, relations), [docs, relations]);
  const edgeCount = graphData.edges.length;

  // fetch relations
  useEffect(() => {
    fetch("/api/relations")
      .then((r) => r.json())
      .then((data: { relations?: DocRelation[] }) => setRelations(data.relations ?? []))
      .catch(console.error);
  }, []);

  // rebuild graph when docs or relations change
  useEffect(() => {
    const { nodes, edges } = graphData;
    nodesRef.current = nodes;
    edgesRef.current = edges;
    alphaRef.current = 1;
  }, [graphData]);

  // resize observer
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      setCanvasSize({ w: entry.contentRect.width, h: entry.contentRect.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // animation loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = canvasSize.w * dpr;
    canvas.height = canvasSize.h * dpr;
    canvas.style.width = `${canvasSize.w}px`;
    canvas.style.height = `${canvasSize.h}px`;

    const loop = () => {
      const nodes = nodesRef.current;
      const edges = edgesRef.current;
      const alpha = alphaRef.current;

      if (alpha > 0.005) {
        tickPhysics(nodes, edges, canvasSize.w, canvasSize.h, alpha);
        alphaRef.current = alpha * 0.988;
      }

      drawFrame(ctx, nodes, edges, hoveredId, selectedDoc?.id ?? null, dpr);
      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [canvasSize, hoveredId, selectedDoc]);

  // pointer helpers
  const getNodeAt = useCallback((x: number, y: number) => {
    const nodes = nodesRef.current;
    for (let i = nodes.length - 1; i >= 0; i--) {
      const n = nodes[i];
      const dx = n.x - x;
      const dy = n.y - y;
      if (dx * dx + dy * dy <= (n.radius + 6) * (n.radius + 6)) return n;
    }
    return null;
  }, []);

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      if (dragRef.current) {
        const n = nodesRef.current.find((node) => node.id === dragRef.current!.nodeId);
        if (n) {
          n.x = x + dragRef.current.ox;
          n.y = y + dragRef.current.oy;
          n.vx = 0;
          n.vy = 0;
          alphaRef.current = Math.max(alphaRef.current, 0.3);
        }
        return;
      }

      const hit = getNodeAt(x, y);
      setHoveredId(hit?.id ?? null);
      e.currentTarget.style.cursor = hit ? "pointer" : "default";
    },
    [getNodeAt]
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const hit = getNodeAt(x, y);
      if (!hit) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      hit.pinned = true;
      dragRef.current = { nodeId: hit.id, ox: hit.x - x, oy: hit.y - y };
    },
    [getNodeAt]
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!dragRef.current) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const dist = Math.hypot(
        x - (nodesRef.current.find((n) => n.id === dragRef.current!.nodeId)?.x ?? x),
        y - (nodesRef.current.find((n) => n.id === dragRef.current!.nodeId)?.y ?? y)
      );
      const n = nodesRef.current.find((node) => node.id === dragRef.current!.nodeId);
      if (n) n.pinned = false;

      if (dist < 5) {
        const hit = nodesRef.current.find((node) => node.id === dragRef.current!.nodeId);
        if (hit) setSelectedDoc((prev) => (prev?.id === hit.id ? null : hit.doc));
      }

      dragRef.current = null;
      alphaRef.current = Math.max(alphaRef.current, 0.15);
    },
    []
  );

  const handlePointerLeave = useCallback(() => {
    setHoveredId(null);
    if (dragRef.current) {
      const n = nodesRef.current.find((node) => node.id === dragRef.current!.nodeId);
      if (n) n.pinned = false;
      dragRef.current = null;
    }
  }, []);

  const reheat = () => {
    alphaRef.current = 1;
  };

  return (
    <div ref={containerRef} className="relative flex h-full w-full overflow-hidden rounded-xl bg-[var(--bg)]">
      {/* canvas */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 touch-none"
        onPointerMove={handlePointerMove}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerLeave}
      />

      {/* legend */}
      <div className="absolute left-4 top-4 z-10 flex flex-col gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--bg)]/90 p-3 backdrop-blur-sm">
        <p className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">
          Type
        </p>
        {LEGEND.map((item) => (
          <div key={item.label} className="flex items-center gap-2">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full border"
              style={{ backgroundColor: item.color + "33", borderColor: item.color }}
            />
            <span className="text-[11px] text-[var(--text-subtle)]">{item.label}</span>
          </div>
        ))}
        <div className="mt-1 border-t border-[var(--border)] pt-1.5">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">
            Edge
          </p>
          <div className="flex items-center gap-2">
            <span className="h-px w-5 rounded bg-blue-400" />
            <span className="text-[11px] text-[var(--text-subtle)]">같은 서비스</span>
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="h-px w-5 rounded border-t border-dashed border-[var(--text-muted)]" />
            <span className="text-[11px] text-[var(--text-subtle)]">키워드 연관</span>
          </div>
        </div>
      </div>

      {/* controls */}
      <div className="absolute right-4 top-4 z-10 flex flex-col gap-2">
        <button
          type="button"
          onClick={reheat}
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--bg)]/90 text-[var(--text-muted)] backdrop-blur-sm transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          title="시뮬레이션 재시작"
        >
          <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 8A5.5 5.5 0 1 1 8 2.5M13.5 2.5v3h-3" />
          </svg>
        </button>
      </div>

      {/* stats bar */}
      <div className="absolute bottom-4 left-4 z-10 flex items-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--bg)]/90 px-3 py-1.5 backdrop-blur-sm">
        <span className="text-[11px] text-[var(--text-muted)]">
          노드 {docs.length} · 엣지 {edgeCount}
        </span>
        <span className="text-[11px] text-[var(--text-muted)]">드래그로 노드 이동 · 클릭으로 선택</span>
      </div>

      {/* selected doc panel */}
      {selectedDoc && (
        <div className="absolute bottom-4 right-4 z-10 w-64 rounded-xl border border-[var(--border)] bg-[var(--bg)]/95 p-4 shadow-lg backdrop-blur-sm">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-[12px] font-semibold text-[var(--text)]">
                {getDocumentTitle(selectedDoc)}
              </p>
              <p className="mt-0.5 text-[10px] text-[var(--text-muted)]">
                {getDocumentTypeLabel(selectedDoc)} · {selectedDoc.meta.serviceName ?? "미분류"}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSelectedDoc(null)}
              aria-label="닫기"
              className="shrink-0 rounded p-0.5 text-[var(--text-muted)] hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" d="M4 4l8 8M12 4l-8 8" />
              </svg>
            </button>
          </div>

          {selectedDoc.meta.summary && (
            <p className="mt-2 line-clamp-3 text-[11px] leading-relaxed text-[var(--text-subtle)]">
              {selectedDoc.meta.summary}
            </p>
          )}

          <div className="mt-3 flex flex-wrap gap-1">
            {(selectedDoc.meta.keywords ?? []).slice(0, 4).map((kw) => (
              <span
                key={kw}
                className="rounded border border-[var(--border)] bg-[var(--bg-subtle)] px-1.5 py-0.5 text-[10px] text-[var(--text-muted)]"
              >
                #{kw}
              </span>
            ))}
          </div>

          <button
            type="button"
            onClick={() => { onOpenDoc(selectedDoc); setSelectedDoc(null); }}
            className="mt-3 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] py-1.5 text-[11px] font-medium text-[var(--text)] transition-colors hover:border-blue-500 hover:bg-blue-500/10 hover:text-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            문서 열기
          </button>
        </div>
      )}

      {/* empty state */}
      {docs.length === 0 && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
          <p className="text-[14px] font-medium text-[var(--text-subtle)]">문서가 없습니다</p>
          <p className="text-[12px] text-[var(--text-muted)]">채팅에서 문서를 등록하면 그래프에 나타납니다.</p>
        </div>
      )}
    </div>
  );
}
