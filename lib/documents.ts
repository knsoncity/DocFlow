import { getSupabaseAdmin, DbDocument } from "./supabase";
import {
  DeliveryHealth,
  Document,
  DocumentHistoryChange,
  DocumentHistoryEntry,
  DocumentSummary,
  DocMeta,
  DocType,
  DocumentSourceType,
  StoredImagePreview,
  SpreadsheetSheet,
} from "../app/types";
import {
  withPolicyTracking,
  withPolicyTrackingForDetail,
} from "./policy-tracking";
import { DEFAULT_WORKSPACE_ID, normalizeWorkspaceId } from "./workspace";
import { ensureWorkspace } from "./workspaces";
import { isWorkspaceSchemaError } from "./db-errors";

const VALID_DOC_TYPES: DocType[] = ["PRD", "화면정의서", "플로우차트", "API명세", "회의록", "기타"];
const STRUCTURED_RAW_V1_PREFIX = "__DOCFLOW_RAW_V1__:";
const STRUCTURED_RAW_V2_PREFIX = "__DOCFLOW_RAW_V2__:";
const DETAIL_BUCKET = "docflow-document-details";
const DETAIL_PREFIX = "documents";

type StructuredRawContent = {
  isDocument?: boolean;
  sourceType: DocumentSourceType;
  sourceLabel?: string;
  rawContent: string;
  imageCount?: number;
  userPrompt?: string;
  ocrText?: string;
  imagePreviews?: StoredImagePreview[];
  spreadsheetSheets?: SpreadsheetSheet[];
  metaSnapshot?: Partial<DocMeta>;
  changeHistory?: DocumentHistoryEntry[];
};

type StoredRawPointer = {
  version: 2;
  detailPath: string;
  isDocument?: boolean;
  sourceType: DocumentSourceType;
  sourceLabel?: string;
  imageCount?: number;
  metaSnapshot?: Partial<DocMeta>;
};

type DocumentMetaUpdates = {
  progressState?: string;
  deliveryHealth?: DeliveryHealth;
  dueDate?: string | null;
  author?: string | null;
  manualPolicy?: boolean;
};

type DocumentFieldUpdates = DocumentMetaUpdates & {
  isDocument?: boolean;
  docType?: DocType;
  serviceName?: string | null;
  featureName?: string | null;
  title?: string;
  summary?: string | null;
  author?: string | null;
  version?: string | null;
};

const HISTORY_FIELD_LABELS = {
  progressState: "진행여부",
  deliveryHealth: "색상 상태",
  dueDate: "일정",
} as const;

let ensureDetailBucketPromise: Promise<void> | null = null;

function normalizeDocType(raw: string | undefined): DocType {
  if (!raw) return "기타";
  if (VALID_DOC_TYPES.includes(raw as DocType)) return raw as DocType;
  for (const t of VALID_DOC_TYPES) {
    if (raw.includes(t)) return t;
  }
  return "기타";
}

function buildMetaSnapshot(meta: DocMeta): Partial<DocMeta> {
  return {
    manualPolicy: meta.manualPolicy,
    progressState: meta.progressState,
    scheduleSummary: meta.scheduleSummary,
    deliveryHealth: meta.deliveryHealth,
    dueDate: meta.dueDate,
  };
}

function shouldStoreStructuredDetailInStorage(raw: StructuredRawContent) {
  return (
    raw.sourceType !== "text" ||
    Boolean(raw.userPrompt?.trim()) ||
    Boolean(raw.ocrText?.trim()) ||
    Boolean(raw.imagePreviews?.length) ||
    Boolean(raw.changeHistory?.length) ||
    raw.rawContent.length > 3000
  );
}

function buildInlineStructuredRawContent(
  rawContent: string | StructuredRawContent,
  meta: DocMeta
): StructuredRawContent {
  const metaSnapshot = buildMetaSnapshot(meta);

  if (typeof rawContent === "string") {
    return {
      isDocument: meta.isDocument,
      sourceType: "text",
      rawContent,
      metaSnapshot,
      changeHistory: [],
    };
  }

  return {
    ...rawContent,
    isDocument: meta.isDocument,
    metaSnapshot: {
      ...rawContent.metaSnapshot,
      ...metaSnapshot,
    },
  };
}

