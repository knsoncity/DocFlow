"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import ForceGraph from "./ForceGraph";
import { DocumentSummary } from "../types";
import { getDocumentSummary, getDocumentTitle } from "../../lib/document-display";
import {
  getDday,
  resolveDeliveryHealth,
  resolveProgressState,
  resolveScheduleSummary,
} from "../../lib/meta";
import {
  CATEGORY_ORDER,
  CATEGORY_STYLES,
  compareTypeLabels,
  getDocumentCategory as getTaxonomyCategory,
  getDocumentTypeLabel as getTaxonomyTypeLabel,
} from "../../lib/document-taxonomy";

const GRAPH_PAPER = "#ffffff";
const SIDE_PAPER = "#f7f7f6";
const INK = "#0f0f0e";
const ACCENT = "#2563eb";
const PANEL_BORDER_STRONG = "rgba(0, 0, 0, 0.14)";
const PANEL_BG = "rgba(255,255,255,0.98)";
const SOFT_SHADOW = "0 18px 34px rgba(15, 15, 14, 0.08)";
const SCREEN_GRAPH_PAPER = "var(--bg)";
const SCREEN_SIDE_PAPER = "var(--bg-subtle)";
const SCREEN_CANVAS_PAPER = "var(--bg-surface)";
const SCREEN_INK = "var(--text)";
const SCREEN_TEXT_SUBTLE = "var(--text-subtle)";
const SCREEN_TEXT_MUTED = "var(--text-muted)";
const SCREEN_NODE_BORDER = "color-mix(in srgb, var(--bg) 74%, transparent)";
const SCREEN_GRID_DOT = "color-mix(in srgb, var(--text) 11%, transparent)";
const SCREEN_CANVAS_MAP_WASH =
  "radial-gradient(circle at 14% 18%, color-mix(in srgb, var(--accent) 10%, transparent), transparent 24%), radial-gradient(circle at 78% 16%, rgba(180,83,9,0.08), transparent 20%), radial-gradient(circle at 74% 78%, rgba(15,23,42,0.06), transparent 22%), linear-gradient(180deg, color-mix(in srgb, var(--bg) 10%, transparent), color-mix(in srgb, var(--bg) 2%, transparent)), repeating-linear-gradient(90deg, transparent 0 127px, color-mix(in srgb, var(--text) 2.2%, transparent) 127px 128px), repeating-linear-gradient(0deg, transparent 0 127px, color-mix(in srgb, var(--text) 1.8%, transparent) 127px 128px)";
const SCREEN_CANVAS_EXPLORE_WASH =
  "radial-gradient(circle at 18% 20%, color-mix(in srgb, var(--accent) 8%, transparent), transparent 20%), radial-gradient(circle at 76% 22%, rgba(148,163,184,0.12), transparent 20%), radial-gradient(circle at 68% 82%, rgba(16,185,129,0.07), transparent 18%), linear-gradient(180deg, color-mix(in srgb, var(--bg) 14%, transparent), color-mix(in srgb, var(--bg) 3%, transparent)), repeating-linear-gradient(90deg, transparent 0 139px, color-mix(in srgb, var(--text) 2%, transparent) 139px 140px), repeating-linear-gradient(0deg, transparent 0 139px, color-mix(in srgb, var(--text) 1.6%, transparent) 139px 140px)";
const DISPLAY_FONT_FAMILY =
  "\"Avenir Next Condensed\", \"Arial Narrow\", \"Roboto Condensed\", sans-serif";
const BODY_FONT_FAMILY =
  "\"Avenir Next\", \"Pretendard Variable\", \"Pretendard\", \"Noto Sans KR\", sans-serif";
const DISPLAY_FONT = { fontFamily: "var(--font-display)" };
const BODY_FONT = { fontFamily: "var(--font-editorial)" };
const SCREEN_ROUTE_PRIMARY = "color-mix(in srgb, var(--accent) 20%, transparent)";
const SCREEN_ROUTE_SOFT = "color-mix(in srgb, var(--text) 5%, transparent)";

const TYPE_STYLES: Record<
  string,
  { accent: string; soft: string; stroke: string; label: string }
> = {
  PRD: { accent: "#0e78d0", soft: "#cfe9fb", stroke: "#8bc4f5", label: "Product" },
  화면정의서: { accent: "#bf1e42", soft: "#f6d4dc", stroke: "#e6a3b3", label: "Screen" },
  플로우차트: { accent: "#2fb15d", soft: "#d8f3df", stroke: "#92d5ab", label: "Flow" },
  API명세: { accent: "#f39b15", soft: "#fee7bf", stroke: "#f4c36a", label: "API" },
  회의록: { accent: "#2d2d2d", soft: "#ececec", stroke: "#b5b5b5", label: "Meeting" },
  기타: { accent: "#bb6b2d", soft: "#f2dcc9", stroke: "#d4aa86", label: "Other" },
  참고자료: { accent: "#666666", soft: "#ebebeb", stroke: "#c9c9c9", label: "Reference" },
};

type GraphMode = "map" | "explore" | "force";
type HeatOverlayMode = "off" | "volume" | "risk";
type Point = { x: number; y: number };
type DocNode = { doc: DocumentSummary; point: Point };
type HeatSpot = {
  id: string;
  center: Point;
  radius: number;
  blurRadius: number;
  glowOpacity: number;
  coreOpacity: number;
  glowColor: string;
  coreColor: string;
  scoreLabel: string;
};
type ServiceCluster = {
  id: string;
  title: string;
  docs: DocumentSummary[];
  center: Point;
  hubRadius: number;
  nodes: DocNode[];
  keywords: string[];
  docTypes: string[];
};
type ServiceLink = { from: string; to: string; weight: number };
type ClusterOffsetMap = Record<string, Point>;
type DragState = { clusterId: string; startX: number; startY: number; origin: Point };
type ExploreServiceNode = {
  id: string;
  title: string;
  docs: DocumentSummary[];
  point: Point;
  frameWidth: number;
  frameHeight: number;
  keywords: string[];
  docTypes: string[];
};
type ExploreDocNode = { id: string; doc: DocumentSummary; point: Point; serviceId: string };
type ExploreLink = { from: string; to: string; weight: number; kind: "service" | "related" };
type ExploreGraph = {
  services: ExploreServiceNode[];
  docNodes: ExploreDocNode[];
  links: ExploreLink[];
  canvasWidth: number;
  canvasHeight: number;
  linkCount: number;
  pointMap: Map<string, Point>;
  serviceMap: Map<string, ExploreServiceNode>;
};

function clampZoom(value: number) {
  return Math.min(1.85, Math.max(0.65, Number(value.toFixed(2))));
}

function truncate(text: string | undefined, max = 22) {
  if (!text) return "";
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function getServiceCode(title: string) {
  const compact = title.replace(/\s+/g, "");
  const latin = compact.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  if (latin.length >= 3) return latin.slice(0, 3);
  return compact.slice(0, Math.min(3, compact.length)).toUpperCase();
}

function escapeXml(text: string | undefined) {
  return (text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildRoutePath(from: Point, to: Point, seed = 0) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const distance = Math.hypot(dx, dy);
  const lift = Math.max(26, Math.min(96, distance * 0.18));
  const direction = seed % 2 === 0 ? 1 : -1;

  return `M ${from.x} ${from.y} C ${from.x + dx * 0.26} ${from.y - lift * direction + dy * 0.08}, ${
    to.x - dx * 0.26
  } ${to.y + lift * direction - dy * 0.08}, ${to.x} ${to.y}`;
}

function getRouteMidpoint(from: Point, to: Point) {
  return {
    x: from.x + (to.x - from.x) * 0.5,
    y: from.y + (to.y - from.y) * 0.5 - Math.min(26, Math.abs(to.x - from.x) * 0.08),
  };
}

function buildHeatSpots(clusters: ServiceCluster[], mode: HeatOverlayMode) {
  if (mode === "off") return [];

  const maxDocs = Math.max(1, ...clusters.map((cluster) => cluster.docs.length));
  const riskScores = clusters.map((cluster) =>
    cluster.docs.reduce((score, doc) => {
      const health = resolveDeliveryHealth(doc.meta);
      if (health === "red") return score + 1;
      if (health === "yellow") return score + 0.58;
      if (health === "gray") return score + 0.24;
      return score + 0.08;
    }, 0)
  );
  const maxRisk = Math.max(1, ...riskScores);

  return clusters.map((cluster, index): HeatSpot => {
    const docRatio = cluster.docs.length / maxDocs;
    const riskRatio = riskScores[index] / maxRisk;
    const intensity = mode === "volume" ? docRatio : riskRatio;
    const radius = cluster.hubRadius + 84 + intensity * 54;
    const blurRadius = radius + 34 + intensity * 30;

    if (mode === "volume") {
      return {
        id: cluster.id,
        center: cluster.center,
        radius,
        blurRadius,
        glowOpacity: 0.14 + intensity * 0.2,
        coreOpacity: 0.08 + intensity * 0.1,
        glowColor: "rgba(37, 99, 235, 0.9)",
        coreColor: "rgba(14, 116, 144, 0.9)",
        scoreLabel: `${cluster.docs.length} docs`,
      };
    }

    return {
      id: cluster.id,
      center: cluster.center,
      radius,
      blurRadius,
      glowOpacity: 0.12 + intensity * 0.28,
      coreOpacity: 0.08 + intensity * 0.14,
      glowColor: "rgba(217, 119, 6, 0.92)",
      coreColor: "rgba(190, 24, 93, 0.88)",
      scoreLabel: `${riskScores[index].toFixed(1)} risk`,
    };
  });
}

function getServiceName(doc: DocumentSummary) {
  return doc.meta.serviceName?.trim() || "미분류 서비스";
}

function getDocTypeLabel(doc: DocumentSummary) {
  return getTaxonomyTypeLabel(doc);
}

function getDocCategory(doc: DocumentSummary) {
  return getTaxonomyCategory(doc);
}

function getTypeStyle(type: string) {
  return TYPE_STYLES[type] ?? TYPE_STYLES["기타"];
}

function getDominantDocType(docs: DocumentSummary[]) {
  const counts = docs.reduce<Record<string, number>>((acc, doc) => {
    const label = getDocTypeLabel(doc);
    acc[label] = (acc[label] ?? 0) + 1;
    return acc;
  }, {});

  const [dominant] = Object.entries(counts).sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ko")
  );

  return dominant?.[0] ?? "기타";
}

function getCollectionStyle(docs: DocumentSummary[]) {
  return getTypeStyle(getDominantDocType(docs));
}

function getNodeTitle(doc: DocumentSummary) {
  return getDocumentTitle(doc);
}

function getNodeSummary(doc: DocumentSummary) {
  return getDocumentSummary(doc);
}

function uniqueStrings(values: Array<string | undefined>) {
  return Array.from(new Set(values.map((value) => value?.trim()).filter(Boolean) as string[]));
}

function intersectCount(left: string[], right: string[]) {
  if (left.length === 0 || right.length === 0) return 0;
  const rightSet = new Set(right);
  return left.reduce((count, item) => count + (rightSet.has(item) ? 1 : 0), 0);
}

function scoreDocumentRelation(left: DocumentSummary, right: DocumentSummary) {
  const sharedKeywords = intersectCount(left.meta.keywords ?? [], right.meta.keywords ?? []);
  const sameType = getDocTypeLabel(left) === getDocTypeLabel(right) ? 1 : 0;
  const sameService = getServiceName(left) === getServiceName(right) ? 1 : 0;
  const sameAuthor =
    left.meta.author && right.meta.author && left.meta.author === right.meta.author ? 1 : 0;

  return sharedKeywords * 1.9 + sameType * 0.6 + sameService * 0.55 + sameAuthor * 0.3;
}

function buildServiceClusters(docs: DocumentSummary[]) {
  const grouped = new Map<string, DocumentSummary[]>();

  for (const doc of docs) {
    const key = getServiceName(doc);
    const bucket = grouped.get(key);
    if (bucket) bucket.push(doc);
    else grouped.set(key, [doc]);
  }

  const groups = Array.from(grouped.entries()).sort(
    (a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0], "ko")
  );
  const columnCount = groups.length >= 11 ? 4 : groups.length >= 6 ? 3 : groups.length >= 3 ? 2 : 1;
  const columnSpacing = 338;
  const rowSpacing = 296;
  const baseX = 160;
  const baseY = 150;
  const columnJitter = [-22, 28, -18, 18];
  const rowJitter = [0, 24, -18, 34, -12, 18];

  return groups.map(([title, groupDocs], index): ServiceCluster => {
    const column = index % columnCount;
    const row = Math.floor(index / columnCount);
    const center = {
      x:
        baseX +
        column * columnSpacing +
        (columnJitter[column] ?? 0) +
        (row % 2 === 0 ? 0 : 24),
      y: baseY + row * rowSpacing + (rowJitter[row % rowJitter.length] ?? 0),
    };
    const hubRadius = Math.max(48, Math.min(62, 48 + groupDocs.length * 0.8));
    const ringStart = hubRadius + 38;

    const nodes = groupDocs.map((doc, docIndex) => {
      let ring = 0;
      let remaining = docIndex;
      let ringCapacity = 10;

      while (remaining >= ringCapacity) {
        remaining -= ringCapacity;
        ring += 1;
        ringCapacity = 10 + ring * 6;
      }

      const radius = ringStart + ring * 28 + (remaining % 2 === 0 ? 0 : 4);
      const angle =
        -Math.PI / 2 +
        ((Math.PI * 2) / ringCapacity) * remaining +
        ((index + ring) % 2 === 0 ? 0.08 : -0.12);

      return {
        doc,
        point: {
          x: center.x + Math.cos(angle) * radius,
          y: center.y + Math.sin(angle) * radius,
        },
      };
    });

    return {
      id: `${title}-${index}`,
      title,
      docs: groupDocs,
      center,
      hubRadius,
      nodes,
      keywords: uniqueStrings(groupDocs.flatMap((doc) => doc.meta.keywords ?? [])),
      docTypes: uniqueStrings(groupDocs.map((doc) => getDocTypeLabel(doc))),
    };
  });
}

