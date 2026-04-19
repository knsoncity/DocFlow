import {
  Document,
  DocumentSummary,
  PolicyChangeKind,
  PolicyComparisonChange,
  PolicyComparisonStats,
  PolicyReference,
  PolicyTracking,
} from "../app/types";
import { getDocumentTitle } from "./document-display";
import { getDocumentTypeLabel } from "./document-taxonomy";

const POLICY_PATTERNS = [
  /정책/i,
  /policy/i,
  /guideline/i,
  /가이드/i,
  /원칙/i,
  /rule/i,
  /기준/i,
  /권한/i,
  /운영 주체/i,
  /운영 기준/i,
  /약관/i,
  /프로세스/i,
];

const TOPIC_CLEANUP_PATTERNS = [
  /\bver(?:sion)?\s*[\w.-]+/gi,
  /\bv\s*[\d.]+/gi,
  /버전\s*[\w.-]+/gi,
  /기획서\s*버전\s*[\w.-]+/gi,
  /\b(?:latest|draft|initial|final)\b/gi,
  /(?:초안|최신|초기 버전|최종안|수정본|개정판)/g,
  /\.[a-z0-9]{2,5}$/gi,
  /[()[\]{}【】<>]/g,
];

const TOKEN_STOP_WORDS = new Set([
  "정책",
  "운영",
  "가이드",
  "문서",
  "기획",
  "서비스",
  "version",
  "latest",
  "draft",
  "final",
  "초안",
  "최신",
  "버전",
  "문서화",
  "관리",
]);