function serializeInlineRawContent(detail: StructuredRawContent) {
  return `${STRUCTURED_RAW_V1_PREFIX}${JSON.stringify(detail satisfies StructuredRawContent)}`;
}

function serializeRawPointer(pointer: StoredRawPointer) {
  return `${STRUCTURED_RAW_V2_PREFIX}${JSON.stringify(pointer satisfies StoredRawPointer)}`;
}

function parseInlineRawContent(rawContent: string): StructuredRawContent | null {
  if (!rawContent.startsWith(STRUCTURED_RAW_V1_PREFIX)) return null;

  try {
    return JSON.parse(rawContent.slice(STRUCTURED_RAW_V1_PREFIX.length)) as StructuredRawContent;
  } catch (error) {
    console.error("parseInlineRawContent:", error);
    return null;
  }
}

function parseRawPointer(rawContent: string): StoredRawPointer | null {
  if (!rawContent.startsWith(STRUCTURED_RAW_V2_PREFIX)) return null;

  try {
    return JSON.parse(rawContent.slice(STRUCTURED_RAW_V2_PREFIX.length)) as StoredRawPointer;
  } catch (error) {
    console.error("parseRawPointer:", error);
    return null;
  }
}

async function ensureDetailBucket() {
  if (ensureDetailBucketPromise) return ensureDetailBucketPromise;

  ensureDetailBucketPromise = (async () => {
    const admin = getSupabaseAdmin();
    const { data: buckets, error: listError } = await admin.storage.listBuckets();
    if (listError) throw listError;

    const exists = (buckets ?? []).some((bucket) => bucket.name === DETAIL_BUCKET);
    if (exists) return;

    const { error: createError } = await admin.storage.createBucket(DETAIL_BUCKET, {
      public: false,
      fileSizeLimit: "10MB",
    });

    if (
      createError &&
      !createError.message.toLowerCase().includes("already exists")
    ) {
      throw createError;
    }
  })().catch((error) => {
    ensureDetailBucketPromise = null;
    throw error;
  });

  return ensureDetailBucketPromise;
}

async function uploadStructuredRawDetail(docId: string, detail: StructuredRawContent) {
  await ensureDetailBucket();

  const detailPath = `${DETAIL_PREFIX}/${docId}.json`;
  const { error } = await getSupabaseAdmin().storage
    .from(DETAIL_BUCKET)
    .upload(detailPath, JSON.stringify(detail), {
      upsert: true,
      contentType: "application/json; charset=utf-8",
    });

  if (error) throw error;
  return detailPath;
}

async function downloadStructuredRawDetail(detailPath: string) {
  const { data, error } = await getSupabaseAdmin().storage
    .from(DETAIL_BUCKET)
    .download(detailPath);

  if (error || !data) {
    console.error("downloadStructuredRawDetail:", error);
    return null;
  }

  try {
    const text = await data.text();
    return JSON.parse(text) as StructuredRawContent;
  } catch (parseError) {
    console.error("downloadStructuredRawDetail parse:", parseError);
    return null;
  }
}

async function deleteStructuredRawDetail(detailPath: string) {
  const { error } = await getSupabaseAdmin().storage
    .from(DETAIL_BUCKET)
    .remove([detailPath]);

  if (error) {
    console.error("deleteStructuredRawDetail:", error);
  }
}

