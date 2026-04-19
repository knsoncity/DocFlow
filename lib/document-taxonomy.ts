import { DocMeta, DocumentCategory, DocumentSummary } from "../app/types";

type TaxonomyInput = Pick<DocumentSummary, "meta"> | DocMeta;

export const CATEGORY_ORDER: DocumentCategory[] = ["기획", "설계", "개발", "운영", "참고", "기타"];
export const TYPE_ORDER = ["PRD", "화면정의서", "플로우차트", "API명세", "회의록", "기타", "참고자료"];

export const CATEGORY_STYLES: Record<
  DocumentCategory,
  { accent: string; soft: string; stroke: string; label: string }
> = {
  기획: { accent: "#2563eb", soft: "#dbeafe", stroke: "#93c5fd", label: "Planning" },
  설계: { accent: "#7c3aed", soft: "#ede9fe", stroke: "#c4b5fd", label: "Design" },
  개발: { accent: "#ea580c", soft: "#ffedd5", stroke: "#fdba74", label: "Development" },
  운영: { accent: "#059669", soft: "#d1fae5", stroke: "#6ee7b7", label: "Ops" },
  참고: { accent: "#64748b", soft: "#e2e8f0", stroke: "#cbd5e1", label: "Reference" },
  기타: { accent: "#78716c", soft: "#f5f5f4", stroke: "#d6d3d1", label: "General" },
};

const DOC_TYPE_CATEGORY_MAP: Record<string, DocumentCategory> = {
  PRD: "기획",
  화면정의서: "설계",
  플로우차트: "설계",
  API명세: "개발",
  회의록: "운영",
  참고자료: "참고",
  기타: "기타",
};

const CATEGORY_SIGNAL_RULES: Array<{ category: DocumentCategory; patterns: RegExp[] }> = [
  {
    category: "개발",
    patterns: [
      /api/,
      /endpoint/,
      /request/,
      /response/,
      /payload/,
      /schema/,
      /database/,
      /db/,
      /sql/,
      /graphql/,
      /sdk/,
      /auth/,
      /인증/,
      /연동/,
      /스펙/,
      /명세/,
    ],
  },
  {
    category: "설계",
    patterns: [
      /화면/,
      /ui/,
      /ux/,
      /wireframe/,
      /layout/,
      /component/,
      /flow/,
      /플로우/,
      /journey/,
      /ia/,
      /information architecture/,
      /디자인/,
      /동선/,
    ],
  },
  {
    category: "운영",
    patterns: [
      /회의/,
      /meeting/,
      /agenda/,
      /action item/,
      /progress/,
      /운영/,
      /release/,
      /qa/,
      /checklist/,
      /체크리스트/,
      /일정/,
      /status/,
      /issue/,
      /incident/,
      /진행/,
    ],
  },
  {
    category: "기획",
    patterns: [
      /prd/,
      /기획/,
      /정책/,
      /policy/,
      /요구사항/,
      /requirements/,
      /roadmap/,
      /로드맵/,
      /strategy/,
      /전략/,
      /scope/,
      /user story/,
      /목표/,
    ],
  },
];

function resolveMeta(input: TaxonomyInput) {
  return "meta" in input ? input.meta : input;
}

function buildSignalText(meta: DocMeta) {
  return [
    meta.docType,
    meta.serviceName,
    meta.featureName,
    meta.summary,
    ...(meta.keywords ?? []),
    ...(meta.relatedDocTypes ?? []),
    ...(meta.missingParts ?? []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function getDocumentTypeLabel(input: TaxonomyInput) {
  const meta = resolveMeta(input);
  return meta.isDocument ? meta.docType ?? "기타" : "참고자료";
}

export function getDocumentCategory(input: TaxonomyInput): DocumentCategory {
  const meta = resolveMeta(input);
  const typeLabel = getDocumentTypeLabel(meta);
  const mapped = DOC_TYPE_CATEGORY_MAP[typeLabel];

  if (!meta.isDocument) return "참고";
  if (mapped && mapped !== "기타") return mapped;

  const signalText = buildSignalText(meta);
  for (const rule of CATEGORY_SIGNAL_RULES) {
    if (rule.patterns.some((pattern) => pattern.test(signalText))) {
      return rule.category;
    }
  }

  return mapped ?? "기타";
}

export function compareCategories(left: DocumentCategory, right: DocumentCategory) {
  return CATEGORY_ORDER.indexOf(left) - CATEGORY_ORDER.indexOf(right);
}

export function compareTypeLabels(left: string, right: string) {
  const leftIndex = TYPE_ORDER.indexOf(left);
  const rightIndex = TYPE_ORDER.indexOf(right);

  if (leftIndex !== -1 || rightIndex !== -1) {
    return (leftIndex === -1 ? TYPE_ORDER.length : leftIndex) - (rightIndex === -1 ? TYPE_ORDER.length : rightIndex);
  }

  return left.localeCompare(right, "ko");
}