function applyClusterOffsets(clusters: ServiceCluster[], offsets: ClusterOffsetMap) {
  return clusters.map((cluster) => {
    const offset = offsets[cluster.id] ?? { x: 0, y: 0 };
    return {
      ...cluster,
      center: {
        x: cluster.center.x + offset.x,
        y: cluster.center.y + offset.y,
      },
      nodes: cluster.nodes.map((node) => ({
        ...node,
        point: {
          x: node.point.x + offset.x,
          y: node.point.y + offset.y,
        },
      })),
    };
  });
}

function buildServiceLinks(clusters: ServiceCluster[]) {
  const candidates: Array<ServiceLink & { score: number }> = [];

  for (let i = 0; i < clusters.length; i += 1) {
    for (let j = i + 1; j < clusters.length; j += 1) {
      const left = clusters[i];
      const right = clusters[j];
      const sharedKeywords = intersectCount(left.keywords, right.keywords);
      const sharedTypes = intersectCount(left.docTypes, right.docTypes);
      const score =
        sharedKeywords * 2 + sharedTypes + Math.min(left.docs.length, right.docs.length) / 7;

      if (score > 0.8) {
        candidates.push({ from: left.id, to: right.id, weight: score, score });
      }
    }
  }

  candidates.sort((a, b) => b.score - a.score);
  const degree = new Map<string, number>();
  const selected: ServiceLink[] = [];
  const pairKeys = new Set<string>();

  for (const candidate of candidates) {
    const fromDegree = degree.get(candidate.from) ?? 0;
    const toDegree = degree.get(candidate.to) ?? 0;
    if (fromDegree >= 3 && toDegree >= 3) continue;

    const pairKey = [candidate.from, candidate.to].sort().join("::");
    if (pairKeys.has(pairKey)) continue;

    pairKeys.add(pairKey);
    degree.set(candidate.from, fromDegree + 1);
    degree.set(candidate.to, toDegree + 1);
    selected.push({ from: candidate.from, to: candidate.to, weight: candidate.weight });
  }

  const ordered = [...clusters].sort(
    (a, b) => a.center.y - b.center.y || a.center.x - b.center.x
  );

  for (let index = 0; index < ordered.length - 1; index += 1) {
    const from = ordered[index];
    const to = ordered[index + 1];
    const pairKey = [from.id, to.id].sort().join("::");
    if (pairKeys.has(pairKey)) continue;

    pairKeys.add(pairKey);
    selected.push({ from: from.id, to: to.id, weight: 1.3 });
  }

  return selected;
}

function buildExploreGraph(docs: DocumentSummary[]): ExploreGraph {
  const grouped = new Map<string, DocumentSummary[]>();

  for (const doc of docs) {
    const key = getServiceName(doc);
    const bucket = grouped.get(key);
    if (bucket) bucket.push(doc);
    else grouped.set(key, [doc]);
  }

  const groups = Array.from(grouped.entries()).sort(
    (a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0], "ko")
  );
  const columnCount = groups.length >= 11 ? 4 : groups.length >= 5 ? 3 : groups.length >= 2 ? 2 : 1;
  const columnSpacing = 286;
  const rowSpacing = 228;
  const baseX = 148;
  const baseY = 112;
  const columnJitter = [-18, 20, -14, 14];
  const rowJitter = [0, 16, -10, 24, -8, 12];

  const services = groups.map(([title, groupDocs], index): ExploreServiceNode => {
    const column = index % columnCount;
    const row = Math.floor(index / columnCount);
    const frameWidth = Math.max(104, Math.min(152, 106 + title.length * 3.2));
    const frameHeight = 46;

    return {
      id: `service-${index}-${title}`,
      title,
      docs: groupDocs,
      point: {
        x:
          baseX +
          column * columnSpacing +
          (columnJitter[column] ?? 0) +
          (row % 2 === 0 ? 0 : 20),
        y: baseY + row * rowSpacing + (rowJitter[row % rowJitter.length] ?? 0),
      },
      frameWidth,
      frameHeight,
      keywords: uniqueStrings(groupDocs.flatMap((doc) => doc.meta.keywords ?? [])),
      docTypes: uniqueStrings(groupDocs.map((doc) => getDocTypeLabel(doc))),
    };
  });

  const docNodes: ExploreDocNode[] = [];
  const links: ExploreLink[] = [];

  services.forEach((service, serviceIndex) => {
    service.docs.forEach((doc, docIndex) => {
      let ring = 0;
      let remaining = docIndex;
      let ringCapacity = 8;

      while (remaining >= ringCapacity) {
        remaining -= ringCapacity;
        ring += 1;
        ringCapacity = 8 + ring * 6;
      }

      const radius = 50 + ring * 24 + (remaining % 2 === 0 ? 0 : 4);
      const angle =
        -Math.PI / 2 +
        ((Math.PI * 2) / ringCapacity) * remaining +
        ((serviceIndex + ring) % 2 === 0 ? 0.14 : -0.11);

      const node: ExploreDocNode = {
        id: doc.id,
        doc,
        serviceId: service.id,
        point: {
          x: service.point.x + Math.cos(angle) * radius,
          y: service.point.y + Math.sin(angle) * radius,
        },
      };

      docNodes.push(node);
      links.push({
        from: service.id,
        to: node.id,
        weight: 1,
        kind: "service",
      });
    });
  });

  const relatedCandidates: Array<ExploreLink & { score: number }> = [];

  for (let i = 0; i < docNodes.length; i += 1) {
    for (let j = i + 1; j < docNodes.length; j += 1) {
      const left = docNodes[i];
      const right = docNodes[j];
      const score = scoreDocumentRelation(left.doc, right.doc);

      if (score < 1.05) continue;

      relatedCandidates.push({
        from: left.id,
        to: right.id,
        weight: score,
        kind: "related",
        score,
      });
    }
  }

  relatedCandidates.sort((a, b) => b.score - a.score);
  const degree = new Map<string, number>();
  const relatedKeys = new Set<string>();

  for (const candidate of relatedCandidates) {
    const key = [candidate.from, candidate.to].sort().join("::");
    if (relatedKeys.has(key)) continue;
    if ((degree.get(candidate.from) ?? 0) >= 2 || (degree.get(candidate.to) ?? 0) >= 2) continue;

    relatedKeys.add(key);
    degree.set(candidate.from, (degree.get(candidate.from) ?? 0) + 1);
    degree.set(candidate.to, (degree.get(candidate.to) ?? 0) + 1);
    links.push({
      from: candidate.from,
      to: candidate.to,
      weight: candidate.weight,
      kind: "related",
    });
  }

  const pointMap = new Map<string, Point>();
  const serviceMap = new Map<string, ExploreServiceNode>();

  services.forEach((service) => {
    pointMap.set(service.id, service.point);
    serviceMap.set(service.id, service);
  });
  docNodes.forEach((node) => pointMap.set(node.id, node.point));

  const canvasWidth = Math.max(
    980,
    ...services.map((service) => service.point.x + service.frameWidth / 2 + 170),
    ...docNodes.map((node) => node.point.x + 180)
  );
  const canvasHeight = Math.max(
    720,
    ...services.map((service) => service.point.y + service.frameHeight / 2 + 170),
    ...docNodes.map((node) => node.point.y + 160)
  );

  return {
    services,
    docNodes,
    links,
    canvasWidth,
    canvasHeight,
    linkCount: links.length,
    pointMap,
    serviceMap,
  };
}