async function serializeRawContent(
  docId: string,
  rawContent: string | StructuredRawContent,
  meta: DocMeta
) {
  if (typeof rawContent === "string") {
    const metaSnapshot = buildMetaSnapshot(meta);
    if (
      !metaSnapshot.progressState &&
      !metaSnapshot.scheduleSummary &&
      !metaSnapshot.deliveryHealth &&
      !metaSnapshot.dueDate
    ) {
      return rawContent;
    }

    return serializeInlineRawContent(buildInlineStructuredRawContent(rawContent, meta));
  }

  const detail = buildInlineStructuredRawContent(rawContent, meta);

  if (!shouldStoreStructuredDetailInStorage(detail)) {
    return serializeInlineRawContent(detail);
  }

  try {
    const detailPath = await uploadStructuredRawDetail(docId, detail);
    return serializeRawPointer({
      version: 2,
      detailPath,
      isDocument: detail.isDocument,
      sourceType: detail.sourceType,
      sourceLabel: detail.sourceLabel,
      imageCount: detail.imageCount,
      metaSnapshot: detail.metaSnapshot,
    });
  } catch (error) {
    console.error("serializeRawContent storage:", error);
    return serializeInlineRawContent(detail);
  }
}

async function resolveStructuredRawContent(
  row: DbDocument,
  fallbackSummary?: DocumentSummary
): Promise<StructuredRawContent> {
  const pointer = parseRawPointer(row.raw_content);
  if (pointer?.detailPath) {
    const detail = await downloadStructuredRawDetail(pointer.detailPath);
    if (detail) {
      return {
        ...detail,
        isDocument: pointer.isDocument ?? detail.isDocument,
        sourceType: detail.sourceType ?? pointer.sourceType,
        sourceLabel: detail.sourceLabel ?? pointer.sourceLabel,
        imageCount: detail.imageCount ?? pointer.imageCount,
        metaSnapshot: {
          ...detail.metaSnapshot,
          ...pointer.metaSnapshot,
        },
      };
    }
  }

  const inline = parseInlineRawContent(row.raw_content);
  if (inline) return inline;

  return {
    isDocument: fallbackSummary?.meta.isDocument ?? true,
    sourceType: fallbackSummary?.sourceType ?? "text",
    sourceLabel: fallbackSummary?.sourceLabel,
    imageCount: fallbackSummary?.imageCount,
    rawContent: row.raw_content,
    metaSnapshot: buildMetaSnapshot(fallbackSummary?.meta ?? { isDocument: true }),
    changeHistory: [],
  };
}

function buildMetaFromRow(row: DbDocument, raw?: { isDocument?: boolean; metaSnapshot?: Partial<DocMeta> }): DocMeta {
  return {
    isDocument: raw?.isDocument ?? true,
    manualPolicy: raw?.metaSnapshot?.manualPolicy,
    docType: row.doc_type as DocMeta["docType"],
    serviceName: row.services?.name ?? undefined,
    featureName: row.feature_name ?? undefined,
    version: row.version ?? undefined,
    author: row.author ?? undefined,
    summary: row.summary ?? undefined,
    keywords: row.keywords ?? [],
    completeness: row.completeness ?? undefined,
    missingParts: row.missing_parts ?? [],
    relatedDocTypes: row.related_doc_types ?? [],
    progressState: raw?.metaSnapshot?.progressState,
    scheduleSummary: raw?.metaSnapshot?.scheduleSummary,
    deliveryHealth: raw?.metaSnapshot?.deliveryHealth,
    dueDate: raw?.metaSnapshot?.dueDate,
  };
}

function dbRowToDocumentSummary(row: DbDocument): DocumentSummary {
  const pointer = parseRawPointer(row.raw_content);
  const inline = pointer ? null : parseInlineRawContent(row.raw_content);
  const raw = pointer ?? inline ?? undefined;

  return {
    id: row.id,
    workspaceId: row.workspace_id ?? DEFAULT_WORKSPACE_ID,
    createdAt: row.created_at,
    sourceType: raw?.sourceType,
    sourceLabel: raw?.sourceLabel,
    imageCount: raw?.imageCount,
    meta: buildMetaFromRow(row, raw),
  };
}

