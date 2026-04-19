export type DocType =
  | "PRD"
  | "화면정의서"
  | "플로우차트"
  | "API명세"
  | "회의록"
  | "기타";

export type DocumentCategory = "기획" | "설계" | "개발" | "운영" | "참고" | "기타";

export type DocumentSourceType = "text" | "file" | "url" | "image";
export type DeliveryHealth = "red" | "yellow" | "green" | "gray";
export type ProgressState = "대기" | "진행중" | "완료" | "보류" | "미정" | "참고자료";

export interface StoredImagePreview {
  name: string;
  previewUrl: string;
}

export interface SpreadsheetSheet {
  name: string;
  rows: string[][];
}

export type PolicyChangeKind = "added" | "removed" | "changed";

export interface PolicyReference {
  docId: string;
  title: string;
  docType?: string;
  reason?: string;
  score?: number;
}

export interface PolicyComparisonStats {
  added: number;
  removed: number;
  changed: number;
  total: number;
}

export interface PolicyComparisonChange {
  kind: PolicyChangeKind;
  previous?: string;
  current?: string;
}

export interface PolicyTracking {
  isPolicy: boolean;
  detectionSource?: "auto" | "manual";
  policyKey?: string;
  versionIndex?: number;
  versionCount?: number;
  previousDocId?: string;
  previousTitle?: string;
  previousVersion?: string;
  isLatestVersion?: boolean;
  impactCount?: number;
  impactCandidates?: PolicyReference[];
  affectedByPolicyCount?: number;
  affectedByPolicies?: PolicyReference[];
  comparisonStats?: PolicyComparisonStats;
  comparisonChanges?: PolicyComparisonChange[];
}

export type DocumentHistoryField = "progressState" | "deliveryHealth" | "dueDate";

export interface DocumentHistoryChange {
  field: DocumentHistoryField;
  label: string;
  from?: string | null;
  to?: string | null;
}

export interface DocumentHistoryEntry {
  id: string;
  changedAt: string;
  changes: DocumentHistoryChange[];
}

export interface DocMeta {
  isDocument: boolean;
  manualPolicy?: boolean;
  docType?: DocType;
  serviceName?: string;
  featureName?: string;
  version?: string;
  author?: string;
  summary?: string;
  keywords?: string[];
  relatedDocTypes?: string[];
  completeness?: number;
  missingParts?: string[];
  progressState?: ProgressState | string;
  scheduleSummary?: string;
  deliveryHealth?: DeliveryHealth;
  dueDate?: string;
}

export interface DocumentSummary {
  id: string;
  meta: DocMeta;
  createdAt: string;
  sourceType?: DocumentSourceType;
  sourceLabel?: string;
  imageCount?: number;
  policyTracking?: PolicyTracking;
}

export interface Document extends DocumentSummary {
  rawContent: string;
  userPrompt?: string;
  ocrText?: string;
  imagePreviews?: StoredImagePreview[];
  spreadsheetSheets?: SpreadsheetSheet[];
  changeHistory?: DocumentHistoryEntry[];
}

export type ScheduleCategory = "업무" | "회의" | "리뷰" | "출장" | "휴가" | "기타";

export interface Schedule {
  id: string;
  title: string;
  startDate: string;   // YYYY-MM-DD
  endDate: string;     // YYYY-MM-DD (same as startDate for single-day)
  category: ScheduleCategory;
  color?: string;
  note?: string;
  createdAt: string;
}

export type AnalysisSourceType = "text" | "file" | "url" | "image";

export interface ChatImageAttachment {
  id: string;
  name: string;
  mimeType: string;
  data: string;
  previewUrl: string;
  size: number;
}

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  docMeta?: DocMeta;
  attachments?: ChatImageAttachment[];
}