function buildGraphExportSvg({
  clusters,
  serviceLinks,
  canvasWidth,
  canvasHeight,
  selectedDoc,
  typeCounts,
  heatSpots,
}: {
  clusters: ServiceCluster[];
  serviceLinks: ServiceLink[];
  canvasWidth: number;
  canvasHeight: number;
  selectedDoc: DocumentSummary | null;
  typeCounts: Record<string, number>;
  heatSpots: HeatSpot[];
}) {
  const railWidth = 320;
  const totalWidth = railWidth + canvasWidth;
  const totalHeight = Math.max(canvasHeight, 760);
  const clusterMap = new Map(clusters.map((cluster) => [cluster.id, cluster]));
  const typeEntries = Object.entries(typeCounts).sort((a, b) => b[1] - a[1]);
  const selectedStyle = selectedDoc ? getTypeStyle(getDocTypeLabel(selectedDoc)) : null;

  const linkLines = serviceLinks
    .map((link) => {
      const from = clusterMap.get(link.from);
      const to = clusterMap.get(link.to);
      if (!from || !to) return "";
      return `<line x1="${railWidth + from.center.x}" y1="${from.center.y}" x2="${railWidth + to.center.x}" y2="${to.center.y}" stroke="rgba(37,99,235,0.12)" stroke-width="${Math.min(1.8, 0.75 + link.weight * 0.18)}" />`;
    })
    .join("");

  const serviceLines = clusters
    .flatMap((cluster) =>
      cluster.nodes.map(
        (node) =>
          `<line x1="${railWidth + cluster.center.x}" y1="${cluster.center.y}" x2="${railWidth + node.point.x}" y2="${node.point.y}" stroke="rgba(15,15,14,0.08)" stroke-width="0.85" />`
      )
    )
    .join("");

  const nodeDots = clusters
    .flatMap((cluster) =>
      cluster.nodes.map((node) => {
        const typeStyle = getTypeStyle(getDocTypeLabel(node.doc));
        const isActive = selectedDoc?.id === node.doc.id;
        return `
          <circle cx="${railWidth + node.point.x}" cy="${node.point.y}" r="${isActive ? 7.2 : 5.4}" fill="${typeStyle.accent}" stroke="${isActive ? "#ffffff" : "rgba(255,255,255,0.72)"}" stroke-width="${isActive ? 2.6 : 1.8}" />
          ${
            isActive
              ? `<g>
                  <rect x="${railWidth + node.point.x + 12}" y="${node.point.y - 16}" rx="12" ry="12" width="174" height="32" fill="#ffffff" stroke="${typeStyle.stroke}" />
                  <text x="${railWidth + node.point.x + 22}" y="${node.point.y - 1}" fill="${INK}" font-size="11" font-weight="700" font-family=${JSON.stringify(DISPLAY_FONT_FAMILY)}>${escapeXml(truncate(getNodeTitle(node.doc), 18))}</text>
                  <text x="${railWidth + node.point.x + 22}" y="${node.point.y + 11}" fill="rgba(23,23,23,0.45)" font-size="9" font-family=${JSON.stringify(BODY_FONT_FAMILY)}>${escapeXml(truncate(getDocTypeLabel(node.doc), 16))}</text>
                </g>`
              : ""
          }
        `;
      })
    )
    .join("");

  const hubs = clusters
    .map((cluster) => {
      const style = getCollectionStyle(cluster.docs);
      return `
        <g>
          <circle cx="${railWidth + cluster.center.x}" cy="${cluster.center.y}" r="${cluster.hubRadius + 5}" fill="${style.soft}" opacity="0.55" />
          <circle cx="${railWidth + cluster.center.x}" cy="${cluster.center.y}" r="${cluster.hubRadius}" fill="${PANEL_BG}" stroke="${style.stroke}" stroke-width="1.8" />
          <circle cx="${railWidth + cluster.center.x - cluster.hubRadius * 0.38}" cy="${cluster.center.y - cluster.hubRadius * 0.42}" r="4.2" fill="${style.accent}" />
          <text x="${railWidth + cluster.center.x}" y="${cluster.center.y + 6}" text-anchor="middle" fill="${INK}" font-size="20" font-weight="700" font-family=${JSON.stringify(DISPLAY_FONT_FAMILY)}>${cluster.docs.length}</text>
          <text x="${railWidth + cluster.center.x}" y="${cluster.center.y + cluster.hubRadius + 18}" text-anchor="middle" fill="${INK}" font-size="11" font-weight="700" font-family=${JSON.stringify(DISPLAY_FONT_FAMILY)}>${escapeXml(truncate(cluster.title, 12))}</text>
          <text x="${railWidth + cluster.center.x}" y="${cluster.center.y + cluster.hubRadius + 30}" text-anchor="middle" fill="rgba(15,15,14,0.42)" font-size="8.5" letter-spacing="2.1" font-family=${JSON.stringify(BODY_FONT_FAMILY)}>MAP NODE</text>
        </g>
      `;
    })
    .join("");

  const typeLegend = typeEntries
    .map(([label, count], index) => {
      const style = getTypeStyle(label);
      const y = 304 + index * 42;
      return `
        <circle cx="42" cy="${y}" r="8" fill="${style.soft}" stroke="${style.stroke}" />
        <circle cx="42" cy="${y}" r="4" fill="${style.accent}" />
        <text x="66" y="${y - 1}" fill="${INK}" font-size="12" font-weight="700" font-family=${JSON.stringify(BODY_FONT_FAMILY)}>${escapeXml(label)}</text>
        <text x="66" y="${y + 12}" fill="rgba(23,23,23,0.45)" font-size="10" letter-spacing="1.5" font-family=${JSON.stringify(BODY_FONT_FAMILY)}>${escapeXml(style.label.toUpperCase())}</text>
        <text x="${railWidth - 36}" y="${y + 4}" text-anchor="end" fill="rgba(23,23,23,0.58)" font-size="11" font-weight="700" font-family=${JSON.stringify(BODY_FONT_FAMILY)}>${count}</text>
      `;
    })
    .join("");

  const focusBlock = selectedDoc
    ? `
      <g transform="translate(28, ${Math.max(520, totalHeight - 196)})">
        <rect width="${railWidth - 56}" height="154" rx="18" ry="18" fill="${PANEL_BG}" stroke="${selectedStyle?.stroke ?? PANEL_BORDER_STRONG}" />
        <rect x="0" y="0" width="${railWidth - 56}" height="8" rx="18" ry="18" fill="${selectedStyle?.accent ?? ACCENT}" />
        <text x="24" y="26" fill="rgba(23,23,23,0.45)" font-size="10" letter-spacing="2.2" font-family=${JSON.stringify(BODY_FONT_FAMILY)}>${escapeXml(getServiceName(selectedDoc).toUpperCase())}</text>
        <text x="24" y="52" fill="${INK}" font-size="18" font-weight="700" font-family=${JSON.stringify(DISPLAY_FONT_FAMILY)}>${escapeXml(truncate(getNodeTitle(selectedDoc), 19))}</text>
        <text x="24" y="76" fill="rgba(23,23,23,0.68)" font-size="11" font-family=${JSON.stringify(BODY_FONT_FAMILY)}>${escapeXml(truncate(getNodeSummary(selectedDoc), 44))}</text>
        <text x="24" y="112" fill="rgba(23,23,23,0.62)" font-size="11" font-family=${JSON.stringify(BODY_FONT_FAMILY)}>TYPE ${escapeXml(getDocTypeLabel(selectedDoc))}</text>
        <text x="24" y="130" fill="rgba(23,23,23,0.62)" font-size="11" font-family=${JSON.stringify(BODY_FONT_FAMILY)}>STATE ${escapeXml(resolveProgressState(selectedDoc.meta))}</text>
        <text x="24" y="148" fill="rgba(23,23,23,0.62)" font-size="11" font-family=${JSON.stringify(BODY_FONT_FAMILY)}>D-DAY ${escapeXml(getDday(selectedDoc.meta) ?? "-")}</text>
      </g>
    `
    : "";

  const heatOverlay = heatSpots
    .map(
      (spot) => `
        <circle cx="${spot.center.x}" cy="${spot.center.y}" r="${spot.blurRadius}" fill="${spot.glowColor}" opacity="${spot.glowOpacity}" filter="url(#map-heat-blur)" />
        <circle cx="${spot.center.x}" cy="${spot.center.y}" r="${spot.radius}" fill="${spot.coreColor}" opacity="${spot.coreOpacity}" filter="url(#map-heat-soft)" />
      `
    )
    .join("");

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="${totalHeight}" viewBox="0 0 ${totalWidth} ${totalHeight}">
      <defs>
        <pattern id="graph-dots" width="22" height="22" patternUnits="userSpaceOnUse">
          <circle cx="1.2" cy="1.2" r="1" fill="rgba(0,0,0,0.08)" />
        </pattern>
        <linearGradient id="map-paper" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#fffdf8" />
          <stop offset="100%" stop-color="#f6f8fb" />
        </linearGradient>
        <filter id="map-heat-blur">
          <feGaussianBlur stdDeviation="30" />
        </filter>
        <filter id="map-heat-soft">
          <feGaussianBlur stdDeviation="14" />
        </filter>
      </defs>
      <rect width="${totalWidth}" height="${totalHeight}" fill="${GRAPH_PAPER}" />
      <rect width="${railWidth}" height="${totalHeight}" fill="${SIDE_PAPER}" />
      <line x1="${railWidth}" y1="0" x2="${railWidth}" y2="${totalHeight}" stroke="${PANEL_BORDER_STRONG}" />
      <g transform="translate(28, 28)">
        <line x1="0" y1="0" x2="${railWidth - 56}" y2="0" stroke="rgba(23,23,23,0.35)" stroke-dasharray="1 4" />
        <text x="0" y="30" fill="rgba(23,23,23,0.45)" font-size="12" letter-spacing="4" font-family=${JSON.stringify(DISPLAY_FONT_FAMILY)}>MODE 01</text>
        <text x="0" y="76" fill="${INK}" font-size="34" font-weight="700" font-family=${JSON.stringify(DISPLAY_FONT_FAMILY)}>RELATION MAP</text>
        <text x="0" y="102" fill="rgba(23,23,23,0.65)" font-size="13" font-family=${JSON.stringify(BODY_FONT_FAMILY)}>서비스 허브 기준의 운영용 관계도</text>
        <g transform="translate(0, 138)">
          <rect width="82" height="58" rx="14" fill="rgba(255,255,255,0.92)" stroke="${PANEL_BORDER_STRONG}" />
          <rect x="92" width="82" height="58" rx="14" fill="rgba(255,255,255,0.92)" stroke="${PANEL_BORDER_STRONG}" />
          <rect x="184" width="82" height="58" rx="14" fill="rgba(255,255,255,0.92)" stroke="${PANEL_BORDER_STRONG}" />
          <text x="41" y="20" text-anchor="middle" fill="rgba(23,23,23,0.45)" font-size="10" letter-spacing="2" font-family=${JSON.stringify(BODY_FONT_FAMILY)}>SERVICES</text>
          <text x="41" y="44" text-anchor="middle" fill="${INK}" font-size="23" font-weight="700" font-family=${JSON.stringify(DISPLAY_FONT_FAMILY)}>${clusters.length}</text>
          <text x="133" y="20" text-anchor="middle" fill="rgba(23,23,23,0.45)" font-size="10" letter-spacing="2" font-family=${JSON.stringify(BODY_FONT_FAMILY)}>DOCUMENTS</text>
          <text x="133" y="44" text-anchor="middle" fill="${INK}" font-size="23" font-weight="700" font-family=${JSON.stringify(DISPLAY_FONT_FAMILY)}>${clusters.reduce((total, cluster) => total + cluster.docs.length, 0)}</text>
          <text x="225" y="20" text-anchor="middle" fill="rgba(23,23,23,0.45)" font-size="10" letter-spacing="2" font-family=${JSON.stringify(BODY_FONT_FAMILY)}>LINKS</text>
          <text x="225" y="44" text-anchor="middle" fill="${INK}" font-size="23" font-weight="700" font-family=${JSON.stringify(DISPLAY_FONT_FAMILY)}>${serviceLinks.length + clusters.reduce((count, cluster) => count + cluster.docs.length, 0)}</text>
        </g>
        <text x="0" y="250" fill="${INK}" font-size="12" letter-spacing="3" font-family=${JSON.stringify(DISPLAY_FONT_FAMILY)}>DOC TYPES</text>
        ${typeLegend}
      </g>
      ${focusBlock}
      <g transform="translate(${railWidth}, 0)">
        <rect width="${canvasWidth}" height="${totalHeight}" fill="url(#map-paper)" />
        <rect width="${canvasWidth}" height="${totalHeight}" fill="url(#graph-dots)" opacity="0.82" />
        <rect width="${canvasWidth}" height="${totalHeight}" fill="rgba(255,255,255,0.34)" />
        ${heatOverlay}
        ${linkLines}
        ${serviceLines}
        ${hubs}
        ${nodeDots}
      </g>
    </svg>
  `;

  return { svg, width: totalWidth, height: totalHeight };
}

function buildExploreExportSvg({
  graph,
  selectedDoc,
  typeCounts,
}: {
  graph: ExploreGraph;
  selectedDoc: DocumentSummary | null;
  typeCounts: Record<string, number>;
}) {
  const railWidth = 320;
  const totalWidth = railWidth + graph.canvasWidth;
  const totalHeight = Math.max(graph.canvasHeight, 760);
  const typeEntries = Object.entries(typeCounts).sort((a, b) => b[1] - a[1]);
  const selectedStyle = selectedDoc ? getTypeStyle(getDocTypeLabel(selectedDoc)) : null;

  const links = graph.links
    .map((link) => {
      const from = graph.pointMap.get(link.from);
      const to = graph.pointMap.get(link.to);
      if (!from || !to) return "";

      if (link.kind === "service") {
        return `<line x1="${railWidth + from.x}" y1="${from.y}" x2="${railWidth + to.x}" y2="${to.y}" stroke="rgba(15,15,14,0.08)" stroke-width="0.9" stroke-dasharray="3 6" />`;
      }

      return `<line x1="${railWidth + from.x}" y1="${from.y}" x2="${to.x + railWidth}" y2="${to.y}" stroke="rgba(79,96,122,0.18)" stroke-width="${Math.min(1.7, 0.8 + link.weight * 0.12)}" />`;
    })
    .join("");

  const serviceFrames = graph.services
    .map((service) => {
      const style = getCollectionStyle(service.docs);
      const x = railWidth + service.point.x - service.frameWidth / 2;
      const y = service.point.y - service.frameHeight / 2;
      return `
        <g>
          <rect x="${x - 4}" y="${y - 4}" width="${service.frameWidth + 8}" height="${service.frameHeight + 8}" rx="18" ry="18" fill="${style.soft}" opacity="0.52" />
          <rect x="${x}" y="${y}" width="${service.frameWidth}" height="${service.frameHeight}" rx="14" ry="14" fill="${PANEL_BG}" stroke="${style.stroke}" />
          <circle cx="${railWidth + service.point.x - service.frameWidth / 2 + 13}" cy="${service.point.y - 12}" r="3.4" fill="${style.accent}" />
          <text x="${railWidth + service.point.x - service.frameWidth / 2 + 14}" y="${service.point.y - 2}" fill="${INK}" font-size="11" font-weight="700" font-family=${JSON.stringify(DISPLAY_FONT_FAMILY)}>${escapeXml(truncate(service.title, 16))}</text>
          <text x="${railWidth + service.point.x - service.frameWidth / 2 + 14}" y="${service.point.y + 11}" fill="rgba(15,15,14,0.42)" font-size="8.5" letter-spacing="1.6" font-family=${JSON.stringify(BODY_FONT_FAMILY)}>SERVICE ${service.docs.length}</text>
        </g>
      `;
    })
    .join("");

  const docDots = graph.docNodes
    .map((node) => {
      const typeStyle = getTypeStyle(getDocTypeLabel(node.doc));
      const isActive = selectedDoc?.id === node.doc.id;

      return `
        <circle cx="${railWidth + node.point.x}" cy="${node.point.y}" r="${isActive ? 7.2 : 4.8}" fill="${typeStyle.accent}" stroke="${isActive ? "#ffffff" : "rgba(255,255,255,0.75)"}" stroke-width="${isActive ? 2.4 : 1.4}" />
        ${
          isActive
            ? `<g>
                <rect x="${railWidth + node.point.x + 12}" y="${node.point.y - 17}" rx="11" ry="11" width="178" height="36" fill="#ffffff" stroke="${typeStyle.stroke}" />
                <text x="${railWidth + node.point.x + 22}" y="${node.point.y - 2}" fill="${INK}" font-size="11" font-weight="700" font-family=${JSON.stringify(DISPLAY_FONT_FAMILY)}>${escapeXml(truncate(getNodeTitle(node.doc), 19))}</text>
                <text x="${railWidth + node.point.x + 22}" y="${node.point.y + 12}" fill="rgba(23,23,23,0.42)" font-size="8.5" letter-spacing="1.4" font-family=${JSON.stringify(BODY_FONT_FAMILY)}>${escapeXml(truncate(getDocTypeLabel(node.doc), 16))}</text>
              </g>`
            : ""
        }
      `;
    })
    .join("");

  const typeLegend = typeEntries
    .map(([label, count], index) => {
      const style = getTypeStyle(label);
      const y = 304 + index * 42;
      return `
        <circle cx="42" cy="${y}" r="7.5" fill="${style.soft}" stroke="${style.stroke}" />
        <circle cx="42" cy="${y}" r="3.8" fill="${style.accent}" />
        <text x="66" y="${y - 1}" fill="${INK}" font-size="12" font-weight="700" font-family=${JSON.stringify(BODY_FONT_FAMILY)}>${escapeXml(label)}</text>
        <text x="66" y="${y + 12}" fill="rgba(23,23,23,0.45)" font-size="10" letter-spacing="1.4" font-family=${JSON.stringify(BODY_FONT_FAMILY)}>${escapeXml(style.label.toUpperCase())}</text>
        <text x="${railWidth - 36}" y="${y + 4}" text-anchor="end" fill="rgba(23,23,23,0.58)" font-size="11" font-weight="700" font-family=${JSON.stringify(BODY_FONT_FAMILY)}>${count}</text>
      `;
    })
    .join("");

  const focusBlock = selectedDoc
    ? `
      <g transform="translate(28, ${Math.max(520, totalHeight - 196)})">
        <rect width="${railWidth - 56}" height="154" rx="18" ry="18" fill="${PANEL_BG}" stroke="${selectedStyle?.stroke ?? PANEL_BORDER_STRONG}" />
        <rect x="0" y="0" width="${railWidth - 56}" height="8" rx="18" ry="18" fill="${selectedStyle?.accent ?? ACCENT}" />
        <text x="24" y="26" fill="rgba(23,23,23,0.45)" font-size="10" letter-spacing="2.2" font-family=${JSON.stringify(BODY_FONT_FAMILY)}>${escapeXml(getServiceName(selectedDoc).toUpperCase())}</text>
        <text x="24" y="52" fill="${INK}" font-size="18" font-weight="700" font-family=${JSON.stringify(DISPLAY_FONT_FAMILY)}>${escapeXml(truncate(getNodeTitle(selectedDoc), 19))}</text>
        <text x="24" y="76" fill="rgba(23,23,23,0.68)" font-size="11" font-family=${JSON.stringify(BODY_FONT_FAMILY)}>${escapeXml(truncate(getNodeSummary(selectedDoc), 44))}</text>
        <text x="24" y="112" fill="rgba(23,23,23,0.62)" font-size="11" font-family=${JSON.stringify(BODY_FONT_FAMILY)}>TYPE ${escapeXml(getDocTypeLabel(selectedDoc))}</text>
        <text x="24" y="130" fill="rgba(23,23,23,0.62)" font-size="11" font-family=${JSON.stringify(BODY_FONT_FAMILY)}>STATE ${escapeXml(resolveProgressState(selectedDoc.meta))}</text>
        <text x="24" y="148" fill="rgba(23,23,23,0.62)" font-size="11" font-family=${JSON.stringify(BODY_FONT_FAMILY)}>D-DAY ${escapeXml(getDday(selectedDoc.meta) ?? "-")}</text>
      </g>
    `
    : "";

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="${totalHeight}" viewBox="0 0 ${totalWidth} ${totalHeight}">
      <defs>
        <pattern id="explore-grid" width="28" height="28" patternUnits="userSpaceOnUse">
          <circle cx="1.1" cy="1.1" r="0.95" fill="rgba(0,0,0,0.08)" />
        </pattern>
        <linearGradient id="explore-paper" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#fffdf8" />
          <stop offset="100%" stop-color="#f5f7fa" />
        </linearGradient>
      </defs>
      <rect width="${totalWidth}" height="${totalHeight}" fill="${GRAPH_PAPER}" />
      <rect width="${railWidth}" height="${totalHeight}" fill="${SIDE_PAPER}" />
      <line x1="${railWidth}" y1="0" x2="${railWidth}" y2="${totalHeight}" stroke="${PANEL_BORDER_STRONG}" />
      <g transform="translate(28, 28)">
        <line x1="0" y1="0" x2="${railWidth - 56}" y2="0" stroke="rgba(23,23,23,0.35)" stroke-dasharray="1 4" />
        <text x="0" y="30" fill="rgba(23,23,23,0.45)" font-size="12" letter-spacing="4" font-family=${JSON.stringify(DISPLAY_FONT_FAMILY)}>MODE 02</text>
        <text x="0" y="76" fill="${INK}" font-size="34" font-weight="700" font-family=${JSON.stringify(DISPLAY_FONT_FAMILY)}>GRAPH EXPLORE</text>
        <text x="0" y="102" fill="rgba(23,23,23,0.65)" font-size="13" font-family=${JSON.stringify(BODY_FONT_FAMILY)}>Obsidian 감성의 탐색형 네트워크 뷰</text>
        <g transform="translate(0, 138)">
          <rect width="82" height="58" rx="14" fill="rgba(255,255,255,0.92)" stroke="${PANEL_BORDER_STRONG}" />
          <rect x="92" width="82" height="58" rx="14" fill="rgba(255,255,255,0.92)" stroke="${PANEL_BORDER_STRONG}" />
          <rect x="184" width="82" height="58" rx="14" fill="rgba(255,255,255,0.92)" stroke="${PANEL_BORDER_STRONG}" />
          <text x="41" y="20" text-anchor="middle" fill="rgba(23,23,23,0.45)" font-size="10" letter-spacing="2" font-family=${JSON.stringify(BODY_FONT_FAMILY)}>SERVICES</text>
          <text x="41" y="44" text-anchor="middle" fill="${INK}" font-size="23" font-weight="700" font-family=${JSON.stringify(DISPLAY_FONT_FAMILY)}>${graph.services.length}</text>
          <text x="133" y="20" text-anchor="middle" fill="rgba(23,23,23,0.45)" font-size="10" letter-spacing="2" font-family=${JSON.stringify(BODY_FONT_FAMILY)}>NOTES</text>
          <text x="133" y="44" text-anchor="middle" fill="${INK}" font-size="23" font-weight="700" font-family=${JSON.stringify(DISPLAY_FONT_FAMILY)}>${graph.docNodes.length}</text>
          <text x="225" y="20" text-anchor="middle" fill="rgba(23,23,23,0.45)" font-size="10" letter-spacing="2" font-family=${JSON.stringify(BODY_FONT_FAMILY)}>LINKS</text>
          <text x="225" y="44" text-anchor="middle" fill="${INK}" font-size="23" font-weight="700" font-family=${JSON.stringify(DISPLAY_FONT_FAMILY)}>${graph.linkCount}</text>
        </g>
        <text x="0" y="250" fill="${INK}" font-size="12" letter-spacing="3" font-family=${JSON.stringify(DISPLAY_FONT_FAMILY)}>DOC TYPES</text>
        ${typeLegend}
      </g>
      ${focusBlock}
      <g transform="translate(${railWidth}, 0)">
        <rect width="${graph.canvasWidth}" height="${totalHeight}" fill="url(#explore-paper)" />
        <rect width="${graph.canvasWidth}" height="${totalHeight}" fill="url(#explore-grid)" opacity="0.8" />
        <rect width="${graph.canvasWidth}" height="${totalHeight}" fill="rgba(255,255,255,0.3)" />
        ${links}
        ${serviceFrames}
        ${docDots}
      </g>
    </svg>
  `;

  return { svg, width: totalWidth, height: totalHeight };
}