async function dbRowToDocument(row: DbDocument): Promise<Document> {
  const summary = dbRowToDocumentSummary(row);
  const detail = await resolveStructuredRawContent(row, summary);

  return {
    ...summary,
    rawContent: detail.rawContent,
    userPrompt: detail.userPrompt,
    ocrText: detail.ocrText,
    imagePreviews: detail.imagePreviews,
    spreadsheetSheets: detail.spreadsheetSheets,
    changeHistory: detail.changeHistory ?? [],
    meta: buildMetaFromRow(row, detail),
  };
}

export function toDocumentSummary(doc: Document | DocumentSummary): DocumentSummary {
  return {
    id: doc.id,
    workspaceId: doc.workspaceId,
    meta: doc.meta,
    createdAt: doc.createdAt,
    sourceType: doc.sourceType,
    sourceLabel: doc.sourceLabel,
    imageCount: doc.imageCount,
    policyTracking: doc.policyTracking,
  };
}

export async function upsertService(name: string, workspaceId = DEFAULT_WORKSPACE_ID): Promise<string | null> {
  const resolvedWorkspaceId = await ensureWorkspace(workspaceId);
  const { data, error } = await getSupabaseAdmin()
    .from("services")
    .upsert(
      { name, workspace_id: resolvedWorkspaceId },
      { onConflict: "workspace_id,name" }
    )
    .select("id")
    .single();

  if (error) {
    if (isWorkspaceSchemaError(error)) {
      const legacy = await getSupabaseAdmin()
        .from("services")
        .upsert({ name }, { onConflict: "name" })
        .select("id")
        .single();

      if (!legacy.error) return legacy.data.id;
    }

    console.error("upsertService:", error);
    return null;
  }

  return data.id;
}

export async function saveDocument(
  rawContent: string | StructuredRawContent,
  meta: DocMeta,
  workspaceId = DEFAULT_WORKSPACE_ID
): Promise<Document | null> {
  const id = crypto.randomUUID();
  const resolvedWorkspaceId = await ensureWorkspace(workspaceId);
  let service_id: string | null = null;

  if (meta.serviceName) {
    service_id = await upsertService(meta.serviceName, resolvedWorkspaceId);
  }

  const serializedRawContent = await serializeRawContent(id, rawContent, meta);
  const admin = getSupabaseAdmin();
  let result = await admin
    .from("documents")
    .insert({
      id,
      workspace_id: resolvedWorkspaceId,
      service_id,
      raw_content: serializedRawContent,
      doc_type: normalizeDocType(meta.docType),
      feature_name: meta.featureName ?? null,
      version: meta.version ?? null,
      author: meta.author ?? null,
      summary: meta.summary ?? null,
      keywords: meta.keywords ?? [],
      completeness: meta.completeness ?? null,
      missing_parts: meta.missingParts ?? [],
      related_doc_types: meta.relatedDocTypes ?? [],
    })
    .select("*, services(name)")
    .single();
  let data = result.data;
  let error = result.error;

  if (error && isWorkspaceSchemaError(error)) {
    result = await admin
      .from("documents")
      .insert({
        id,
        service_id,
        raw_content: serializedRawContent,
        doc_type: normalizeDocType(meta.docType),
        feature_name: meta.featureName ?? null,
        version: meta.version ?? null,
        author: meta.author ?? null,
        summary: meta.summary ?? null,
        keywords: meta.keywords ?? [],
        completeness: meta.completeness ?? null,
        missing_parts: meta.missingParts ?? [],
        related_doc_types: meta.relatedDocTypes ?? [],
      })
      .select("*, services(name)")
      .single();
    data = result.data;
    error = result.error;
  }

  if (error) {
    console.error("saveDocument:", error);
    const pointer = parseRawPointer(serializedRawContent);
    if (pointer?.detailPath) {
      await deleteStructuredRawDetail(pointer.detailPath);
    }
    return null;
  }

  return fetchDocumentById(data.id, resolvedWorkspaceId);
}