const IMPACT_TYPE_WEIGHT: Record<string, number> = {
  API명세: 4,
  화면정의서: 3,
  PRD: 3,
  플로우차트: 2.5,
  회의록: 1.4,
  기타: 1.2,
};

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function buildPolicySignalText(doc: DocumentSummary) {
  return normalizeWhitespace(
    [
      getDocumentTitle(doc),
      doc.meta.serviceName,
      doc.meta.featureName,
      doc.meta.summary,
      ...(doc.meta.keywords ?? []),
      ...(doc.meta.relatedDocTypes ?? []),
      ...(doc.meta.missingParts ?? []),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
  );
}

export function isPolicyDocument(doc: DocumentSummary) {
  if (!doc.meta.isDocument) return false;
  if (doc.meta.manualPolicy) return true;
  const signalText = buildPolicySignalText(doc);
  return POLICY_PATTERNS.some((pattern) => pattern.test(signalText));
}

function buildPolicyKey(doc: DocumentSummary) {
  const base = normalizeWhitespace(
    [
      doc.meta.featureName,
      getDocumentTitle(doc),
      doc.sourceLabel,
      ...(doc.meta.keywords ?? []).slice(0, 3),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
  );

  let cleaned = base;
  TOPIC_CLEANUP_PATTERNS.forEach((pattern) => {
    cleaned = cleaned.replace(pattern, " ");
  });

  cleaned = cleaned
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

  return cleaned || "policy";
}

function tokenize(text: string) {
  return Array.from(
    new Set(
      normalizeWhitespace(text.toLowerCase())
        .split(/[\s/|,.:;·\-]+/)
        .map((token) => token.trim())
        .filter(
          (token) =>
            token.length > 1 &&
            !TOKEN_STOP_WORDS.has(token) &&
            !/^[\d.]+$/.test(token)
        )
    )
  );
}

function getDocumentTokens(doc: DocumentSummary) {
  return tokenize(
    [
      getDocumentTitle(doc),
      doc.meta.featureName,
      doc.meta.summary,
      ...(doc.meta.keywords ?? []),
    ]
      .filter(Boolean)
      .join(" ")
  );
}

function getServiceName(doc: DocumentSummary) {
  return doc.meta.serviceName?.trim() || "미분류 서비스";
}

function compareDocsByCreatedAt(left: DocumentSummary, right: DocumentSummary) {
  const timeDiff =
    new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
  if (timeDiff !== 0) return timeDiff;
  return left.id.localeCompare(right.id);
}

function countOverlap(left: string[], right: string[]) {
  if (left.length === 0 || right.length === 0) return 0;
  const rightSet = new Set(right);
  return left.reduce((count, token) => count + (rightSet.has(token) ? 1 : 0), 0);
}

function buildImpactReference(
  source: DocumentSummary,
  candidate: DocumentSummary
): PolicyReference | null {
  const candidateType = getDocumentTypeLabel(candidate);
  const sourceTokens = getDocumentTokens(source);
  const candidateTokens = getDocumentTokens(candidate);
  const sharedTokenCount = countOverlap(sourceTokens, candidateTokens);
  const relatedTypeHit = (source.meta.relatedDocTypes ?? []).includes(candidateType);
  const featureMatch =
    Boolean(source.meta.featureName?.trim()) &&
    Boolean(candidate.meta.featureName?.trim()) &&
    source.meta.featureName?.trim() === candidate.meta.featureName?.trim();

  let score = IMPACT_TYPE_WEIGHT[candidateType] ?? 1;
  score += sharedTokenCount * 1.4;
  if (relatedTypeHit) score += 2.4;
  if (featureMatch) score += 1.6;

  if (score < 3.2) return null;

  const reasonParts = [
    relatedTypeHit ? `${candidateType} 문서 타입 연관` : null,
    sharedTokenCount > 0 ? `공통 키워드 ${sharedTokenCount}개` : null,
    featureMatch ? "같은 기능 범위" : null,
  ].filter(Boolean);

  return {
    docId: candidate.id,
    title: getDocumentTitle(candidate),
    docType: candidateType,
    reason: reasonParts.join(" · ") || "같은 서비스 문서",
    score: Number(score.toFixed(1)),
  };
}

function createEmptyTracking(isPolicy: boolean): PolicyTracking {
  return { isPolicy };
}

export function withPolicyTracking<T extends DocumentSummary>(docs: T[]): T[] {
  if (docs.length === 0) return docs;

  const nextDocs = docs.map((doc) => ({
    ...doc,
    policyTracking: createEmptyTracking(isPolicyDocument(doc)),
  }));

  const policyGroups = new Map<string, T[]>();

  nextDocs.forEach((doc) => {
    if (!doc.policyTracking?.isPolicy) return;
    const key = `${getServiceName(doc)}::${buildPolicyKey(doc)}`;
    doc.policyTracking = {
      ...doc.policyTracking,
      policyKey: key,
    };
    const group = policyGroups.get(key) ?? [];
    group.push(doc as T);
    policyGroups.set(key, group);
  });

  const latestPolicyDocs: T[] = [];

  policyGroups.forEach((group, key) => {
    const sorted = [...group].sort(compareDocsByCreatedAt);
    sorted.forEach((doc, index) => {
      const previous = index > 0 ? sorted[index - 1] : undefined;
      const isLatestVersion = index === sorted.length - 1;
      doc.policyTracking = {
        ...doc.policyTracking,
        isPolicy: true,
        detectionSource: doc.meta.manualPolicy ? "manual" : "auto",
        policyKey: key,
        versionIndex: index + 1,
        versionCount: sorted.length,
        previousDocId: previous?.id,
        previousTitle: previous ? getDocumentTitle(previous) : undefined,
        previousVersion: previous?.meta.version,
        isLatestVersion,
      };
      if (isLatestVersion && previous) {
        latestPolicyDocs.push(doc);
      }
    });
  });

  latestPolicyDocs.forEach((policyDoc) => {
    const sameServiceDocs = nextDocs.filter(
      (doc) =>
        doc.id !== policyDoc.id &&
        getServiceName(doc) === getServiceName(policyDoc) &&
        doc.meta.isDocument
    );

    const impactCandidates = sameServiceDocs
      .filter((doc) => doc.policyTracking?.policyKey !== policyDoc.policyTracking?.policyKey)
      .reduce<Array<{ doc: T; impact: PolicyReference }>>((items, doc) => {
        const impact = buildImpactReference(policyDoc, doc);
        if (impact) {
          items.push({ doc, impact });
        }
        return items;
      }, [])
      .sort((left, right) => (right.impact.score ?? 0) - (left.impact.score ?? 0))
      .slice(0, 5);

    if (impactCandidates.length === 0) return;

    policyDoc.policyTracking = {
      ...policyDoc.policyTracking,
      isPolicy: true,
      detectionSource: policyDoc.meta.manualPolicy ? "manual" : "auto",
      impactCount: impactCandidates.length,
      impactCandidates: impactCandidates.map((item) => item.impact),
    };

    impactCandidates.forEach(({ doc, impact }) => {
      const affectedByPolicies = doc.policyTracking?.affectedByPolicies ?? [];
      const nextReferences = [
        ...affectedByPolicies,
        {
          docId: policyDoc.id,
          title: getDocumentTitle(policyDoc),
          docType: getDocumentTypeLabel(policyDoc),
          reason: impact.reason,
          score: impact.score,
        },
      ]
        .sort((left, right) => (right.score ?? 0) - (left.score ?? 0))
        .slice(0, 5);

      doc.policyTracking = {
        ...doc.policyTracking,
        isPolicy: doc.policyTracking?.isPolicy ?? false,
        affectedByPolicyCount: nextReferences.length,
        affectedByPolicies: nextReferences,
      };
    });
  });

  return nextDocs as T[];
}

function normalizeDiffBlocks(text: string) {
  return text
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((chunk) => normalizeWhitespace(chunk))
    .filter(Boolean);
}

export function buildPolicyComparison(
  currentRawContent: string,
  previousRawContent: string
): {
  stats: PolicyComparisonStats;
  changes: PolicyComparisonChange[];
} {
  const currentBlocks = normalizeDiffBlocks(currentRawContent);
  const previousBlocks = normalizeDiffBlocks(previousRawContent);
  const currentSet = new Set(currentBlocks);
  const previousSet = new Set(previousBlocks);

  const addedBlocks = currentBlocks.filter((block) => !previousSet.has(block));
  const removedBlocks = previousBlocks.filter((block) => !currentSet.has(block));
  const pairedChangeCount = Math.min(addedBlocks.length, removedBlocks.length);

  const changes: PolicyComparisonChange[] = [];

  for (let index = 0; index < pairedChangeCount; index += 1) {
    changes.push({
      kind: "changed",
      previous: removedBlocks[index],
      current: addedBlocks[index],
    });
  }

  addedBlocks.slice(pairedChangeCount).forEach((block) => {
    changes.push({ kind: "added", current: block });
  });

  removedBlocks.slice(pairedChangeCount).forEach((block) => {
    changes.push({ kind: "removed", previous: block });
  });

  const stats: PolicyComparisonStats = {
    added: Math.max(0, addedBlocks.length - pairedChangeCount),
    removed: Math.max(0, removedBlocks.length - pairedChangeCount),
    changed: pairedChangeCount,
    total: changes.length,
  };

  return {
    stats,
    changes: changes.slice(0, 12),
  };
}

export function withPolicyTrackingForDetail(
  doc: Document,
  allDocs: DocumentSummary[],
  previousDoc?: Document | null
): Document {
  const trackedDocs = withPolicyTracking(allDocs);
  const trackedCurrent = trackedDocs.find((item) => item.id === doc.id);

  if (!trackedCurrent?.policyTracking) {
    return doc;
  }

  const nextTracking: PolicyTracking = {
    ...trackedCurrent.policyTracking,
  };

  if (previousDoc && trackedCurrent.policyTracking.previousDocId === previousDoc.id) {
    const comparison = buildPolicyComparison(doc.rawContent, previousDoc.rawContent);
    nextTracking.comparisonStats = comparison.stats;
    nextTracking.comparisonChanges = comparison.changes;
  }

  return {
    ...doc,
    policyTracking: nextTracking,
  };
}

export function getPolicyBadgeLabel(tracking?: PolicyTracking | null) {
  if (!tracking) return null;
  if (tracking.isPolicy && (tracking.impactCount ?? 0) > 0) {
    return `영향 ${tracking.impactCount}`;
  }
  if (tracking.isPolicy && tracking.detectionSource === "manual") {
    return "정책";
  }
  if ((tracking.affectedByPolicyCount ?? 0) > 0) {
    return "정책 영향";
  }
  return null;
}

export function getPolicyBadgeTone(tracking?: PolicyTracking | null): PolicyChangeKind | null {
  if (!tracking) return null;
  if (tracking.isPolicy && (tracking.impactCount ?? 0) > 0) return "changed";
  if ((tracking.affectedByPolicyCount ?? 0) > 0) return "added";
  return null;
}

export function getPolicyPanelSummary(doc: DocumentSummary) {
  const tracking = doc.policyTracking;
  if (!tracking) return null;

  if (tracking.isPolicy) {
    if (tracking.previousDocId) {
      return `이전 버전과 비교 가능 · 영향 후보 ${tracking.impactCount ?? 0}건`;
    }
    return tracking.detectionSource === "manual"
      ? "정책 문서로 수동 지정됨"
      : "정책 기준 문서로 추적됨";
  }

  if ((tracking.affectedByPolicyCount ?? 0) > 0) {
    return `정책 영향 후보 ${tracking.affectedByPolicyCount}건`;
  }

  return null;
}