export default function GraphView({
  docs,
  onOpenDoc,
}: {
  docs: DocumentSummary[];
  onOpenDoc: (doc: DocumentSummary) => void;
}) {
  const [graphMode, setGraphMode] = useState<GraphMode>("map");
  const [heatOverlayMode, setHeatOverlayMode] = useState<HeatOverlayMode>("volume");
  const [selected, setSelected] = useState<DocumentSummary | null>(null);
  const [selectedServices, setSelectedServices] = useState<string[]>([]);
  const [servicePickerOpen, setServicePickerOpen] = useState(false);
  const [serviceSearchQuery, setServiceSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [docTypeFilter, setDocTypeFilter] = useState<string>("all");
  const [zoom, setZoom] = useState(1);
  const [clusterOffsets, setClusterOffsets] = useState<ClusterOffsetMap>({});
  const [dragging, setDragging] = useState<DragState | null>(null);
  const [exporting, setExporting] = useState(false);
  const dragMovedRef = useRef(false);
  const servicePickerRef = useRef<HTMLDivElement | null>(null);

  const serviceOptions = useMemo(
    () =>
      Array.from(new Set(docs.map((doc) => getServiceName(doc)))).sort((a, b) =>
        a.localeCompare(b, "ko")
      ),
    [docs]
  );
  const normalizedServiceSearchQuery = serviceSearchQuery.trim().toLowerCase();
  const filteredServiceOptions = useMemo(
    () =>
      serviceOptions.filter(
        (service) =>
          !normalizedServiceSearchQuery || service.toLowerCase().includes(normalizedServiceSearchQuery)
      ),
    [serviceOptions, normalizedServiceSearchQuery]
  );
  const activeSelectedServices = useMemo(
    () => selectedServices.filter((service) => serviceOptions.includes(service)),
    [selectedServices, serviceOptions]
  );

  const serviceScopedDocs = useMemo(
    () =>
      docs.filter((doc) => {
        const serviceName = getServiceName(doc);
        return activeSelectedServices.length === 0 || activeSelectedServices.includes(serviceName);
      }),
    [docs, activeSelectedServices]
  );

  const categoryCounts = useMemo(
    () =>
      serviceScopedDocs.reduce<Record<string, number>>((acc, doc) => {
        const category = getDocCategory(doc);
        acc[category] = (acc[category] ?? 0) + 1;
        return acc;
      }, {}),
    [serviceScopedDocs]
  );
  const activeCategoryFilter =
    categoryFilter !== "all" && (categoryCounts[categoryFilter] ?? 0) > 0 ? categoryFilter : "all";

  const categoryScopedDocs = useMemo(
    () =>
      serviceScopedDocs.filter((doc) => {
        const category = getDocCategory(doc);
        return activeCategoryFilter === "all" || category === activeCategoryFilter;
      }),
    [serviceScopedDocs, activeCategoryFilter]
  );

  const docTypeOptions = useMemo(
    () => Array.from(new Set(categoryScopedDocs.map((doc) => getDocTypeLabel(doc)))).sort(compareTypeLabels),
    [categoryScopedDocs]
  );
  const activeDocTypeFilter =
    docTypeFilter !== "all" && docTypeOptions.some((option) => option === docTypeFilter)
      ? docTypeFilter
      : "all";

  const filteredDocs = useMemo(
    () =>
      categoryScopedDocs.filter((doc) => {
        const docType = getDocTypeLabel(doc);
        return activeDocTypeFilter === "all" || docType === activeDocTypeFilter;
      }),
    [categoryScopedDocs, activeDocTypeFilter]
  );

  const baseClusters = useMemo(() => buildServiceClusters(filteredDocs), [filteredDocs]);
  const clusters = useMemo(
    () => applyClusterOffsets(baseClusters, clusterOffsets),
    [baseClusters, clusterOffsets]
  );
  const heatSpots = useMemo(
    () => buildHeatSpots(clusters, graphMode === "map" ? heatOverlayMode : "off"),
    [clusters, graphMode, heatOverlayMode]
  );
  const serviceLinks = useMemo(() => buildServiceLinks(clusters), [clusters]);
  const exploreGraph = useMemo(() => buildExploreGraph(filteredDocs), [filteredDocs]);
  const selectedDoc =
    selected && filteredDocs.some((doc) => doc.id === selected.id) ? selected : null;

  const typeCounts = filteredDocs.reduce<Record<string, number>>((acc, doc) => {
    const label = getDocTypeLabel(doc);
    acc[label] = (acc[label] ?? 0) + 1;
    return acc;
  }, {});
  const categoryEntries = CATEGORY_ORDER
    .filter((category) => categoryCounts[category])
    .map((category) => ({ name: category, count: categoryCounts[category] }));

  const clusterMap = new Map(clusters.map((cluster) => [cluster.id, cluster]));
  const serviceEntries =
    graphMode === "map"
      ? clusters.map((cluster) => ({ name: cluster.title, count: cluster.docs.length }))
      : exploreGraph.services.map((service) => ({ name: service.title, count: service.docs.length }));
  const selectedServiceEntries = activeSelectedServices
    .map((serviceName) => serviceEntries.find((service) => service.name === serviceName))
    .filter((service): service is { name: string; count: number } => Boolean(service));
  const serviceCount = graphMode === "map" ? clusters.length : exploreGraph.services.length;
  const linkCount =
    graphMode === "map"
      ? serviceLinks.length + clusters.reduce((count, cluster) => count + cluster.docs.length, 0)
      : exploreGraph.linkCount;
  const canvasWidth =
    graphMode === "map"
      ? Math.max(980, ...clusters.flatMap((cluster) => [cluster.center.x + cluster.hubRadius + 190]))
      : exploreGraph.canvasWidth;
  const canvasHeight =
    graphMode === "map"
      ? Math.max(720, ...clusters.flatMap((cluster) => [cluster.center.y + cluster.hubRadius + 180]))
      : exploreGraph.canvasHeight;
  const selectedServiceSummary =
    selectedServiceEntries.length === 0
      ? `전체 서비스 ${serviceCount}`
      : selectedServiceEntries.length <= 2
        ? selectedServiceEntries.map((service) => service.name).join(" · ")
        : `${selectedServiceEntries
            .slice(0, 2)
            .map((service) => service.name)
            .join(", ")} +${selectedServiceEntries.length - 2}`;

  useEffect(() => {
    if (!dragging) return;

    const handlePointerMove = (event: PointerEvent) => {
      dragMovedRef.current = true;
      const deltaX = (event.clientX - dragging.startX) / zoom;
      const deltaY = (event.clientY - dragging.startY) / zoom;

      setClusterOffsets((prev) => ({
        ...prev,
        [dragging.clusterId]: {
          x: dragging.origin.x + deltaX,
          y: dragging.origin.y + deltaY,
        },
      }));
    };

    const handlePointerUp = () => {
      setDragging(null);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [dragging, zoom]);

  useEffect(() => {
    if (!servicePickerOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (!servicePickerRef.current?.contains(event.target as Node)) {
        setServicePickerOpen(false);
      }
    };

    window.addEventListener("pointerdown", handlePointerDown);
    return () => window.removeEventListener("pointerdown", handlePointerDown);
  }, [servicePickerOpen]);

  const handleClusterPointerDown = (
    clusterId: string,
    event: React.PointerEvent<HTMLButtonElement>
  ) => {
    if (event.button !== 0 || graphMode !== "map") return;
    dragMovedRef.current = false;
    const origin = clusterOffsets[clusterId] ?? { x: 0, y: 0 };
    setDragging({
      clusterId,
      startX: event.clientX,
      startY: event.clientY,
      origin,
    });
  };

  const handleClusterClick = (serviceName: string) => {
    const moved = dragMovedRef.current;
    dragMovedRef.current = false;
    if (moved) return;
    setSelectedServices((prev) =>
      prev.includes(serviceName) ? prev.filter((item) => item !== serviceName) : [...prev, serviceName]
    );
  };

  const toggleServiceSelection = (serviceName: string) => {
    setSelectedServices((prev) =>
      prev.includes(serviceName) ? prev.filter((item) => item !== serviceName) : [...prev, serviceName]
    );
  };

  const resetServiceSelection = () => {
    setSelectedServices([]);
    setServiceSearchQuery("");
    setServicePickerOpen(false);
  };

  const adjustZoom = (delta: number) => {
    setZoom((prev) => clampZoom(prev + delta));
  };

  const handleCanvasWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    if (!event.metaKey && !event.ctrlKey) return;
    event.preventDefault();
    setZoom((prev) => clampZoom(prev - event.deltaY * 0.0012));
  };

  const handleExportPng = async () => {
    try {
      setExporting(true);
      const { svg, width, height } =
        graphMode === "map"
          ? buildGraphExportSvg({
              clusters,
              serviceLinks,
              canvasWidth,
              canvasHeight,
              selectedDoc,
              typeCounts,
              heatSpots,
            })
          : buildExploreExportSvg({
              graph: exploreGraph,
              selectedDoc,
              typeCounts,
            });
      const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
      const url = URL.createObjectURL(blob);

      const image = await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = url;
      });

      const scale = 2;
      const canvas = document.createElement("canvas");
      canvas.width = width * scale;
      canvas.height = height * scale;
      const context = canvas.getContext("2d");

      if (!context) throw new Error("canvas-context-unavailable");

      context.scale(scale, scale);
      context.imageSmoothingEnabled = true;
      context.drawImage(image, 0, 0);
      URL.revokeObjectURL(url);

      const link = document.createElement("a");
      link.href = canvas.toDataURL("image/png");
      link.download = graphMode === "map" ? "docflow-relation-map.png" : "docflow-force-map.png";
      link.click();
    } catch {
      window.alert("PNG 내보내기에 실패했습니다.");
    } finally {
      setExporting(false);
    }
  };

  if (docs.length === 0) {
    return (
      <div
        className="flex h-full items-center justify-center"
        style={{ backgroundColor: SCREEN_GRAPH_PAPER, color: SCREEN_TEXT_SUBTLE, ...BODY_FONT }}
      >
        <div className="max-w-md px-8 text-center">
          <div className="mx-auto h-px w-48 border-t border-dotted" style={{ borderColor: PANEL_BORDER_STRONG }} />
          <p
            className="mt-8 text-[10px] uppercase tracking-[0.18em]"
            style={{ ...DISPLAY_FONT, color: SCREEN_TEXT_MUTED }}
          >
            DocFlow 관계도
          </p>
          <h3
            className="mt-3 text-[24px] font-semibold tracking-[0.01em]"
            style={{ ...DISPLAY_FONT, color: SCREEN_INK }}
          >
            관계 네트워크
          </h3>
          <p className="mt-4 text-[12px] leading-[1.7] tracking-[-0.01em]" style={{ color: SCREEN_TEXT_SUBTLE }}>
            문서를 등록하면 서비스 간 운영 관계를 한 화면에서 확인할 수 있습니다.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex h-full flex-col overflow-hidden lg:flex-row"
      style={{ backgroundColor: SCREEN_GRAPH_PAPER, color: SCREEN_INK, ...BODY_FONT }}
    >
      <aside
        className="max-h-[36vh] w-full shrink-0 overflow-y-auto border-b px-4 py-5 lg:max-h-none lg:w-[300px] lg:border-b-0 lg:border-r lg:px-5 lg:py-6"
        style={{ backgroundColor: SCREEN_SIDE_PAPER, borderColor: "var(--border-strong)" }}
      >
        <div className="border-t border-dotted pt-5" style={{ borderColor: "var(--border-strong)" }}>
          <p className="text-[10px] uppercase tracking-[0.18em]" style={{ ...DISPLAY_FONT, color: SCREEN_TEXT_MUTED }}>
            관계 뷰
          </p>
          <h2
            className="mt-3 text-[24px] font-semibold leading-none tracking-[0.01em]"
            style={{ ...DISPLAY_FONT, color: SCREEN_INK }}
          >
            {graphMode === "map" ? "서비스 노선도" : "포스 그래프"}
          </h2>
          <p className="mt-3 text-[12px] leading-[1.7] tracking-[-0.01em]" style={{ color: SCREEN_TEXT_SUBTLE }}>
            {graphMode === "map"
              ? "서비스를 공항 허브처럼 읽고, 문서를 얇은 노선으로 연결해 운영 흐름이 먼저 보이도록 정리했습니다."
              : "물리 시뮬레이션으로 문서 노드가 자유롭게 움직입니다. 드래그해서 노드를 이동하고 연관성을 탐색하세요."}
          </p>
        </div>

        <div
          className="mt-6 grid grid-cols-2 gap-2 rounded-[12px] border p-1.5"
          style={{
            borderColor: "var(--border-strong)",
            backgroundColor: "var(--bg)",
          }}
        >
          {[
            { value: "map", label: "관계도" },
            { value: "force", label: "포스" },
          ].map((mode) => {
            const active = graphMode === mode.value;
            return (
              <button
                key={mode.value}
                type="button"
                onClick={() => {
                  setDragging(null);
                  setGraphMode(mode.value as GraphMode);
                }}
                className="rounded-[10px] px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.14em] transition-colors"
                style={{
                  backgroundColor: active ? "var(--accent)" : "transparent",
                  color: active ? "#ffffff" : SCREEN_TEXT_SUBTLE,
                }}
              >
                {mode.label}
              </button>
            );
          })}
        </div>

        <div className="mt-7 grid grid-cols-3 gap-2 text-center">
          {[
            { label: "서비스", value: serviceCount },
            { label: graphMode === "map" ? "문서" : "노드", value: filteredDocs.length },
            { label: "연결", value: linkCount },
          ].map((item) => (
            <div
              key={item.label}
              className="rounded-[12px] border px-3 py-2.5"
              style={{
                borderColor: "var(--border)",
                backgroundColor: "var(--bg)",
                boxShadow: "0 10px 24px rgba(15, 15, 14, 0.04)",
              }}
            >
              <p className="text-[8.5px] uppercase tracking-[0.12em]" style={{ color: SCREEN_TEXT_MUTED }}>{item.label}</p>
              <p className="mt-2 text-[16px] font-semibold leading-none" style={{ ...DISPLAY_FONT, color: SCREEN_INK }}>
                {item.value}
              </p>
            </div>
          ))}
        </div>

        {graphMode === "map" && (
          <section className="mt-7 border-t border-dotted pt-5" style={{ borderColor: "var(--border)" }}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] uppercase tracking-[0.14em]" style={{ ...DISPLAY_FONT, color: SCREEN_INK }}>
                  히트 오버레이
                </p>
                <p className="mt-1 text-[10.5px] leading-[1.6]" style={{ color: SCREEN_TEXT_SUBTLE }}>
                  문서 밀도나 리스크가 몰린 허브를 배경 잉크 농도로 읽습니다.
                </p>
              </div>
            </div>
            <div
              className="mt-3 grid grid-cols-3 gap-2 rounded-[12px] border p-1.5"
              style={{ borderColor: "var(--border-strong)", backgroundColor: "var(--bg)" }}
            >
              {([
                { value: "off", label: "끔" },
                { value: "volume", label: "문서량" },
                { value: "risk", label: "리스크" },
              ] as const).map((option) => {
                const active = heatOverlayMode === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setHeatOverlayMode(option.value)}
                    className="rounded-[10px] px-2.5 py-2 text-[9.5px] font-semibold uppercase tracking-[0.12em] transition-colors"
                    style={{
                      backgroundColor: active ? "var(--accent)" : "transparent",
                      color: active ? "#ffffff" : SCREEN_TEXT_SUBTLE,
                    }}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </section>
        )}

        <section className="mt-8 border-t border-dotted pt-5" style={{ borderColor: "var(--border)" }}>
          <p className="text-[11px] uppercase tracking-[0.14em]" style={{ ...DISPLAY_FONT, color: SCREEN_INK }}>
            필터
          </p>
          <div className="mt-4 space-y-3">
            <div ref={servicePickerRef} className="relative">
              <p className="text-[9.5px] uppercase tracking-[0.12em]" style={{ color: SCREEN_TEXT_MUTED }}>서비스</p>
              <button
                type="button"
                onClick={() => setServicePickerOpen((prev) => !prev)}
                className="mt-2 flex w-full items-center justify-between gap-3 rounded-[12px] border px-3 py-2.5 text-left text-[11px] font-medium tracking-[0.01em] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                style={{
                  borderColor: "var(--border-strong)",
                  backgroundColor: "var(--bg)",
                  color: SCREEN_INK,
                }}
              >
                <div className="min-w-0">
                  <p className="truncate">{selectedServiceSummary}</p>
                  <p className="mt-1 text-[9.5px]" style={{ color: SCREEN_TEXT_MUTED }}>
                    {activeSelectedServices.length === 0
                      ? "모든 서비스가 포함됩니다"
                      : `${activeSelectedServices.length}개 서비스가 선택됨`}
                  </p>
                </div>
                <svg
                  aria-hidden="true"
                  className={`h-4 w-4 shrink-0 transition-transform ${servicePickerOpen ? "rotate-180" : ""}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {servicePickerOpen && (
                <div
                  className="absolute left-0 right-0 top-[calc(100%+8px)] z-20 rounded-[14px] border p-3 shadow-[var(--shadow-soft)]"
                  style={{
                    borderColor: "var(--border-strong)",
                    backgroundColor: "var(--bg)",
                  }}
                >
                  <div className="flex items-center gap-2">
                    <input
                      type="search"
                      value={serviceSearchQuery}
                      onChange={(event) => setServiceSearchQuery(event.target.value)}
                      placeholder="서비스 검색"
                      className="min-w-0 flex-1 rounded-[10px] border px-3 py-2 text-[11px] tracking-[0.01em] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                      style={{
                        borderColor: "var(--border)",
                        backgroundColor: "var(--bg-subtle)",
                        color: SCREEN_INK,
                      }}
                    />
                    <button
                      type="button"
                      onClick={resetServiceSelection}
                      className="rounded-[10px] border px-3 py-2 text-[10px] font-semibold tracking-[0.01em] transition-colors"
                      style={{
                        borderColor: "var(--border)",
                        backgroundColor: "var(--bg)",
                        color: SCREEN_TEXT_SUBTLE,
                      }}
                    >
                      전체
                    </button>
                  </div>
                  <div className="mt-3 max-h-[220px] space-y-1 overflow-y-auto pr-1">
                    {filteredServiceOptions.length === 0 ? (
                      <p className="rounded-[10px] px-3 py-3 text-[10.5px]" style={{ color: SCREEN_TEXT_MUTED }}>
                        검색 결과가 없습니다.
                      </p>
                    ) : (
                      filteredServiceOptions.map((service) => {
                        const checked = activeSelectedServices.includes(service);
                        const serviceCountForOption =
                          docs.filter((doc) => getServiceName(doc) === service).length;

                        return (
                          <label
                            key={service}
                            className="flex cursor-pointer items-center gap-3 rounded-[10px] border px-3 py-2 text-[11px] tracking-[0.01em] transition-colors"
                            style={{
                              borderColor: checked ? "var(--accent)" : "var(--border)",
                              backgroundColor: checked ? "color-mix(in srgb, var(--accent) 7%, var(--bg))" : "var(--bg)",
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleServiceSelection(service)}
                              className="h-4 w-4 rounded border-[var(--border-strong)] text-[var(--accent)] focus:ring-[var(--accent)]"
                            />
                            <span className="min-w-0 flex-1 truncate" style={{ color: SCREEN_INK }}>
                              {service}
                            </span>
                            <span className="shrink-0 text-[9.5px] uppercase tracking-[0.12em]" style={{ color: SCREEN_TEXT_MUTED }}>
                              {serviceCountForOption}
                            </span>
                          </label>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </div>

            <div>
              <p className="text-[9.5px] uppercase tracking-[0.12em]" style={{ color: SCREEN_TEXT_MUTED }}>카테고리</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setCategoryFilter("all");
                    setDocTypeFilter("all");
                  }}
                  className="rounded-[10px] border px-3 py-1.5 text-[11px] font-semibold transition-colors"
                  style={{
                    borderColor: "var(--border-strong)",
                    backgroundColor: activeCategoryFilter === "all" ? "var(--text)" : "var(--bg)",
                    color: activeCategoryFilter === "all" ? "#ffffff" : SCREEN_TEXT_SUBTLE,
                  }}
                >
                  전체 {serviceScopedDocs.length}
                </button>
                {categoryEntries.map(({ name, count }) => {
                  const style = CATEGORY_STYLES[name];
                  return (
                    <button
                      key={name}
                      type="button"
                      onClick={() => {
                        setCategoryFilter(name);
                        setDocTypeFilter("all");
                      }}
                      className="rounded-[10px] border px-3 py-1.5 text-[11px] font-semibold transition-colors"
                      style={{
                        borderColor: style.stroke,
                        backgroundColor: activeCategoryFilter === name ? style.accent : style.soft,
                        color: activeCategoryFilter === name ? "#ffffff" : style.accent,
                      }}
                    >
                      {name} {count}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between gap-2">
                <p className="text-[10px] uppercase tracking-[0.14em]" style={{ color: SCREEN_TEXT_MUTED }}>세부 유형</p>
                {(activeCategoryFilter !== "all" || activeDocTypeFilter !== "all") && (
                  <button
                    type="button"
                    onClick={() => {
                      setCategoryFilter("all");
                      setDocTypeFilter("all");
                    }}
                    className="rounded-[8px] px-2 py-1 text-[10px] font-semibold transition-colors"
                    style={{ color: SCREEN_TEXT_MUTED }}
                  >
                    초기화
                  </button>
                )}
              </div>
              <select
                value={activeDocTypeFilter}
                onChange={(event) => setDocTypeFilter(event.target.value)}
                className="mt-2 w-full rounded-[12px] border px-3 py-2.5 text-[12px] font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                style={{
                  borderColor: "var(--border-strong)",
                  backgroundColor: "var(--bg)",
                  color: SCREEN_INK,
                }}
              >
                <option value="all">세부 유형 전체 {categoryScopedDocs.length}</option>
                {docTypeOptions.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </div>

            {(activeSelectedServices.length > 0 || activeCategoryFilter !== "all" || activeDocTypeFilter !== "all") && (
              <button
                type="button"
                onClick={() => {
                  resetServiceSelection();
                  setCategoryFilter("all");
                  setDocTypeFilter("all");
                }}
                className="rounded-[10px] border px-3 py-1.5 text-[11px] font-semibold transition-colors"
                style={{ borderColor: "var(--border-strong)", color: SCREEN_TEXT_SUBTLE, backgroundColor: "var(--bg)" }}
              >
                필터 초기화
              </button>
            )}
          </div>
        </section>

        <section className="mt-7 border-t border-dotted pt-5" style={{ borderColor: "var(--border)" }}>
          <p className="text-[12px] uppercase tracking-[0.18em]" style={{ ...DISPLAY_FONT, color: SCREEN_INK }}>
            카테고리 분포
          </p>
          <div className="mt-4 space-y-2">
            {categoryEntries.map(({ name, count }) => {
                const style = CATEGORY_STYLES[name];
                return (
                  <div key={name} className="flex items-center justify-between gap-3 rounded-[12px] border px-3 py-2 text-[13px]" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg)" }}>
                    <div className="flex items-center gap-2.5">
                      <span
                        className="inline-flex h-6 w-6 items-center justify-center rounded-full border text-[11px] font-semibold"
                        style={{
                          borderColor: style.stroke,
                          backgroundColor: style.soft,
                          color: style.accent,
                        }}
                      >
                        ●
                      </span>
                      <div>
                        <p className="font-semibold" style={{ color: SCREEN_INK }}>{name}</p>
                        <p className="text-[10px] uppercase tracking-[0.12em]" style={{ color: SCREEN_TEXT_MUTED }}>
                          {style.label}
                        </p>
                      </div>
                    </div>
                    <span className="text-[12px] font-semibold" style={{ color: SCREEN_TEXT_SUBTLE }}>{count}</span>
                  </div>
                );
              })}
          </div>
        </section>

        <section className="mt-7 border-t border-dotted pt-5" style={{ borderColor: "var(--border)" }}>
          <p className="text-[12px] uppercase tracking-[0.18em]" style={{ ...DISPLAY_FONT, color: SCREEN_INK }}>
            서비스 포커스
          </p>
          <div className="mt-4 space-y-3">
            <div
              className="rounded-[14px] border px-3 py-3"
              style={{
                borderColor: "var(--border)",
                backgroundColor: "var(--bg)",
                boxShadow: "0 10px 24px rgba(15, 15, 14, 0.04)",
              }}
            >
              {selectedServiceEntries.length > 0 ? (
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[9px] uppercase tracking-[0.16em]" style={{ color: SCREEN_TEXT_MUTED }}>
                        현재 선택
                      </p>
                      <p className="mt-1 text-[14px] font-semibold" style={{ ...DISPLAY_FONT, color: SCREEN_INK }}>
                        {selectedServiceSummary}
                      </p>
                    </div>
                    <span
                      className="shrink-0 rounded-[10px] border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em]"
                      style={{
                        borderColor: "var(--border)",
                        backgroundColor: "var(--bg-subtle)",
                        color: SCREEN_TEXT_SUBTLE,
                      }}
                    >
                      {selectedServiceEntries.length}개
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedServiceEntries.slice(0, 6).map((service) => (
                      <button
                        key={service.name}
                        type="button"
                        onClick={() => toggleServiceSelection(service.name)}
                        className="rounded-[10px] border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] transition-colors"
                        style={{
                          borderColor: "var(--border)",
                          backgroundColor: "var(--bg-subtle)",
                          color: SCREEN_TEXT_SUBTLE,
                        }}
                      >
                        {service.name}
                      </button>
                    ))}
                    {selectedServiceEntries.length > 6 && (
                      <span
                        className="rounded-[10px] border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em]"
                        style={{
                          borderColor: "var(--border)",
                          backgroundColor: "var(--bg-subtle)",
                          color: SCREEN_TEXT_MUTED,
                        }}
                      >
                        +{selectedServiceEntries.length - 6}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] leading-5" style={{ color: SCREEN_TEXT_SUBTLE }}>
                    {graphMode === "map"
                      ? "선택한 서비스 허브를 함께 띄워 노선 흐름과 문서 분기를 비교합니다."
                      : "선택한 서비스에 묶인 문서를 포스 그래프에서 비교합니다."}
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-[9px] uppercase tracking-[0.16em]" style={{ color: SCREEN_TEXT_MUTED }}>
                    전체 보기
                  </p>
                  <p className="text-[13px] leading-5" style={{ color: SCREEN_TEXT_SUBTLE }}>
                    현재 {serviceCount}개 서비스를 한 번에 보고 있습니다. 서비스가 많아져도 드롭다운으로 바로 좁혀볼 수 있습니다.
                  </p>
                </div>
              )}
            </div>
          </div>
        </section>

        <section className="mt-7 border-t border-dotted pt-5" style={{ borderColor: "var(--border)" }}>
          <p className="text-[12px] uppercase tracking-[0.18em]" style={{ ...DISPLAY_FONT, color: SCREEN_INK }}>
            선택 문서
          </p>
          {selectedDoc ? (
            <div
              className="mt-4 rounded-[18px] border p-4"
              style={{
                borderColor: "var(--border-strong)",
                backgroundColor: "var(--bg)",
                boxShadow: SOFT_SHADOW,
              }}
            >
              <p className="text-[10px] uppercase tracking-[0.16em]" style={{ color: SCREEN_TEXT_MUTED }}>
                {`${getDocCategory(selectedDoc)} · ${getDocTypeLabel(selectedDoc)}`}
              </p>
              <h4 className="mt-2 text-[18px] leading-[1.1]" style={{ ...DISPLAY_FONT, color: SCREEN_INK }}>
                {truncate(getNodeTitle(selectedDoc), 24)}
              </h4>
              <p className="mt-2 text-[13px] leading-5" style={{ color: SCREEN_TEXT_SUBTLE }}>
                {getNodeSummary(selectedDoc)}
              </p>
              <div className="mt-4 grid grid-cols-2 gap-2 text-[11px]" style={{ color: SCREEN_TEXT_SUBTLE }}>
                <div className="rounded-[12px] border px-3 py-2" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-subtle)" }}>
                  <p className="text-[9px] uppercase tracking-[0.14em] text-[var(--text-muted)]">서비스</p>
                  <p className="mt-1 font-medium text-[var(--text)]">{getServiceName(selectedDoc)}</p>
                </div>
                <div className="rounded-[12px] border px-3 py-2" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-subtle)" }}>
                  <p className="text-[9px] uppercase tracking-[0.14em] text-[var(--text-muted)]">진행</p>
                  <p className="mt-1 font-medium text-[var(--text)]">{resolveProgressState(selectedDoc.meta)}</p>
                </div>
                <div className="rounded-[12px] border px-3 py-2" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-subtle)" }}>
                  <p className="text-[9px] uppercase tracking-[0.14em] text-[var(--text-muted)]">일정</p>
                  <p className="mt-1 font-medium text-[var(--text)]">{resolveScheduleSummary(selectedDoc.meta)}</p>
                </div>
                <div className="rounded-[12px] border px-3 py-2" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-subtle)" }}>
                  <p className="text-[9px] uppercase tracking-[0.14em] text-[var(--text-muted)]">D-day</p>
                  <p className="mt-1 font-medium text-[var(--text)]">{getDday(selectedDoc.meta) ?? "-"}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => onOpenDoc(selectedDoc)}
                className="mt-4 rounded-[10px] px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-white"
                style={{ backgroundColor: ACCENT }}
              >
                문서 열기
              </button>
            </div>
          ) : (
            <p className="mt-4 text-[13px] leading-6" style={{ color: SCREEN_TEXT_SUBTLE }}>
              {graphMode === "map"
                ? "오른쪽 노드를 올리거나 선택하면 이 영역에 문서 요약과 일정 정보가 표시됩니다."
                : "포스 그래프에서 노드를 선택하면 문서 요약과 일정 정보가 표시됩니다."}
            </p>
          )}
        </section>
      </aside>

      <div className="relative min-h-0 min-w-0 flex-1 overflow-hidden" style={{ backgroundColor: SCREEN_CANVAS_PAPER }}>
        <div className="absolute right-3 top-3 z-20 flex max-w-[calc(100%-24px)] flex-wrap items-center justify-end gap-2 lg:right-6 lg:top-6 lg:max-w-none">
          <div
            className="flex items-center gap-1 rounded-[12px] border px-2 py-1"
            style={{
              borderColor: "var(--border-strong)",
              backgroundColor: "var(--bg)",
              boxShadow: "0 10px 24px rgba(15, 15, 14, 0.05)",
            }}
          >
            <button
              type="button"
              onClick={() => adjustZoom(-0.1)}
              className="rounded-[8px] px-2.5 py-1 text-[13px] font-semibold hover:bg-[var(--bg-subtle)]"
              style={{ color: SCREEN_TEXT_SUBTLE }}
            >
              −
            </button>
            <span className="min-w-[56px] text-center text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: SCREEN_TEXT_MUTED }}>
              {Math.round(zoom * 100)}%
            </span>
            <button
              type="button"
              onClick={() => adjustZoom(0.1)}
              className="rounded-[8px] px-2.5 py-1 text-[13px] font-semibold hover:bg-[var(--bg-subtle)]"
              style={{ color: SCREEN_TEXT_SUBTLE }}
            >
              +
            </button>
          </div>
            <button
              type="button"
              onClick={() => setZoom(1)}
            className="rounded-[12px] border px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.18em]"
            style={{
              borderColor: "var(--border-strong)",
              backgroundColor: "var(--bg)",
              color: SCREEN_TEXT_SUBTLE,
            }}
            >
            초기화
          </button>
          <button
            type="button"
            onClick={handleExportPng}
            disabled={exporting}
            className="rounded-[12px] px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-white disabled:opacity-60"
            style={{ backgroundColor: ACCENT }}
          >
            {exporting ? "내보내는 중" : "PNG 저장"}
          </button>
        </div>

        {graphMode === "force" ? (
          <div className="h-full p-4">
            <ForceGraph docs={filteredDocs} onOpenDoc={onOpenDoc} />
          </div>
        ) : filteredDocs.length === 0 ? (
          <div className="flex h-full items-center justify-center px-10 text-center" style={{ color: SCREEN_TEXT_SUBTLE }}>
            <div>
              <p className="text-[12px] uppercase tracking-[0.2em]" style={{ ...DISPLAY_FONT, color: SCREEN_TEXT_MUTED }}>
                결과 없음
              </p>
              <p className="mt-3 text-[13px] leading-6">
                현재 필터와 맞는 문서가 없습니다. 서비스나 타입 필터를 다시 선택해보세요.
              </p>
            </div>
          </div>
        ) : (
          <div className="h-full overflow-auto" onWheel={handleCanvasWheel}>
            <div
              className="relative min-h-[58vh] lg:min-h-full"
              style={{
                width: Math.max(980, canvasWidth * zoom + 80),
                height: Math.max(720, canvasHeight * zoom + 80),
              }}
            >
              <div
                className="absolute left-8 top-8"
                style={{
                  transform: `scale(${Math.max(0.9, Math.min(1, zoom))})`,
                  transformOrigin: "0 0",
                  color: SCREEN_TEXT_MUTED,
                }}
              >
                <p className="text-[11px] uppercase tracking-[0.22em]" style={{ ...DISPLAY_FONT, color: SCREEN_TEXT_SUBTLE }}>
                  {graphMode === "map" ? "DocFlow Route Atlas" : "DocFlow Force Map"}
                </p>
                <p className="mt-1.5 text-[10px] uppercase tracking-[0.16em]" style={{ color: SCREEN_TEXT_MUTED }}>
                  {graphMode === "map"
                    ? "서비스 허브는 드래그로 재배치, 노선은 흐름만 조용하게 강조"
                    : "문서 노드가 물리 기반으로 흩어져 연관성을 직관적으로 보여줍니다"}
                </p>
              </div>

              <div
                className="relative origin-top-left"
                style={{
                  width: canvasWidth,
                  height: canvasHeight,
                  transform: `scale(${zoom})`,
                  transformOrigin: "0 0",
                  backgroundColor: SCREEN_CANVAS_PAPER,
                  backgroundImage:
                    graphMode === "map"
                      ? `radial-gradient(circle at 1px 1px, ${SCREEN_GRID_DOT} 1px, transparent 0)`
                      : `radial-gradient(circle at 1px 1px, ${SCREEN_GRID_DOT} 0.9px, transparent 0)`,
                  backgroundSize: graphMode === "map" ? "24px 24px" : "28px 28px",
                }}
              >
                <div
                  className="pointer-events-none absolute inset-0 opacity-45"
                  style={{
                    background:
                      graphMode === "map"
                        ? SCREEN_CANVAS_MAP_WASH
                        : SCREEN_CANVAS_EXPLORE_WASH,
                  }}
                />

                {graphMode === "map" ? (
                  <>
                    {heatOverlayMode !== "off" && (
                      <svg className="pointer-events-none absolute inset-0 h-full w-full">
                        <defs>
                          <filter id="map-heat-blur-screen">
                            <feGaussianBlur stdDeviation="30" />
                          </filter>
                          <filter id="map-heat-soft-screen">
                            <feGaussianBlur stdDeviation="15" />
                          </filter>
                        </defs>
                        {heatSpots.map((spot) => (
                          <g key={spot.id}>
                            <circle
                              cx={spot.center.x}
                              cy={spot.center.y}
                              r={spot.blurRadius}
                              fill={spot.glowColor}
                              opacity={spot.glowOpacity}
                              filter="url(#map-heat-blur-screen)"
                            />
                            <circle
                              cx={spot.center.x}
                              cy={spot.center.y}
                              r={spot.radius}
                              fill={spot.coreColor}
                              opacity={spot.coreOpacity}
                              filter="url(#map-heat-soft-screen)"
                            />
                          </g>
                        ))}
                      </svg>
                    )}

                    <svg className="absolute inset-0 h-full w-full">
                      {serviceLinks.map((link, index) => {
                        const from = clusterMap.get(link.from);
                        const to = clusterMap.get(link.to);
                        if (!from || !to) return null;
                        const midpoint = getRouteMidpoint(from.center, to.center);

                        return (
                          <g key={`${link.from}-${link.to}`}>
                            <path
                              d={buildRoutePath(from.center, to.center, index)}
                              fill="none"
                              stroke={SCREEN_ROUTE_PRIMARY}
                              strokeWidth={Math.min(2.1, 0.95 + link.weight * 0.22)}
                              strokeLinecap="round"
                            />
                            <circle
                              cx={midpoint.x}
                              cy={midpoint.y}
                              r={2.4}
                              fill="var(--bg)"
                              stroke={SCREEN_ROUTE_PRIMARY}
                              strokeWidth={1}
                            />
                          </g>
                        );
                      })}

                      {clusters.flatMap((cluster, clusterIndex) =>
                        cluster.nodes.map((node, nodeIndex) => {
                          const isActive = selectedDoc?.id === node.doc.id;

                          return (
                            <path
                              key={`${cluster.id}-${node.doc.id}`}
                              d={buildRoutePath(cluster.center, node.point, clusterIndex + nodeIndex)}
                              fill="none"
                              stroke={isActive ? SCREEN_ROUTE_PRIMARY : SCREEN_ROUTE_SOFT}
                              strokeWidth={isActive ? 1.65 : 1.05}
                              strokeDasharray={isActive ? undefined : "4 10"}
                              strokeLinecap="round"
                            />
                          );
                        })
                      )}
                    </svg>

                    {clusters.map((cluster) => {
                      const clusterStyle = getCollectionStyle(cluster.docs);
                      const isServiceActive = activeSelectedServices.includes(cluster.title);
                      const typeLabel = truncate(cluster.docTypes.join(" · "), 20) || "문서 군집";

                      return (
                        <button
                          key={cluster.id}
                          type="button"
                          onPointerDown={(event) => handleClusterPointerDown(cluster.id, event)}
                          onClick={() => handleClusterClick(cluster.title)}
                          className="absolute -translate-x-1/2 -translate-y-1/2 text-left"
                          style={{
                            left: cluster.center.x,
                            top: cluster.center.y,
                            cursor: dragging?.clusterId === cluster.id ? "grabbing" : "grab",
                          }}
                        >
                          <div
                            className="relative w-[164px] rounded-[22px] border px-4 py-4 transition-transform hover:-translate-y-0.5"
                            style={{
                              borderColor: isServiceActive ? clusterStyle.accent : clusterStyle.stroke,
                              backgroundColor: "color-mix(in srgb, var(--bg) 96%, transparent)",
                              boxShadow: isServiceActive
                                ? `0 0 0 4px ${clusterStyle.soft}, 0 20px 36px color-mix(in srgb, var(--text) 12%, transparent)`
                                : `0 0 0 4px ${clusterStyle.soft}, 0 14px 30px rgba(15,15,14,0.08)`,
                            }}
                          >
                            <span
                              className="absolute inset-x-4 top-0 h-[4px] rounded-b-full"
                              style={{
                                backgroundColor: clusterStyle.accent,
                              }}
                            />
                            <div className="flex items-start justify-between gap-3">
                              <span
                                className="inline-flex rounded-[10px] border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em]"
                                style={{
                                  borderColor: clusterStyle.stroke,
                                  backgroundColor: clusterStyle.soft,
                                  color: clusterStyle.accent,
                                  ...DISPLAY_FONT,
                                }}
                              >
                                {getServiceCode(cluster.title)}
                              </span>
                              <div className="text-right">
                                <p className="text-[9px] uppercase tracking-[0.14em] text-[var(--text-muted)]">docs</p>
                                <p className="mt-1 text-[16px] font-semibold leading-none" style={{ ...DISPLAY_FONT, color: SCREEN_INK }}>
                                  {cluster.docs.length}
                                </p>
                              </div>
                            </div>
                            <p className="mt-3 text-[16px] font-semibold leading-[1.15]" style={{ ...DISPLAY_FONT, color: SCREEN_INK }}>
                              {truncate(cluster.title, 18)}
                            </p>
                            <p className="mt-2 text-[10px] uppercase tracking-[0.12em]" style={{ color: SCREEN_TEXT_SUBTLE }}>
                              {typeLabel}
                            </p>
                            <div className="mt-3 flex items-center justify-between gap-3 text-[10px] uppercase tracking-[0.12em]">
                              <span style={{ color: SCREEN_TEXT_MUTED }}>Route hub</span>
                              <span style={{ color: clusterStyle.accent }}>{cluster.nodes.length} branches</span>
                            </div>
                          </div>
                        </button>
                      );
                    })}

                    {clusters.flatMap((cluster) =>
                      cluster.nodes.map((node) => {
                        const typeLabel = getDocTypeLabel(node.doc);
                        const typeStyle = getTypeStyle(typeLabel);
                        const isActive = selectedDoc?.id === node.doc.id;

                        return (
                          <button
                            key={node.doc.id}
                            type="button"
                            onMouseEnter={() => setSelected(node.doc)}
                            onFocus={() => setSelected(node.doc)}
                            onClick={() => onOpenDoc(node.doc)}
                          className="absolute -translate-x-1/2 -translate-y-1/2"
                          style={{ left: node.point.x, top: node.point.y }}
                        >
                          <div className="relative flex items-center gap-2">
                            <span
                              className="relative flex h-[18px] w-[18px] items-center justify-center rounded-full border transition-transform"
                              style={{
                                borderColor: isActive ? typeStyle.accent : SCREEN_NODE_BORDER,
                                backgroundColor: "var(--bg)",
                                boxShadow: isActive
                                  ? `0 0 0 4px ${typeStyle.soft}, 0 14px 26px color-mix(in srgb, var(--text) 14%, transparent)`
                                  : `0 0 0 3px color-mix(in srgb, ${typeStyle.soft} 88%, transparent)`,
                                transform: isActive ? "scale(1.06)" : "scale(1)",
                              }}
                            >
                              <span
                                className="rounded-full"
                                style={{
                                  width: isActive ? 8 : 6,
                                  height: isActive ? 8 : 6,
                                  backgroundColor: typeStyle.accent,
                                }}
                              />
                            </span>
                              {isActive && (
                                <span
                                  className="w-[176px] rounded-[14px] border px-3 py-2 text-left"
                                  style={{
                                    borderColor: typeStyle.stroke,
                                    backgroundColor: "var(--bg)",
                                    color: SCREEN_INK,
                                    boxShadow: `0 16px 28px ${typeStyle.soft}`,
                                  }}
                                >
                                  <span className="block text-[8px] uppercase tracking-[0.16em] text-[var(--text-muted)]">
                                    {typeLabel}
                                  </span>
                                  <span
                                    className="mt-1 block text-[11px] font-semibold leading-[1.25]"
                                    style={{ ...DISPLAY_FONT }}
                                  >
                                    {truncate(getNodeTitle(node.doc), 28)}
                                  </span>
                                </span>
                              )}
                            </div>
                          </button>
                        );
                      })
                    )}
                  </>
                ) : (
                  <>
                    <svg className="absolute inset-0 h-full w-full">
                      {exploreGraph.links.map((link, index) => {
                        const from = exploreGraph.pointMap.get(link.from);
                        const to = exploreGraph.pointMap.get(link.to);
                        if (!from || !to) return null;

                        return (
                          <path
                            key={`${link.kind}-${link.from}-${link.to}`}
                            d={buildRoutePath(from, to, index)}
                            fill="none"
                            stroke={
                              link.kind === "service" ? SCREEN_ROUTE_SOFT : SCREEN_ROUTE_PRIMARY
                            }
                            strokeWidth={link.kind === "service" ? 1 : Math.min(1.8, 0.95 + link.weight * 0.14)}
                            strokeDasharray={link.kind === "service" ? "4 9" : undefined}
                            strokeLinecap="round"
                          />
                        );
                      })}
                    </svg>

                    {exploreGraph.services.map((service) => {
                      const serviceStyle = getCollectionStyle(service.docs);

                      return (
                        <button
                          key={service.id}
                          type="button"
                          onClick={() => handleClusterClick(service.title)}
                          className="absolute -translate-x-1/2 -translate-y-1/2"
                          style={{ left: service.point.x, top: service.point.y }}
                        >
                          <div
                            className="rounded-[14px] border px-3 py-2 text-left transition-transform hover:translate-y-[-1px]"
                            style={{
                              width: service.frameWidth,
                              minHeight: service.frameHeight,
                              borderColor:
                                activeSelectedServices.includes(service.title)
                                  ? serviceStyle.accent
                                  : serviceStyle.stroke,
                              backgroundColor: "color-mix(in srgb, var(--bg) 96%, transparent)",
                              boxShadow: `0 0 0 5px ${serviceStyle.soft}, 0 14px 24px rgba(15,15,14,0.07)`,
                            }}
                          >
                            <div className="flex items-center justify-between gap-3">
                              <p
                                className="truncate text-[11px] font-semibold uppercase tracking-[0.05em]"
                                style={{ ...DISPLAY_FONT, color: SCREEN_INK }}
                              >
                                {getServiceCode(service.title)} {truncate(service.title, 12)}
                              </p>
                              <span className="text-[10px] font-semibold" style={{ color: SCREEN_TEXT_MUTED }}>
                                {service.docs.length}
                              </span>
                            </div>
                            <p className="mt-1 text-[8px] uppercase tracking-[0.18em] text-[var(--text-muted)]">
                              서비스 프레임
                            </p>
                          </div>
                        </button>
                      );
                    })}

                    {exploreGraph.docNodes.map((node) => {
                      const typeLabel = getDocTypeLabel(node.doc);
                      const typeStyle = getTypeStyle(typeLabel);
                      const isActive = selectedDoc?.id === node.doc.id;

                      return (
                        <button
                          key={node.id}
                          type="button"
                          onMouseEnter={() => setSelected(node.doc)}
                          onFocus={() => setSelected(node.doc)}
                          onClick={() => onOpenDoc(node.doc)}
                          className="absolute -translate-x-1/2 -translate-y-1/2"
                          style={{ left: node.point.x, top: node.point.y }}
                        >
                          <div className="relative flex items-center gap-2">
                            <span
                              className="relative flex h-[17px] w-[17px] items-center justify-center rounded-full border transition-transform"
                              style={{
                                borderColor: isActive ? typeStyle.accent : SCREEN_NODE_BORDER,
                                backgroundColor: "var(--bg)",
                                boxShadow: isActive
                                  ? `0 0 0 4px ${typeStyle.soft}, 0 10px 18px color-mix(in srgb, var(--text) 14%, transparent)`
                                  : `0 0 0 3px color-mix(in srgb, ${typeStyle.soft} 82%, transparent)`,
                                transform: isActive ? "scale(1.05)" : "scale(1)",
                              }}
                            >
                              <span
                                className="rounded-full"
                                style={{
                                  width: isActive ? 7 : 5,
                                  height: isActive ? 7 : 5,
                                  backgroundColor: typeStyle.accent,
                                }}
                              />
                            </span>
                            {isActive && (
                              <span
                                className="w-[164px] rounded-[14px] border px-3 py-2 text-left"
                                style={{
                                  borderColor: typeStyle.stroke,
                                  backgroundColor: "var(--bg)",
                                  boxShadow: `0 16px 28px ${typeStyle.soft}`,
                                }}
                              >
                                <span className="block text-[8px] uppercase tracking-[0.16em] text-[var(--text-muted)]">
                                  {typeLabel}
                                </span>
                                <span
                                  className="mt-1 block text-[11px] font-semibold leading-[1.25]"
                                  style={{ ...DISPLAY_FONT, color: SCREEN_INK }}
                                >
                                  {truncate(getNodeTitle(node.doc), 26)}
                                </span>
                              </span>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </>
                )}

                {selectedDoc && (
                  <div className="absolute bottom-8 right-8 w-[320px]">
                    <div
                      className="rounded-[18px] border px-5 py-5 shadow-[0_22px_50px_rgba(23,23,23,0.1)]"
                      style={{
                        borderColor: "var(--border-strong)",
                        backgroundColor: "var(--bg)",
                        boxShadow: SOFT_SHADOW,
                      }}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-[10px] uppercase tracking-[0.14em]" style={{ color: SCREEN_TEXT_MUTED }}>
                            {getServiceName(selectedDoc)}
                          </p>
                          <h4
                            className="mt-2 text-[16px] font-semibold uppercase leading-none"
                            style={{ ...DISPLAY_FONT, color: SCREEN_INK }}
                          >
                            {truncate(getNodeTitle(selectedDoc), 19)}
                          </h4>
                        </div>
                        <button
                          type="button"
                          onClick={() => setSelected(null)}
                          className="rounded-[10px] border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em]"
                          style={{ borderColor: "var(--border-strong)", color: SCREEN_TEXT_MUTED }}
                        >
                          Close
                        </button>
                      </div>

                      <p className="mt-3 text-[12px] leading-5" style={{ color: SCREEN_TEXT_SUBTLE }}>
                        {getNodeSummary(selectedDoc)}
                      </p>

                      <div className="mt-5 grid grid-cols-3 gap-3">
                        {[
                          { label: "TYPE", value: getDocTypeLabel(selectedDoc) },
                          { label: "STATE", value: resolveProgressState(selectedDoc.meta) },
                          { label: "D-DAY", value: getDday(selectedDoc.meta) ?? "-" },
                        ].map((item) => (
                          <div
                            key={item.label}
                            className="rounded-[12px] border px-3 py-3"
                            style={{
                              borderColor: "var(--border)",
                              backgroundColor: "var(--bg-subtle)",
                            }}
                          >
                            <p className="text-[10px] uppercase tracking-[0.18em]" style={{ color: SCREEN_TEXT_MUTED }}>
                              {item.label}
                            </p>
                            <p className="mt-2 text-[12px] font-semibold" style={{ color: SCREEN_INK }}>{item.value}</p>
                          </div>
                        ))}
                      </div>

                      <button
                        type="button"
                        onClick={() => onOpenDoc(selectedDoc)}
                        className="mt-5 rounded-[10px] px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-white"
                        style={{ backgroundColor: ACCENT }}
                      >
                        Open Detail
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