export async function fetchDocuments(workspaceId = DEFAULT_WORKSPACE_ID): Promise<DocumentSummary[]> {
  const resolvedWorkspaceId = normalizeWorkspaceId(workspaceId);
  const admin = getSupabaseAdmin();
  let result = await admin
    .from("documents")
    .select("*, services(name)")
    .eq("workspace_id", resolvedWorkspaceId)
    .order("created_at", { ascending: false });
  let data = result.data;
  let error = result.error;

  if (error && isWorkspaceSchemaError(error)) {
    result = await admin
      .from("documents")
      .select("*, services(name)")
      .order("created_at", { ascending: false });
    data = result.data;
    error = result.error;
  }

  if (error) {
    console.error("fetchDocuments:", error);
    return [];
  }

  return withPolicyTracking((data ?? []).map(dbRowToDocumentSummary));
}

export async function fetchDocumentById(id: string, workspaceId = DEFAULT_WORKSPACE_ID): Promise<Document | null> {
  const resolvedWorkspaceId = normalizeWorkspaceId(workspaceId);
  const admin = getSupabaseAdmin();
  let result = await admin
    .from("documents")
    .select("*, services(name)")
    .eq("id", id)
    .eq("workspace_id", resolvedWorkspaceId)
    .single();
  let data = result.data;
  let error = result.error;

  if (error && isWorkspaceSchemaError(error)) {
    result = await admin
      .from("documents")
      .select("*, services(name)")
      .eq("id", id)
      .single();
    data = result.data;
    error = result.error;
  }

  if (error || !data) {
    console.error("fetchDocumentById:", error);
    return null;
  }

  const doc = await dbRowToDocument(data);
  const summaries = await fetchDocuments(resolvedWorkspaceId);
  const previousDocId = summaries.find((item) => item.id === doc.id)?.policyTracking?.previousDocId;
  let previousDoc: Document | null = null;

  if (previousDocId) {
    let previousResult = await admin
      .from("documents")
      .select("*, services(name)")
      .eq("id", previousDocId)
      .eq("workspace_id", resolvedWorkspaceId)
      .single();
    let previousRow = previousResult.data;
    let previousError = previousResult.error;

    if (previousError && isWorkspaceSchemaError(previousError)) {
      previousResult = await admin
        .from("documents")
        .select("*, services(name)")
        .eq("id", previousDocId)
        .single();
      previousRow = previousResult.data;
      previousError = previousResult.error;
    }

    if (!previousError && previousRow) {
      previousDoc = await dbRowToDocument(previousRow);
    }
  }

  return withPolicyTrackingForDetail(doc, summaries, previousDoc);
}

export async function updateDocumentMeta(
  id: string,
  updates: DocumentMetaUpdates,
  workspaceId = DEFAULT_WORKSPACE_ID
): Promise<Document | null> {
  return updateDocumentFields(id, updates, workspaceId);
}

