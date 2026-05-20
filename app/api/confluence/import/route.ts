import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextRequest, NextResponse } from "next/server";
import { DocMeta } from "@/app/types";
import { saveDocument, createRelations, fetchDocuments, toDocumentSummary } from "@/lib/documents";
import { requireWorkspaceAccess, workspaceAccessErrorResponse } from "@/lib/workspace-access";
import { htmlToText } from "../pages/route";

const GEMINI_MODEL = "gemini-2.5-flash-lite";

const IMPORT_SYSTEM_PROMPT = `당신은 Confluence 위키 페이지를 분석해 DocFlow 문서 메타데이터를 추출하는 AI입니다.
주어진 텍스트를 분석해 아래 JSON 형식으로만 응답하세요. 설명 문장 없이 순수 JSON만 반환하세요.

{
  "isDocument": true/false,
  "docType": "PRD|화면정의서|플로우차트|API명세|회의록|기타",
  "serviceName": "서비스명",
  "featureName": "기능명 또는 페이지 제목",
  "version": "버전 (없으면 생략)",
  "author": "작성자 (없으면 생략)",
  "summary": "3줄 이내 핵심 요약",
  "keywords": ["키워드1", "키워드2"],
  "relatedDocTypes": [],
  "completeness": 0-100,
  "missingParts": [],
  "progressState": "대기|진행중|완료|보류|미정",
  "scheduleSummary": "일정 요약 또는 null",
  "deliveryHealth": "red|yellow|green|gray",
  "dueDate": "YYYY-MM-DD 또는 null"
}

- 위키 프로젝트 문서, 기획 페이지, 명세 페이지, 업무 기록이면 isDocument: true
- 단순 메모, 링크 모음, 인덱스 페이지면 isDocument: false
- serviceName은 페이지 내용이나 제목에서 유추하세요.
- featureName은 페이지 제목을 사용하세요.
- 항상 JSON만 출력하세요.`;

async function analyzeWithGemini(title: string, text: string): Promise<DocMeta> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY 미설정");

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });

  const truncated = text.slice(0, 6000);
  const prompt = `페이지 제목: ${title}\n\n내용:\n${truncated}`;

  const result = await model.generateContent([
    { text: IMPORT_SYSTEM_PROMPT },
    { text: prompt },
  ]);
  const raw = result.response.text().trim();

  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as DocMeta;
      if (parsed && typeof parsed === "object" && "isDocument" in parsed) {
        return parsed;
      }
    }
  } catch {
    // fall through to fallback
  }

  return {
    isDocument: true,
    docType: "기타",
    featureName: title,
    summary: text.slice(0, 200),
    keywords: [],
    relatedDocTypes: [],
    completeness: 50,
    missingParts: [],
    progressState: "미정",
    scheduleSummary: undefined,
    deliveryHealth: "gray",
    dueDate: undefined,
  };
}

// POST /api/confluence/import
// body: { baseUrl, pageIds: string[], pat }
export async function POST(req: NextRequest) {
  let workspaceId: string;
  try {
    ({ workspaceId } = await requireWorkspaceAccess(req));
  } catch (error) {
    return workspaceAccessErrorResponse(error);
  }

  const pat = req.headers.get("x-confluence-token");
  if (!pat) {
    return NextResponse.json({ error: "Confluence PAT 토큰이 필요합니다." }, { status: 401 });
  }

  const body = (await req.json()) as {
    baseUrl?: string;
    pageIds?: string[];
  };

  const baseUrl = body.baseUrl?.replace(/\/$/, "");
  const pageIds = body.pageIds;

  if (!baseUrl || !Array.isArray(pageIds) || pageIds.length === 0) {
    return NextResponse.json({ error: "baseUrl과 pageIds가 필요합니다." }, { status: 400 });
  }

  if (pageIds.length > 20) {
    return NextResponse.json({ error: "한 번에 최대 20개까지 가져올 수 있습니다." }, { status: 400 });
  }

  const existingDocs = await fetchDocuments(workspaceId);
  const results: Array<{ pageId: string; status: "ok" | "error"; error?: string; docId?: string }> = [];

  for (const pageId of pageIds) {
    try {
      const contentUrl = `${baseUrl}/rest/api/content/${pageId}?expand=body.view,title`;
      const res = await fetch(contentUrl, {
        headers: {
          Authorization: `Bearer ${pat}`,
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(12000),
      });

      if (!res.ok) {
        results.push({ pageId, status: "error", error: `Confluence 오류 (${res.status})` });
        continue;
      }

      const data = (await res.json()) as {
        title?: string;
        body?: { view?: { value?: string } };
        _links?: { webui?: string };
      };

      const title = data.title ?? `페이지 ${pageId}`;
      const html = data.body?.view?.value ?? "";
      const text = htmlToText(html);
      const pageUrl = data._links?.webui ? `${baseUrl}${data._links.webui}` : undefined;

      const meta = await analyzeWithGemini(title, text);
      if (!meta.featureName) meta.featureName = title;

      const rawContent = {
        isDocument: meta.isDocument,
        sourceType: "url" as const,
        sourceLabel: pageUrl ?? `${baseUrl}/pages/${pageId}`,
        rawContent: text.slice(0, 8000),
      };

      const saved = await saveDocument(rawContent, meta, workspaceId);
      if (!saved) {
        results.push({ pageId, status: "error", error: "문서 저장 실패" });
        continue;
      }

      await createRelations(saved.id, existingDocs, meta, workspaceId);
      existingDocs.push(toDocumentSummary(saved));
      results.push({ pageId, status: "ok", docId: saved.id });
    } catch (e) {
      console.error(`confluence/import pageId=${pageId}:`, e);
      results.push({ pageId, status: "error", error: "가져오기 중 오류가 발생했습니다." });
    }
  }

  const succeeded = results.filter((r) => r.status === "ok").length;
  return NextResponse.json({ results, succeeded, total: pageIds.length });
}
