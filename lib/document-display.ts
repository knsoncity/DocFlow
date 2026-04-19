import { DocumentSummary } from "../app/types";

export function getDocumentTitle(doc: DocumentSummary) {
  return (
    doc.meta.featureName?.trim() ||
    doc.meta.serviceName?.trim() ||
    doc.sourceLabel?.trim() ||
    "이름 없는 자료"
  );
}

export function getDocumentSubtitle(doc: DocumentSummary) {
  const parts = [
    doc.meta.featureName?.trim() ? doc.meta.serviceName?.trim() : undefined,
    doc.meta.version?.trim(),
  ].filter(Boolean);

  if (parts.length > 0) return parts.join(" · ");

  if (!doc.meta.isDocument) {
    return doc.sourceType === "image" ? "이미지 참고자료" : "참고자료";
  }

  return doc.meta.docType ?? "기획 문서";
}

export function getDocumentSummary(doc: DocumentSummary) {
  return (
    doc.meta.summary?.trim() ||
    "아직 요약이 정리되지 않았습니다. 상세 모달에서 원문과 보완 필요 항목을 확인할 수 있습니다."
  );
}