export async function updateDocumentFields(
  id: string,
  updates: DocumentFieldUpdates,
  workspaceId = DEFAULT_WORKSPACE_ID
): Promise<Document | null> {
  const resolvedWorkspaceId = normalizeWorkspaceId(workspaceId);
  const admin = getSupabaseAdmin();
  let fetchResult = await admin
    .from("documents")
    .select("*, services(name)")
    .eq("id", id)
    .eq("workspace_id", resolvedWorkspaceId)
    .single();
  let existingRow = fetchResult.data;
  let fetchError = fetchResult.error;

  if (fetchError && isWorkspaceSchemaError(fetchError)) {
    fetchResult = await admin
      .from("documents")
      .select("*, services(name)")
      .eq("id", id)
      .single();
    existingRow = fetchResult.data;
    fetchError = fetchResult.error;
  }

  if (fetchError || !existingRow) {
    console.error("updateDocumentMeta fetch:", fetchError);
    return null;
  }

  const currentDoc = await dbRowToDocument(existingRow);
  const structuredRaw = await resolveStructuredRawContent(existingRow, currentDoc);

  const nextServiceName =
    updates.serviceName === null
      ? undefined
      : updates.serviceName?.trim() || currentDoc.meta.serviceName;
  const nextFeatureName =
    updates.title?.trim() ||
    (updates.featureName === null
      ? undefined
      : updates.featureName?.trim() || currentDoc.meta.featureName);
  const nextDocType = updates.docType ?? currentDoc.meta.docType ?? "기타";
  const nextAuthor =
    updates.author === null
      ? undefined
      : updates.author?.trim() || currentDoc.meta.author;
  const nextVersion =
    updates.version === null
      ? undefined
      : updates.version?.trim() || currentDoc.meta.version;
  const nextSummary =
    updates.summary === null
      ? undefined
      : updates.summary?.trim() || currentDoc.meta.summary;
  const nextIsDocument =
    typeof updates.isDocument === "boolean"
      ? updates.isDocument
      : currentDoc.meta.isDocument;

  const mergedMeta: DocMeta = {
    ...currentDoc.meta,
    isDocument: nextIsDocument,
    manualPolicy:
      typeof updates.manualPolicy === "boolean"
        ? updates.manualPolicy
        : currentDoc.meta.manualPolicy,
    docType: nextDocType,
    serviceName: nextServiceName,
    featureName: nextFeatureName,
    author: nextAuthor,
    version: nextVersion,
    summary: nextSummary,
    progressState: updates.progressState ?? currentDoc.meta.progressState,
    deliveryHealth: updates.deliveryHealth ?? currentDoc.meta.deliveryHealth,
    dueDate:
      updates.dueDate === null
        ? undefined
        : updates.dueDate ?? currentDoc.meta.dueDate,
  };
  const nextHistoryEntry = buildHistoryEntry(currentDoc.meta, mergedMeta);
  const nextChangeHistory = nextHistoryEntry
    ? [nextHistoryEntry, ...(structuredRaw.changeHistory ?? [])].slice(0, 30)
    : structuredRaw.changeHistory;

  let service_id: string | null = null;
  if (nextServiceName) {
    service_id = await upsertService(nextServiceName, resolvedWorkspaceId);
  }

  const nextRawContent = await serializeRawContent(
    id,
    {
      ...structuredRaw,
      isDocument: mergedMeta.isDocument,
      changeHistory: nextChangeHistory,
    },
    mergedMeta
  );
  let updateResult = await admin
    .from("documents")
    .update({
      service_id,
      raw_content: nextRawContent,
      doc_type: normalizeDocType(nextDocType),
      feature_name: nextFeatureName ?? null,
      version: nextVersion ?? null,
      author: nextAuthor ?? null,
      summary: nextSummary ?? null,
    })
    .eq("id", id)
    .eq("workspace_id", resolvedWorkspaceId)
    .select("*, services(name)")
    .single();
  let data = updateResult.data;
  let error = updateResult.error;

  if (error && isWorkspaceSchemaError(error)) {
    updateResult = await admin
      .from("documents")
      .update({
        service_id,
        raw_content: nextRawContent,
        doc_type: normalizeDocType(nextDocType),
        feature_name: nextFeatureName ?? null,
        version: nextVersion ?? null,
        author: nextAuthor ?? null,
        summary: nextSummary ?? null,
      })
      .eq("id", id)
      .select("*, services(name)")
      .single();
    data = updateResult.data;
    error = updateResult.error;
  }

  if (error || !data) {
    console.error("updateDocumentMeta update:", error);
    return null;
  }

  return fetchDocumentById(data.id, resolvedWorkspaceId);
}

export async function deleteDocumentById(id: string, workspaceId = DEFAULT_WORKSPACE_ID): Promise<boolean> {
  const resolvedWorkspaceId = normalizeWorkspaceId(workspaceId);
  const admin = getSupabaseAdmin();
  let fetchResult = await admin
    .from("documents")
    .select("raw_content")
    .eq("id", id)
    .eq("workspace_id", resolvedWorkspaceId)
    .maybeSingle();
  let existingRow = fetchResult.data;
  let fetchError = fetchResult.error;

  if (fetchError && isWorkspaceSchemaError(fetchError)) {
    fetchResult = await admin
      .from("documents")
      .select("raw_content")
      .eq("id", id)
      .maybeSingle();
    existingRow = fetchResult.data;
    fetchError = fetchResult.error;
  }

  if (fetchError) {
    console.error("deleteDocumentById fetch:", fetchError);
    return false;
  }

  let relationDelete = await admin
    .from("doc_relations")
    .delete()
    .eq("workspace_id", resolvedWorkspaceId)
    .or(`from_doc.eq.${id},to_doc.eq.${id}`);

  if (relationDelete.error && isWorkspaceSchemaError(relationDelete.error)) {
    relationDelete = await admin
      .from("doc_relations")
      .delete()
      .or(`from_doc.eq.${id},to_doc.eq.${id}`);
  }

  if (relationDelete.error) {
    console.error("deleteDocumentById relations:", relationDelete.error);
    return false;
  }

  let deleteResult = await admin
    .from("documents")
    .delete()
    .eq("id", id)
    .eq("workspace_id", resolvedWorkspaceId);
  let error = deleteResult.error;

  if (error && isWorkspaceSchemaError(error)) {
    deleteResult = await admin
      .from("documents")
      .delete()
      .eq("id", id);
    error = deleteResult.error;
  }

  if (error) {
    console.error("deleteDocumentById document:", error);
    return false;
  }

  const pointer = existingRow?.raw_content ? parseRawPointer(existingRow.raw_content) : null;
  if (pointer?.detailPath) {
    await deleteStructuredRawDetail(pointer.detailPath);
  }

  return true;
}

export async function createRelations(
  newDocId: string,
  allDocs: DocumentSummary[],
  meta: DocMeta,
  workspaceId = DEFAULT_WORKSPACE_ID
): Promise<void> {
  if (!meta.isDocument || !meta.serviceName || allDocs.length === 0) return;
  const resolvedWorkspaceId = normalizeWorkspaceId(workspaceId);

  const sameService = allDocs.filter(
    (d) =>
      (d.workspaceId ?? resolvedWorkspaceId) === resolvedWorkspaceId &&
      d.meta.serviceName === meta.serviceName &&
      d.id !== newDocId
  );
  if (sameService.length === 0) return;

  const relations = sameService.map((d) => ({
    workspace_id: resolvedWorkspaceId,
    from_doc: newDocId,
    to_doc: d.id,
    relation_type: "linked_service",
  }));

  const { error } = await getSupabaseAdmin()
    .from("doc_relations")
    .upsert(relations, { onConflict: "from_doc,to_doc,relation_type" });

  if (error && isWorkspaceSchemaError(error)) {
    const legacyRelations = sameService.map((d) => ({
      from_doc: newDocId,
      to_doc: d.id,
      relation_type: "linked_service",
    }));
    const legacy = await getSupabaseAdmin()
      .from("doc_relations")
      .upsert(legacyRelations, { onConflict: "from_doc,to_doc,relation_type" });

    if (!legacy.error) return;
  }

  if (error) console.error("createRelations:", error);
}

function buildHistoryEntry(previous: DocMeta, next: DocMeta): DocumentHistoryEntry | null {
  const changes: DocumentHistoryChange[] = [];

  for (const field of Object.keys(HISTORY_FIELD_LABELS) as Array<keyof typeof HISTORY_FIELD_LABELS>) {
    const before = normalizeHistoryValue(field, previous[field]);
    const after = normalizeHistoryValue(field, next[field]);

    if (before === after) continue;

    changes.push({
      field,
      label: HISTORY_FIELD_LABELS[field],
      from: before,
      to: after,
    });
  }

  if (changes.length === 0) return null;

  return {
    id: crypto.randomUUID(),
    changedAt: new Date().toISOString(),
    changes,
  };
}

function normalizeHistoryValue(
  field: keyof typeof HISTORY_FIELD_LABELS,
  value: DocMeta[keyof DocMeta]
) {
  if (field === "dueDate") {
    if (typeof value !== "string" || !value.trim()) return null;
    return value;
  }

  if (typeof value !== "string" || !value.trim()) return null;
  return value.trim();
}
