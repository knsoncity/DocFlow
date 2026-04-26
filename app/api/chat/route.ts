import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenerativeAI } from "@google/generative-ai";
import Groq from "groq-sdk";
import { NextRequest, NextResponse } from "next/server";
import {
  AnalysisSourceType,
  DocMeta,
  DocumentSummary,
  Schedule,
  ScheduleCategory,
  SpreadsheetSheet,
} from "@/app/types";
import {
  createRelations,
  deleteDocumentById,
  fetchDocuments,
  saveDocument,
  toDocumentSummary,
  updateDocumentFields,
} from "@/lib/documents";
import {
  getDocumentSubtitle,
  getDocumentSummary,
  getDocumentTitle,
} from "@/lib/document-display";
import {
  getDday,
  getHealthLabel,
  resolveProgressState,
  resolveScheduleSummary,
} from "@/lib/meta";
import { getAuthUserFromRequest, getDisplayNameFromUser } from "@/lib/auth";
import { requireWorkspaceAccess, workspaceAccessErrorResponse } from "@/lib/workspace-access";
import {
  buildRealtimeReply,
  formatRealtimeLookupContext,
  performRealtimeLookup,
  shouldPerformRealtimeLookup,
} from "@/lib/realtime";

const GEMINI_PRIMARY_MODEL = "gemini-2.5-flash";
const GEMINI_FALLBACK_MODEL = "gemini-2.5-flash-lite";
const ANTHROPIC_FALLBACK_MODEL = "claude-sonnet-4-5";
const GEMINI_RETRY_DELAYS_MS = [600, 1400, 2600];

const ANALYSIS_SYSTEM_PROMPT = `당신은 DocFlow의 AI 코파일럿입니다.
당신의 역할은 단순한 문서 인식기가 아니라, 사용자의 기획/운영 업무를 대화형으로 함께 처리하는 것입니다.

항상 아래 원칙을 지키세요.
- 일반 질문, 브레인스토밍, 우선순위 정리, 일정 상담, 등록된 카드 설명, 다음 액션 제안에는 자연어로 대화형 응답만 하세요.
- 사용자가 모호하면 짧게 되물어도 됩니다.
- 사용자가 이미 등록된 문서나 현재 상태를 물으면 제공된 워크스페이스 컨텍스트를 바탕으로 답하세요.
- 문서/URL/파일/이미지처럼 분석 대상이 주어졌거나, 사용자가 분석/등록/분류를 요청한 경우에만 JSON 블록을 추가하세요.
- JSON이 필요 없는 일반 대화에서는 코드블록 JSON을 절대 출력하지 마세요.

문서 분석이 필요한 경우 응답은 아래 두 파트로 구성하세요.
1. 사용자에게 보여줄 자연어 설명 (마크다운 허용)
2. 구조화된 문서 메타데이터 (JSON 블록)

분류 정책:
- 뉴스 기사, 언론 보도, 칼럼, 일반 보도자료, 기사형 블로그 글은 isDocument: false 로 분류하세요.
- 기사형 신호 예시: 기자명, 입력/수정 시각, 언론사명, 저작권/무단전재 문구, 사건/정세 중심 서술.
- 아래 성격이 뚜렷하면 isDocument: true 로 분류하세요:
  - 제품/서비스 정책 문서
  - API 문서, 엔드포인트, request/response, 파라미터, 스키마 설명
  - 진행사항/진행현황/완료율/담당자/일정 정리
  - 체크리스트, TODO, 우선순위, 작업 리스트
  - 요구사항, 화면 정의, 플로우, 명세서
- 기사와 기획문서 신호가 동시에 보여도 기사형 신호가 강하면 참고자료로 분류하세요.

JSON 블록 형식:
\`\`\`json
{
  "isDocument": true/false,
  "docType": "PRD|화면정의서|플로우차트|API명세|회의록|기타",
  "serviceName": "서비스명",
  "featureName": "기능명 (있을 경우)",
  "version": "버전 (있을 경우)",
  "author": "작성자 (있을 경우)",
  "summary": "3줄 이내 핵심 요약",
  "keywords": ["키워드1", "키워드2", ...],
  "relatedDocTypes": ["연관될 문서 타입들"],
  "completeness": 0-100,
  "missingParts": ["빠진 항목들"],
  "progressState": "대기|진행중|완료|보류|미정",
  "scheduleSummary": "일정 요약 또는 마감 정보",
  "deliveryHealth": "red|yellow|green|gray",
  "dueDate": "YYYY-MM-DD 형식의 마감일 또는 null"
}
\`\`\`

문서가 아닌 일반 질문이면 isDocument: false로 설정하고 JSON 나머지는 생략.
항상 한국어로 응답하세요.`;

const GENERAL_CHAT_SYSTEM_PROMPT = `당신은 한국어로 대화하는 유능한 AI 어시스턴트입니다.
- 일반 질문, 상식, 설명, 브레인스토밍, 글쓰기, 기획 상담에 자연스럽게 답하세요.
- 사용자를 다른 앱으로 밀어내는 답변을 먼저 하지 마세요.
- 실시간 조회 결과가 제공되면 그 내용을 우선 사용하세요.
- 날씨 질문이 들어오면 "확인할 수 없다"고 하지 말고 어느 지역인지 되물어보세요.
- "실시간 정보에 접근할 수 없습니다" 같은 말은 절대 하지 마세요.
- 문서 분석 요청이 아니면 JSON, 코드블록, 메타데이터를 출력하지 마세요.
- 항상 한국어로 응답하세요.`;

const WORKSPACE_CHAT_SYSTEM_PROMPT = `당신은 DocFlow 안에서 동작하는 한국어 AI 코파일럿입니다.
- 사용자가 등록한 문서, 카드, 일정, 상태, 관계를 설명하고 정리하는 대화형 비서처럼 답하세요.
- 제공된 워크스페이스 컨텍스트를 우선 참고하세요.
- 컨텍스트에 없는 사실은 단정하지 말고 없다고 말하세요.
- 일반 질문이라도 답할 수 있으면 자연스럽게 답하되, 문서 분석 요청이 아니면 JSON을 출력하지 마세요.
- 항상 한국어로 응답하세요.`;

const REALTIME_LOOKUP_SYSTEM_PROMPT = `당신은 한국어로 대화하는 AI 어시스턴트입니다.
사용자 메시지 아래에 외부 서버에서 이미 조회 완료된 실시간 데이터가 [실시간 조회 결과] 형태로 제공됩니다.

절대 규칙:
- [실시간 조회 결과]의 데이터는 방금 실제로 조회된 최신 정보입니다. 반드시 이 데이터를 기반으로 답하세요.
- "실시간 정보에 접근할 수 없다", "확인할 수 없다", "인터넷에 연결되지 않았다" 같은 말을 절대 하지 마세요.
- 데이터가 있으면 그 내용을 자연스럽게 요약해서 답하세요.
- 날씨 데이터가 있으면 기온, 날씨 상태, 습도 등을 친근하게 알려주세요.
- 문서 분석 요청이 아니면 JSON, 코드블록은 출력하지 마세요.
- 항상 한국어로 응답하세요.`;

const OCR_PROMPT = `다음 이미지들에서 읽을 수 있는 텍스트를 최대한 정확하게 추출하세요.
- 출력은 순수 텍스트만 반환하세요.
- 설명, 요약, 마크다운, 코드블록은 넣지 마세요.
- 여러 이미지라면 읽은 순서대로 이어서 정리하세요.`;

const ACTION_SYSTEM_PROMPT = `당신은 DocFlow의 문서 액션 플래너입니다.
사용자의 마지막 요청이 "이미 등록된 카드/문서"를 실제로 수정하거나 삭제하라는 명령인지 판별하세요.

지원 작업:
- create: 새 카드/문서/참고자료 생성
- update: 진행여부(progressState), 색상 상태(deliveryHealth), 일정(dueDate), 제목(title), 문서 유형(docType), 요약(summary), 서비스명(serviceName), 승격/강등(isDocument) 변경
- delete: 문서/카드 삭제

규칙:
- 사용자가 명시적으로 변경/수정/삭제를 요청한 경우에만 actions를 생성하세요.
- 사용자가 "새 카드", "새 문서", "새 작업", "등록해줘", "만들어줘"처럼 명시적으로 생성 요청하면 create action을 생성하세요.
- 문서 분석, 요약, 설명, 조언, 브레인스토밍은 actions 없이 반환하세요.
- create가 아닌 경우에는 워크스페이스 목록에 있는 targetDocId만 사용하세요.
- 대상이 모호하면 절대 임의 실행하지 말고 needsClarification: true 로 돌려주세요.
- 여러 필드 변경은 하나의 update action 안에 함께 담으세요.
- dueDate는 YYYY-MM-DD 또는 null만 허용합니다.
- progressState는 "대기" | "진행중" | "완료" | "보류" | "미정" 중 하나만 허용합니다.
- deliveryHealth는 "red" | "yellow" | "green" | "gray" 중 하나만 허용합니다.
- docType은 "PRD" | "화면정의서" | "플로우차트" | "API명세" | "회의록" | "기타" 중 하나만 허용합니다.
- title은 카드에서 보이는 제목입니다. 제목 변경은 updates.title에 넣으세요.
- 참고자료를 기획문서로 올리려면 updates.isDocument=true 와 함께 필요하면 docType, serviceName, title도 채우세요.
- 출력은 순수 JSON만 반환하세요. 설명 문장, 마크다운, 코드블록 금지.

반환 형식:
{
  "needsClarification": boolean,
  "clarificationQuestion": "모호할 때만",
  "actions": [
    {
      "operation": "create" | "update" | "delete",
      "targetDocId": "정확한 문서 id, create면 생략 가능",
      "targetTitle": "문서 제목 또는 create 대상 제목",
      "create": {
        "title": "새 카드 제목",
        "serviceName": "서비스명",
        "summary": "핵심 요약",
        "docType": "PRD",
        "isDocument": true,
        "progressState": "대기",
        "deliveryHealth": "gray",
        "dueDate": null
      },
      "updates": {
        "progressState": "진행중",
        "deliveryHealth": "yellow",
        "dueDate": "2026-04-30",
        "title": "새 제목",
        "serviceName": "서비스명",
        "docType": "PRD",
        "summary": "새 요약",
        "isDocument": true
      }
    }
  ]
}`;

type ChatRequestMessage = {
  role: "user" | "assistant";
  content: string;
};

type ImagePayload = {
  data: string;
  mimeType: string;
  name?: string;
  previewUrl?: string;
};

type SpreadsheetPayload = {
  sheets: SpreadsheetSheet[];
};

type DocumentActionOperation = "create" | "update" | "delete";

type DocumentActionFields = {
  progressState?: string;
  deliveryHealth?: "red" | "yellow" | "green" | "gray";
  dueDate?: string | null;
  title?: string;
  serviceName?: string | null;
  docType?: DocMeta["docType"];
  summary?: string | null;
  isDocument?: boolean;
};

type DocumentAction = {
  operation: DocumentActionOperation;
  targetDocId?: string;
  targetTitle?: string;
  create?: DocumentActionFields;
  updates?: DocumentActionFields;
};

type DocumentActionPlan = {
  needsClarification?: boolean;
  clarificationQuestion?: string;
  actions?: DocumentAction[];
};

const ARTICLE_PATTERNS = [
  /(?:^|\s)(?:기자|특파원)(?:\s|$)/i,
  /입력\s*\d{4}[./-]\d{1,2}[./-]\d{1,2}/i,
  /수정\s*\d{4}[./-]\d{1,2}[./-]\d{1,2}/i,
  /연합뉴스|뉴시스|뉴스1|노컷뉴스|이데일리|머니투데이|한국경제|매일경제|서울경제|한겨레|경향신문|조선일보|중앙일보|동아일보|SBS|KBS|MBC|YTN|JTBC/i,
  /무단전재|재배포 금지|저작권자|기사원문|관련기사/i,
];

const PLANNING_PATTERNS = [
  /정책|운영정책|권한정책|개인정보처리방침|약관/i,
  /\bapi\b|엔드포인트|request|response|parameter|schema|payload|header|status code/i,
  /진행사항|진행상황|진행 현황|완료율|담당자|담당 부서|마일스톤|릴리즈|일정/i,
  /체크리스트|작업 리스트|리스트|todo|to do|백로그|우선순위/i,
  /요구사항|명세서|화면정의|플로우|시나리오|user story|acceptance criteria/i,
];

const LIST_PATTERN = /(^|\n)\s*(?:[-*•]|[0-9]+[.)])\s+\S/m;
const SCHEDULE_HINT_PATTERN =
  /일정|스케줄|캘린더|schedule|미팅|회의|출장|휴가|리뷰|스프린트|데모|발표|오전|오후|내일|모레|다음주|이번주|월요일|화요일|수요일|목요일|금요일|토요일|일요일|\d+월\s*\d+일/i;

const SCHEDULE_SYSTEM_PROMPT = `오늘 날짜: ${new Date().toISOString().slice(0, 10)}
당신은 사용자의 자연어 메시지에서 개인 업무 일정을 파싱하는 AI입니다.
사용자가 일정 등록 의도를 표현하면 JSON으로만 응답하세요.
일정 등록 의도가 없으면 {"isSchedule": false} 만 반환하세요.

반환 형식:
{
  "isSchedule": true,
  "title": "일정 제목",
  "startDate": "YYYY-MM-DD",
  "endDate": "YYYY-MM-DD",
  "category": "업무|회의|리뷰|출장|휴가|기타",
  "note": "메모 (없으면 생략)"
}

규칙:
- 오늘/내일/모레/다음주 등 상대 날짜를 오늘 기준으로 절대 날짜로 변환하세요.
- 종료일이 없으면 startDate와 동일하게 설정하세요.
- 출력은 순수 JSON만, 설명·마크다운 금지.`;

const ACTION_HINT_PATTERN =
  /삭제|지워|제거|없애|바꿔|변경|수정|업데이트|완료로|진행중으로|대기로|보류로|빨강|빨간|노랑|노란|초록|녹색|회색|일정|마감|날짜|due date|미뤄|연기|앞당겨|새 카드|새 문서|새 작업|등록해|만들어|승격|올려줘|기획문서로|참고자료로|제목/i;
const WORKSPACE_QUERY_PATTERN =
  /등록된|문서|카드|참고자료|관계도|서비스|일정|상태|지연|진행중|완료|목록|보드|workspace|작성자/i;
function extractStructuredJsonCandidates(text: string) {
  const matches = Array.from(
    text.matchAll(/```(?:json|action|docflow-action)?\s*([\s\S]*?)```/gi)
  ).map((match) => match[1].trim());

  return [text.trim(), ...matches].filter(Boolean);
}

function parseDocMeta(text: string): DocMeta | null {
  for (const candidate of extractStructuredJsonCandidates(text)) {
    try {
      const parsed = JSON.parse(candidate) as DocMeta;
      if (parsed && typeof parsed === "object" && "isDocument" in parsed) {
        return parsed;
      }
    } catch {
      continue;
    }
  }

  return null;
}

function parseActionPlan(text: string): DocumentActionPlan | null {
  for (const candidate of extractStructuredJsonCandidates(text)) {
    try {
      const parsed = JSON.parse(candidate) as DocumentActionPlan;
      if (parsed && typeof parsed === "object" && ("actions" in parsed || "needsClarification" in parsed)) {
        return parsed;
      }
    } catch {
      continue;
    }
  }

  return null;
}

function cleanAssistantText(text: string) {
  return text
    .replace(/```(?:json|action|docflow-action)\s*[\s\S]*?```/gi, "")
    .trim();
}

function truncateForPrompt(text: string, maxLength: number) {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength)}...`;
}

function buildFallbackMeta(text: string): DocMeta {
  const cleaned = cleanAssistantText(text);
  const summary = cleaned
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 220);

  return {
    isDocument: false,
    docType: "기타",
    summary: summary || "기획 문서는 아니지만 참고자료로 저장된 항목입니다.",
    keywords: [],
    relatedDocTypes: [],
    completeness: 0,
    missingParts: [],
    progressState: "미정",
    scheduleSummary: "일정 없음",
    deliveryHealth: "gray",
    dueDate: undefined,
  };
}

function buildSummary(text: string, fallback: string) {
  const normalized = text.replace(/\s+/g, " ").trim();
  return normalized ? normalized.slice(0, 220) : fallback;
}

function sanitizeHistoryMessage(message: ChatRequestMessage) {
  const content =
    message.role === "assistant"
      ? cleanAssistantText(message.content)
      : message.content.trim();

  return {
    ...message,
    content: truncateForPrompt(content, message.role === "assistant" ? 700 : 1000),
  };
}

function buildWorkspaceContext(docs: DocumentSummary[]) {
  const recentDocs = docs.slice(0, 12);
  const documentCount = docs.filter((doc) => doc.meta.isDocument).length;
  const referenceCount = docs.length - documentCount;
  const delayedCount = docs.filter((doc) => getHealthLabel(doc.meta.deliveryHealth ?? "gray") === "지연").length;
  const inProgressCount = docs.filter((doc) => resolveProgressState(doc.meta) === "진행중").length;

  const items = recentDocs.map((doc, index) => {
    const title = getDocumentTitle(doc);
    const subtitle = getDocumentSubtitle(doc);
    const summary = truncateForPrompt(getDocumentSummary(doc), 90);
    const typeLabel = doc.meta.isDocument ? doc.meta.docType ?? "기타" : "참고자료";
    const progress = resolveProgressState(doc.meta);
    const schedule = resolveScheduleSummary(doc.meta);
    const dday = getDday(doc.meta) ?? "-";
    const author = doc.meta.author ?? "미정";

    return `${index + 1}. ${title}
- 보조 정보: ${subtitle}
- 유형: ${typeLabel}
- 진행여부: ${progress}
- 상태: ${getHealthLabel(doc.meta.deliveryHealth ?? "gray")}
- 일정: ${schedule}
- D-day: ${dday}
- 작성자: ${author}
- 요약: ${summary}`;
  });

  return `현재 DocFlow 워크스페이스 요약
- 등록 전체: ${docs.length}개
- 기획 문서: ${documentCount}개
- 참고자료: ${referenceCount}개
- 진행중: ${inProgressCount}개
- 지연: ${delayedCount}개

최근 등록 문서
${items.length > 0 ? items.join("\n") : "- 등록된 문서 없음"}`;
}

function buildActionWorkspaceContext(docs: DocumentSummary[]) {
  const items = docs.slice(0, 60).map((doc, index) => {
    const title = getDocumentTitle(doc);
    const subtitle = getDocumentSubtitle(doc);
    const typeLabel = doc.meta.isDocument ? doc.meta.docType ?? "기타" : "참고자료";
    const progress = resolveProgressState(doc.meta);
    const health = getHealthLabel(doc.meta.deliveryHealth ?? "gray");
    const dueDate = doc.meta.dueDate ?? "-";

    return `${index + 1}. id=${doc.id}
- title=${title}
- subtitle=${subtitle}
- type=${typeLabel}
- progress=${progress}
- health=${health}
- dueDate=${dueDate}`;
  });

  return items.join("\n");
}

function buildConversationTranscript(messages: ChatRequestMessage[]) {
  const recentMessages = messages.slice(-8).map(sanitizeHistoryMessage);

  if (recentMessages.length === 0) {
    return "최근 대화 없음";
  }

  return recentMessages
    .map((message) => `${message.role === "user" ? "사용자" : "어시스턴트"}: ${message.content || "(빈 메시지)"}`)
    .join("\n\n");
}

function buildAnalysisInstructions(
  prompt: string,
  sourceType?: AnalysisSourceType,
  sourceLabel?: string,
  hasImages?: boolean,
  analysisContent?: string
) {
  const normalizedPrompt = prompt.toLowerCase();
  const hasAttachedSource = Boolean(sourceType || hasImages);
  const hasSeparateMaterial = Boolean(
    analysisContent?.trim() && analysisContent.trim() !== prompt.trim()
  );
  const looksLikePastedDocument =
    prompt.length > 320 || (prompt.includes("\n") && LIST_PATTERN.test(prompt));
  const likelyAnalysisRequest =
    hasAttachedSource ||
    /분석|등록|분류|정리|요약|문서화|카드|저장|ocr|읽어줘|판단/.test(prompt) ||
    hasSeparateMaterial ||
    looksLikePastedDocument;

  if (likelyAnalysisRequest) {
    return `현재 요청은 분석 또는 등록 가능성이 높습니다.
- 제공된 자료가 실제 문서/참고자료라면 자연어 설명 뒤에 JSON 블록을 추가하세요.
- sourceType: ${sourceType ?? (hasImages ? "image" : "text")}
- sourceLabel: ${sourceLabel ?? "없음"}
- 자료가 기획문서가 아니면 isDocument: false로 두고 참고자료 성격을 설명하세요.`;
  }

  if (/현재|목록|등록|문서|카드|일정|상태/.test(normalizedPrompt)) {
    return `현재 요청은 워크스페이스 기반 질의일 가능성이 큽니다.
- 제공된 워크스페이스 컨텍스트를 우선 참고해 답하세요.
- 이 경우 JSON 블록 없이 대화형 응답만 하세요.`;
  }

  return `현재 요청은 일반 대화 또는 기획 상담입니다.
- 먼저 대화형으로 답하세요.
- JSON 블록은 출력하지 마세요.`;
}

type ChatMode = "analysis" | "workspace" | "general";

function detectChatMode({
  prompt,
  sourceType,
  hasImages,
  analysisContent,
}: {
  prompt: string;
  sourceType?: AnalysisSourceType;
  hasImages?: boolean;
  analysisContent?: string;
}): ChatMode {
  const normalizedPrompt = prompt.toLowerCase();
  const hasAttachedSource = Boolean(sourceType || hasImages);
  const hasSeparateMaterial = Boolean(
    analysisContent?.trim() && analysisContent.trim() !== prompt.trim()
  );
  const looksLikePastedDocument =
    prompt.length > 320 || (prompt.includes("\n") && LIST_PATTERN.test(prompt));

  if (
    hasAttachedSource ||
    hasSeparateMaterial ||
    looksLikePastedDocument ||
    /분석|등록|분류|ocr|파싱|읽어줘|추출|판단/.test(normalizedPrompt)
  ) {
    return "analysis";
  }

  if (
    WORKSPACE_QUERY_PATTERN.test(normalizedPrompt) &&
    !shouldPerformRealtimeLookup(prompt)
  ) {
    return "workspace";
  }

  return "general";
}

function buildModelPrompt({
  mode,
  messages,
  prompt,
  analysisContent,
  sourceType,
  sourceLabel,
  userPrompt,
  workspaceContext,
}: {
  mode: ChatMode;
  messages: ChatRequestMessage[];
  prompt: string;
  analysisContent?: string;
  sourceType?: AnalysisSourceType;
  sourceLabel?: string;
  userPrompt?: string;
  workspaceContext: string;
}) {
  const material =
    analysisContent?.trim() && analysisContent.trim() !== prompt.trim()
      ? analysisContent.trim()
      : undefined;

  if (mode === "general") {
    return `[최근 대화]
${buildConversationTranscript(messages)}

[현재 사용자 요청]
${prompt}`.trim();
  }

  if (mode === "workspace") {
    return `[DocFlow 워크스페이스 컨텍스트]
${workspaceContext}

[최근 대화]
${buildConversationTranscript(messages)}

[현재 사용자 요청]
${prompt}`.trim();
  }

  return `[응답 모드]
${buildAnalysisInstructions(prompt, sourceType, sourceLabel, sourceType === "image", analysisContent)}

[워크스페이스 컨텍스트]
${workspaceContext}

[최근 대화]
${buildConversationTranscript(messages)}

[현재 사용자 요청]
${prompt}

${sourceType ? `[입력 소스]\n- sourceType: ${sourceType}\n- sourceLabel: ${sourceLabel ?? "없음"}\n` : ""}
${userPrompt ? `[사용자 부연 설명]\n${userPrompt}\n` : ""}
${material ? `[제공 자료 원문]\n${material}\n` : ""}`.trim();
}

function buildActionPlannerPrompt({
  messages,
  prompt,
  docs,
}: {
  messages: ChatRequestMessage[];
  prompt: string;
  docs: DocumentSummary[];
}) {
  return `[최근 대화]
${buildConversationTranscript(messages)}

[마지막 사용자 요청]
${prompt}

[현재 워크스페이스 문서 목록]
${buildActionWorkspaceContext(docs) || "등록된 문서 없음"}`.trim();
}

function countPatternMatches(text: string, patterns: RegExp[]) {
  return patterns.reduce((count, pattern) => count + (pattern.test(text) ? 1 : 0), 0);
}

function inferDocType(text: string): DocMeta["docType"] {
  if (/\bapi\b|엔드포인트|request|response|schema|payload/i.test(text)) {
    return "API명세";
  }
  if (/화면정의|와이어프레임|ui|ux|페이지|screen|layout/i.test(text)) {
    return "화면정의서";
  }
  if (/플로우|flow|시퀀스|sequence|사용자 여정|user flow/i.test(text)) {
    return "플로우차트";
  }
  if (/회의록|회의 내용|회의 안건|액션 아이템|action item/i.test(text)) {
    return "회의록";
  }
  if (/정책|요구사항|체크리스트|백로그|우선순위|기획/i.test(text)) {
    return "PRD";
  }
  return "기타";
}

function buildReferenceMeta(meta: DocMeta, text: string): DocMeta {
  return {
    ...meta,
    isDocument: false,
    docType: "기타",
    serviceName: undefined,
    featureName: undefined,
    version: undefined,
    summary:
      meta.summary ??
      buildSummary(text, "뉴스 기사나 일반 참고자료로 분류된 항목입니다."),
    keywords: meta.keywords ?? [],
    relatedDocTypes: [],
    completeness: 0,
    missingParts: [],
    progressState: "참고자료",
    scheduleSummary: "일정 없음",
    deliveryHealth: "gray",
    dueDate: undefined,
  };
}

function buildPlanningMeta(meta: DocMeta, text: string): DocMeta {
  return {
    ...meta,
    isDocument: true,
    docType:
      meta.docType && meta.docType !== "기타"
        ? meta.docType
        : inferDocType(text),
    summary:
      meta.summary ??
      buildSummary(text, "기획 문서로 분류된 항목입니다."),
    keywords: meta.keywords ?? [],
    relatedDocTypes: meta.relatedDocTypes ?? [],
    completeness:
      typeof meta.completeness === "number" ? meta.completeness : 35,
    missingParts: meta.missingParts ?? [],
    progressState: meta.progressState ?? "미정",
    scheduleSummary: meta.scheduleSummary ?? "일정 미기재",
    deliveryHealth: meta.deliveryHealth ?? "gray",
    dueDate: meta.dueDate,
  };
}

function applyClassificationPolicy(
  meta: DocMeta,
  text: string,
  sourceType?: AnalysisSourceType
) {
  const normalizedText = text.toLowerCase();
  const articleScore = countPatternMatches(normalizedText, ARTICLE_PATTERNS);
  const planningScore = countPatternMatches(normalizedText, PLANNING_PATTERNS);
  const hasListSignal = LIST_PATTERN.test(text);

  const shouldForceReference =
    (sourceType === "url" && articleScore >= 2) || articleScore >= 3;

  if (shouldForceReference) {
    return buildReferenceMeta(meta, text);
  }

  if (planningScore >= 1 || hasListSignal) {
    return buildPlanningMeta(meta, text);
  }

  return meta;
}

function shouldPersistNonDocument(sourceType?: AnalysisSourceType) {
  return sourceType === "file" || sourceType === "image" || sourceType === "url";
}

function resolveAuthorName(authorName?: string) {
  const normalized = authorName?.trim();
  return normalized ? normalized : undefined;
}

function createGeminiTextModel(
  modelName = GEMINI_PRIMARY_MODEL,
  systemInstruction = GENERAL_CHAT_SYSTEM_PROMPT
) {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
  return genAI.getGenerativeModel({
    model: modelName,
    systemInstruction,
  });
}

function createGeminiAnalysisModel(modelName = GEMINI_PRIMARY_MODEL) {
  return createGeminiTextModel(modelName, ANALYSIS_SYSTEM_PROMPT);
}

function createGeminiOcrModel(modelName = GEMINI_PRIMARY_MODEL) {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
  return genAI.getGenerativeModel({
    model: modelName,
  });
}

function createAnthropicClient() {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
}

function toInlineParts(images: ImagePayload[]) {
  return images.map((image) => ({
    inlineData: {
      data: image.data,
      mimeType: image.mimeType,
    },
  }));
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isGeminiUnavailableError(error: unknown) {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return message.includes("503") || message.includes("service unavailable") || message.includes("unavailable");
}

function isGeminiRateLimitOrQuotaError(error: unknown) {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return (
    message.includes("429") ||
    message.includes("too many requests") ||
    message.includes("quota exceeded") ||
    message.includes("current quota") ||
    message.includes("rate limit") ||
    message.includes("generate_content_free_tier_requests")
  );
}

function isGeminiStreamParseError(error: unknown) {
  if (!(error instanceof Error)) return false;
  return error.message.toLowerCase().includes("failed to parse stream");
}

function isGroqRateLimitOrUnavailableError(error: unknown) {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return (
    message.includes("429") ||
    message.includes("rate limit") ||
    message.includes("rate_limit_exceeded") ||
    message.includes("tokens per day") ||
    message.includes("503") ||
    message.includes("service unavailable")
  );
}

async function withGeminiFallback<T>(operation: (modelName: string) => Promise<T>) {
  let lastError: unknown;

  for (let attempt = 0; attempt <= GEMINI_RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      return await operation(GEMINI_PRIMARY_MODEL);
    } catch (error) {
      lastError = error;
      if (!isGeminiUnavailableError(error) || attempt === GEMINI_RETRY_DELAYS_MS.length) {
        break;
      }
      await sleep(GEMINI_RETRY_DELAYS_MS[attempt]);
    }
  }

  if (isGeminiUnavailableError(lastError) || isGeminiRateLimitOrQuotaError(lastError)) {
    return operation(GEMINI_FALLBACK_MODEL);
  }

  throw lastError;
}

function canUseAnthropicFallback() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

function toAnthropicImageBlocks(images: ImagePayload[]) {
  return images.map((image) => ({
    type: "image" as const,
    source: {
      type: "base64" as const,
      media_type: image.mimeType as "image/png" | "image/jpeg" | "image/webp" | "image/gif",
      data: image.data,
    },
  }));
}

async function completeWithAnthropic(
  prompt: string,
  systemPrompt = GENERAL_CHAT_SYSTEM_PROMPT,
  maxTokens = 2048
) {
  const client = createAnthropicClient();
  const message = await client.messages.create({
    model: ANTHROPIC_FALLBACK_MODEL,
    max_tokens: maxTokens,
    system: systemPrompt,
    messages: [{ role: "user", content: prompt }],
  });

  return extractAnthropicText(message.content);
}

async function extractOcrTextWithAnthropic(images: ImagePayload[]) {
  const client = createAnthropicClient();
  const message = await client.messages.create({
    model: ANTHROPIC_FALLBACK_MODEL,
    max_tokens: 4096,
    messages: [
      {
        role: "user",
        content: [{ type: "text", text: OCR_PROMPT }, ...toAnthropicImageBlocks(images)],
      },
    ],
  });

  return extractAnthropicText(message.content).trim();
}

async function analyzeImagesWithAnthropic(prompt: string, ocrText: string, images: ImagePayload[]) {
  const client = createAnthropicClient();
  const message = await client.messages.create({
    model: ANTHROPIC_FALLBACK_MODEL,
    max_tokens: 2048,
    system: ANALYSIS_SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `${prompt}

[OCR 추출 원문]
${ocrText || "추출된 텍스트 없음"}

위 OCR 원문과 첨부 이미지를 함께 참고해서 분석하세요.`,
          },
          ...toAnthropicImageBlocks(images),
        ],
      },
    ],
  });

  return extractAnthropicText(message.content).trim();
}

function extractAnthropicText(content: Array<{ type: string; text?: string }>) {
  return content
    .filter((block) => block.type === "text" && typeof block.text === "string")
    .map((block) => block.text)
    .join("");
}

function getRetryDelaySeconds(error: unknown) {
  if (!(error instanceof Error)) return null;

  const minuteSecondMatch = error.message.match(/retry in (\d+)m([\d.]+)s/i);
  if (minuteSecondMatch) {
    return Math.ceil(Number(minuteSecondMatch[1]) * 60 + Number(minuteSecondMatch[2]));
  }

  const secondMatch = error.message.match(/retry in ([\d.]+)s/i);
  if (secondMatch) {
    return Math.ceil(Number(secondMatch[1]));
  }

  const retryDelayMatch = error.message.match(/"retryDelay":"(\d+)s"/i);
  if (retryDelayMatch) {
    return Math.ceil(Number(retryDelayMatch[1]));
  }

  return null;
}

function formatRetryDelay(seconds: number) {
  if (seconds < 60) return `약 ${seconds}초 후`;

  const minutes = Math.floor(seconds / 60);
  const remainSeconds = seconds % 60;
  if (remainSeconds === 0) return `약 ${minutes}분 후`;

  return `약 ${minutes}분 ${remainSeconds}초 후`;
}

function toUserFacingErrorMessage(error: unknown) {
  if (!(error instanceof Error)) {
    return "AI 분석 중 오류가 발생했습니다.";
  }

  const retryDelaySeconds = getRetryDelaySeconds(error);

  if (isGeminiRateLimitOrQuotaError(error)) {
    return retryDelaySeconds
      ? `Gemini 사용량 한도에 도달했습니다. ${formatRetryDelay(retryDelaySeconds)} 다시 시도해 주세요.`
      : "Gemini 사용량 한도에 도달했습니다. 잠시 후 다시 시도해 주세요.";
  }

  if (isGeminiStreamParseError(error)) {
    return "Gemini 응답 스트림이 중간에 끊겼습니다. 다시 시도해 주세요.";
  }

  if (isGroqRateLimitOrUnavailableError(error)) {
    return retryDelaySeconds
      ? `AI 분석 요청이 몰려 있습니다. ${formatRetryDelay(retryDelaySeconds)} 다시 시도해 주세요.`
      : "AI 분석 요청이 몰려 있습니다. 잠시 후 다시 시도해 주세요.";
  }

  return error.message || "AI 분석 중 오류가 발생했습니다.";
}

async function completeText(prompt: string, systemPrompt: string, maxTokens = 1024) {
  try {
    const client = new Groq({ apiKey: process.env.GROQ_API_KEY });
    const completion = await client.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: prompt },
      ],
      max_tokens: maxTokens,
    });

    const content = completion.choices[0]?.message?.content;
    if (typeof content === "string") return content;
    return "";
  } catch (error) {
    if (!isGroqRateLimitOrUnavailableError(error)) {
      throw error;
    }
  }

  try {
    const response = await withGeminiFallback(async (modelName) => {
      const model = createGeminiTextModel(modelName, systemPrompt);
      return model.generateContent([{ text: prompt }]);
    });

    return response.response.text().trim();
  } catch (error) {
    if (!canUseAnthropicFallback()) throw error;
    if (!isGeminiUnavailableError(error) && !isGeminiRateLimitOrQuotaError(error)) throw error;
    return completeWithAnthropic(prompt, systemPrompt, maxTokens);
  }
}

function shouldAttemptDocumentAction(prompt: string, sourceType?: AnalysisSourceType, hasImages?: boolean) {
  if (sourceType || hasImages) return false;
  return ACTION_HINT_PATTERN.test(prompt);
}

async function detectDocumentActionPlan(
  prompt: string,
  messages: ChatRequestMessage[],
  docs: DocumentSummary[]
) {
  if (!shouldAttemptDocumentAction(prompt)) {
    return null;
  }

  try {
    const plannerPrompt = buildActionPlannerPrompt({ messages, prompt, docs });
    const result = await completeText(plannerPrompt, ACTION_SYSTEM_PROMPT, 900);
    return parseActionPlan(result);
  } catch (error) {
    console.error("detectDocumentActionPlan:", error);
    return null;
  }
}

function normalizeActionPlan(plan: DocumentActionPlan | null) {
  if (!plan) return null;

  return {
    needsClarification: Boolean(plan.needsClarification),
    clarificationQuestion: plan.clarificationQuestion?.trim(),
    actions: (plan.actions ?? []).filter((action) => {
      if (!action?.operation) return false;
      if (action.operation === "create") {
        return Boolean(action.create?.title?.trim());
      }
      if (!action.targetDocId) return false;
      if (action.operation === "update") {
        return Boolean(
          action.updates &&
            (action.updates.progressState ||
              action.updates.deliveryHealth ||
              action.updates.dueDate !== undefined ||
              action.updates.title ||
              action.updates.serviceName !== undefined ||
              action.updates.docType ||
              action.updates.summary !== undefined ||
              typeof action.updates.isDocument === "boolean")
        );
      }
      return action.operation === "delete";
    }),
  };
}

function buildUpdateSummaryLine(doc: DocumentSummary, updates: DocumentActionFields) {
  const changes: string[] = [];

  if (updates.progressState) {
    changes.push(`진행여부를 ${updates.progressState}로`);
  }
  if (updates.deliveryHealth) {
    changes.push(`상태를 ${getHealthLabel(updates.deliveryHealth)}로`);
  }
  if (updates.dueDate !== undefined) {
    changes.push(
      updates.dueDate ? `일정을 ${updates.dueDate}로` : "일정을 비우는 것으로"
    );
  }
  if (updates.title?.trim()) {
    changes.push(`제목을 ${updates.title.trim()}로`);
  }
  if (updates.serviceName !== undefined) {
    changes.push(
      updates.serviceName?.trim()
        ? `서비스를 ${updates.serviceName.trim()}로`
        : "서비스 분류를 비우는 것으로"
    );
  }
  if (updates.docType) {
    changes.push(`문서 유형을 ${updates.docType}로`);
  }
  if (updates.summary !== undefined) {
    changes.push(
      updates.summary?.trim() ? "요약을 갱신하는 것으로" : "요약을 비우는 것으로"
    );
  }
  if (typeof updates.isDocument === "boolean") {
    changes.push(updates.isDocument ? "기획문서로 승격하는 것으로" : "참고자료로 변경하는 것으로");
  }

  return `- ${getDocumentTitle(doc)}: ${changes.join(", ")} 변경했습니다.`;
}

function buildCreateSummaryLine(doc: DocumentSummary) {
  return `- ${getDocumentTitle(doc)} 카드를 새로 만들었습니다.`;
}

function buildCreateMetaFromAction(
  create: DocumentActionFields,
  authorName?: string
): DocMeta {
  const isDocument = create.isDocument ?? true;
  const title = create.title?.trim() || "새 카드";
  const summary = create.summary?.trim() || "채팅에서 생성한 카드입니다.";

  return {
    isDocument,
    docType: create.docType ?? "기타",
    serviceName: create.serviceName?.trim() || undefined,
    featureName: title,
    author: authorName,
    summary,
    keywords: [],
    relatedDocTypes: [],
    completeness: isDocument ? 15 : 0,
    missingParts: [],
    progressState: create.progressState ?? (isDocument ? "대기" : "참고자료"),
    scheduleSummary: create.dueDate ? `마감 ${create.dueDate}` : isDocument ? "일정 미기재" : "일정 없음",
    deliveryHealth: create.deliveryHealth ?? "gray",
    dueDate: create.dueDate ?? undefined,
  };
}

async function executeDocumentActions(
  actions: DocumentAction[],
  currentDocs: DocumentSummary[],
  authorName: string | undefined,
  workspaceId: string
) {
  const createdDocs: DocumentSummary[] = [];
  const updatedDocs: DocumentSummary[] = [];
  const deletedDocIds: string[] = [];
  const summaryLines: string[] = [];
  let workingDocs = [...currentDocs];

  for (const action of actions) {
    if (action.operation === "create") {
      if (!action.create?.title?.trim()) continue;

      const meta = buildCreateMetaFromAction(action.create, authorName);
      const rawContent = [
        `채팅 생성 카드: ${action.create.title.trim()}`,
        action.create.summary?.trim() ? `요약: ${action.create.summary.trim()}` : "",
      ]
        .filter(Boolean)
        .join("\n");

      const createdDoc = await saveDocument(
        {
          isDocument: meta.isDocument,
          sourceType: "text",
          sourceLabel: "chat-action-create",
          rawContent,
          metaSnapshot: {
            progressState: meta.progressState,
            scheduleSummary: meta.scheduleSummary,
            deliveryHealth: meta.deliveryHealth,
            dueDate: meta.dueDate,
          },
          changeHistory: [],
        },
        meta,
        workspaceId
      );

      if (createdDoc) {
        const createdSummary = toDocumentSummary(createdDoc);
        createdDocs.push(createdSummary);
        await createRelations(createdSummary.id, workingDocs, createdDoc.meta, workspaceId);
        workingDocs = [createdSummary, ...workingDocs];
        summaryLines.push(buildCreateSummaryLine(createdSummary));
      } else {
        summaryLines.push(`- ${action.create.title.trim()} 카드를 생성하지 못했습니다.`);
      }
      continue;
    }

    if (action.operation === "delete") {
      if (!action.targetDocId) continue;
      const deleted = await deleteDocumentById(action.targetDocId, workspaceId);
      if (deleted) {
        deletedDocIds.push(action.targetDocId);
        summaryLines.push(`- ${action.targetTitle ?? "문서"} 카드를 삭제했습니다.`);
        workingDocs = workingDocs.filter((doc) => doc.id !== action.targetDocId);
      } else {
        summaryLines.push(`- ${action.targetTitle ?? "문서"} 카드를 삭제하지 못했습니다.`);
      }
      continue;
    }

    if (!action.targetDocId || !action.updates) continue;

    const updatedDoc = await updateDocumentFields(
      action.targetDocId,
      {
        progressState: action.updates.progressState,
        deliveryHealth: action.updates.deliveryHealth,
        dueDate: action.updates.dueDate,
        title: action.updates.title,
        serviceName: action.updates.serviceName,
        docType: action.updates.docType,
        summary: action.updates.summary,
        isDocument: action.updates.isDocument,
      },
      workspaceId
    );

    if (updatedDoc) {
      const updatedSummary = toDocumentSummary(updatedDoc);
      updatedDocs.push(updatedSummary);
      summaryLines.push(buildUpdateSummaryLine(updatedSummary, action.updates));
      workingDocs = workingDocs.map((doc) =>
        doc.id === updatedSummary.id ? updatedSummary : doc
      );
    } else {
      summaryLines.push(`- ${action.targetTitle ?? "문서"} 카드를 수정하지 못했습니다.`);
    }
  }

  return {
    createdDocs,
    updatedDocs,
    deletedDocIds,
    summaryLines,
  };
}

async function extractOcrText(images: ImagePayload[]) {
  try {
    const response = await withGeminiFallback(async (modelName) => {
      const model = createGeminiOcrModel(modelName);
      return model.generateContent([
        { text: OCR_PROMPT },
        ...toInlineParts(images),
      ]);
    });

    return response.response.text().trim();
  } catch (error) {
    if (!canUseAnthropicFallback()) throw error;
    if (!isGeminiUnavailableError(error) && !isGeminiRateLimitOrQuotaError(error)) throw error;
    return extractOcrTextWithAnthropic(images);
  }
}

async function detectAndSaveSchedule(
  prompt: string,
  workspaceId: string,
  authorization: string | null,
  sourceType?: AnalysisSourceType,
  hasImages?: boolean
): Promise<Schedule | null> {
  if (sourceType || hasImages) return null;
  if (!SCHEDULE_HINT_PATTERN.test(prompt)) return null;

  try {
    const result = await completeText(prompt, SCHEDULE_SYSTEM_PROMPT, 300);
    const parsed = JSON.parse(result.trim()) as {
      isSchedule?: boolean;
      title?: string;
      startDate?: string;
      endDate?: string;
      category?: string;
      note?: string;
    };

    if (!parsed.isSchedule || !parsed.title?.trim() || !parsed.startDate || !parsed.endDate) {
      return null;
    }

    const res = await fetch(
      `${process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"}/api/schedules?workspaceId=${workspaceId}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-docflow-workspace-id": workspaceId,
          ...(authorization ? { Authorization: authorization } : {}),
        },
        body: JSON.stringify({
          title: parsed.title.trim(),
          startDate: parsed.startDate,
          endDate: parsed.endDate,
          category: (parsed.category ?? "기타") as ScheduleCategory,
          note: parsed.note?.trim() || undefined,
        }),
      }
    );

    const json = (await res.json()) as { schedule?: Schedule };
    return json.schedule ?? null;
  } catch {
    return null;
  }
}

async function* streamTextAnalysis(prompt: string, systemPrompt: string) {
  let emittedGeminiText = false;

  try {
    const stream = await withGeminiFallback(async (modelName) => {
      const model = createGeminiTextModel(modelName, systemPrompt);
      return model.generateContentStream([{ text: prompt }]);
    });

    for await (const chunk of stream.stream) {
      const text = chunk.text();
      if (text) {
        emittedGeminiText = true;
        yield text;
      }
    }
    return;
  } catch (error) {
    if (isGeminiStreamParseError(error) && emittedGeminiText) {
      console.warn("Gemini stream ended with a parse error after partial text was emitted.");
      return;
    }

    if (
      !isGeminiRateLimitOrQuotaError(error) &&
      !isGeminiUnavailableError(error) &&
      !isGeminiStreamParseError(error)
    ) {
      throw error;
    }
  }

  try {
    const client = new Groq({ apiKey: process.env.GROQ_API_KEY });
    const stream = await client.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: prompt },
      ],
      stream: true,
      max_tokens: 2048,
    });

    for await (const chunk of stream) {
      const text = chunk.choices[0]?.delta?.content ?? "";
      if (text) yield text;
    }
  } catch (error) {
    if (!canUseAnthropicFallback()) throw error;
    if (!isGroqRateLimitOrUnavailableError(error)) throw error;

    const text = await completeWithAnthropic(prompt, systemPrompt);
    if (text) yield text;
  }
}

async function* streamImageAnalysis(prompt: string, ocrText: string, images: ImagePayload[]) {
  let emittedGeminiText = false;

  try {
    const stream = await withGeminiFallback(async (modelName) => {
      const model = createGeminiAnalysisModel(modelName);
      return model.generateContentStream([
        {
          text: `${prompt}

[OCR 추출 원문]
${ocrText || "추출된 텍스트 없음"}

위 OCR 원문과 첨부 이미지를 함께 참고해서 분석하세요.`,
        },
        ...toInlineParts(images),
      ]);
    });

    for await (const chunk of stream.stream) {
      const text = chunk.text();
      if (text) {
        emittedGeminiText = true;
        yield text;
      }
    }
  } catch (error) {
    if (isGeminiStreamParseError(error) && emittedGeminiText) {
      console.warn("Gemini image stream ended with a parse error after partial text was emitted.");
      return;
    }

    if (!canUseAnthropicFallback()) throw error;
    if (
      !isGeminiUnavailableError(error) &&
      !isGeminiRateLimitOrQuotaError(error) &&
      !isGeminiStreamParseError(error)
    ) {
      throw error;
    }

    const text = await analyzeImagesWithAnthropic(prompt, ocrText, images);
    if (text) yield text;
  }
}

export async function POST(req: NextRequest) {
  const {
    messages,
    images,
    analysisContent,
    userPrompt,
    sourceType,
    sourceLabel,
    authorName,
    spreadsheet,
  }: {
    messages: ChatRequestMessage[];
    images?: ImagePayload[];
    analysisContent?: string;
    userPrompt?: string;
    sourceType?: AnalysisSourceType;
    sourceLabel?: string;
    authorName?: string;
    spreadsheet?: SpreadsheetPayload;
  } = await req.json();

  let workspaceId: string;
  let authUser: Awaited<ReturnType<typeof getAuthUserFromRequest>>;
  try {
    const access = await requireWorkspaceAccess(req);
    workspaceId = access.workspaceId;
    authUser = access.user;
  } catch (error) {
    return workspaceAccessErrorResponse(error);
  }
  const prompt = analysisContent?.trim() || messages[messages.length - 1]?.content || "";
  const resolvedAuthorName = resolveAuthorName(getDisplayNameFromUser(authUser) ?? authorName);
  const encoder = new TextEncoder();
  let fullText = "";
  const allDocs = await fetchDocuments(workspaceId);
  const workspaceContext = buildWorkspaceContext(allDocs);
  const chatMode = detectChatMode({
    prompt,
    sourceType,
    hasImages: Boolean(images?.length),
    analysisContent,
  });
  const modelSystemPrompt =
    chatMode === "analysis"
      ? ANALYSIS_SYSTEM_PROMPT
      : chatMode === "workspace"
        ? WORKSPACE_CHAT_SYSTEM_PROMPT
        : GENERAL_CHAT_SYSTEM_PROMPT;
  const shouldLookupRealtime =
    chatMode !== "analysis" && shouldPerformRealtimeLookup(prompt);
  const realtimeLookup = shouldLookupRealtime
    ? await performRealtimeLookup(prompt).catch((error) => {
        console.error("performRealtimeLookup:", error);
        return null;
      })
    : null;
  const realtimeReply = realtimeLookup ? buildRealtimeReply(realtimeLookup) : null;
  const effectiveSystemPrompt = realtimeLookup
    ? REALTIME_LOOKUP_SYSTEM_PROMPT
    : modelSystemPrompt;
  const effectivePrompt = buildModelPrompt({
    mode: chatMode,
    messages,
    prompt,
    analysisContent,
    sourceType,
    sourceLabel,
    userPrompt,
    workspaceContext,
  });
  const promptWithRealtimeContext = realtimeLookup
    ? `${effectivePrompt}

${formatRealtimeLookupContext(realtimeLookup)}`
    : effectivePrompt;

  const readable = new ReadableStream({
    async start(controller) {
      try {
        let ocrText = "";

        if (realtimeReply && !images?.length) {
          fullText += realtimeReply;
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ text: realtimeReply })}\n\n`)
          );
        } else if (images?.length) {
          ocrText = await extractOcrText(images);
          for await (const text of streamImageAnalysis(effectivePrompt, ocrText, images)) {
            fullText += text;
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text })}\n\n`));
          }
        } else {
          for await (const text of streamTextAnalysis(promptWithRealtimeContext, effectiveSystemPrompt)) {
            fullText += text;
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text })}\n\n`));
          }
        }

        const parsedMeta = parseDocMeta(fullText);
        const parsedOrFallbackMeta =
          parsedMeta?.isDocument || shouldPersistNonDocument(sourceType)
            ? parsedMeta ?? buildFallbackMeta(fullText)
            : parsedMeta;
        const classificationSource = [prompt, cleanAssistantText(fullText)]
          .filter(Boolean)
          .join("\n\n");
        const classifiedMeta = parsedOrFallbackMeta
          ? applyClassificationPolicy(parsedOrFallbackMeta, classificationSource, sourceType)
          : parsedOrFallbackMeta;
        const meta = classifiedMeta
          ? {
              ...classifiedMeta,
              author: resolvedAuthorName ?? classifiedMeta.author,
            }
          : classifiedMeta;

        if (meta && (meta.isDocument || shouldPersistNonDocument(sourceType))) {
          const saved = await saveDocument(
            images?.length || sourceType === "file" || sourceType === "url"
              ? {
                  isDocument: meta.isDocument,
                  sourceType: (sourceType ?? (images?.length ? "image" : "text")) as "image" | "file" | "url" | "text",
                  sourceLabel: images?.length
                    ? images
                        .map((image) => image.name)
                        .filter(Boolean)
                        .join(", ")
                    : sourceLabel,
                  imageCount: images?.length,
                  rawContent: sourceType === "image" ? userPrompt?.trim() ?? "" : prompt,
                  userPrompt: userPrompt?.trim() || undefined,
                  ocrText: images?.length ? ocrText : undefined,
                  spreadsheetSheets: spreadsheet?.sheets?.length
                    ? spreadsheet.sheets
                    : undefined,
                  imagePreviews: images?.map((image) => ({
                    name: image.name ?? "image",
                    previewUrl: image.previewUrl ?? `data:${image.mimeType};base64,${image.data}`,
                  })),
                }
              : prompt,
            meta,
            workspaceId
          );

          if (saved) {
            await createRelations(saved.id, allDocs, meta, workspaceId);
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ savedDoc: toDocumentSummary(saved) })}\n\n`)
            );
          }
        }

        if (!images?.length && !realtimeLookup) {
          const savedSchedule = await detectAndSaveSchedule(
            prompt,
            workspaceId,
            req.headers.get("authorization"),
            sourceType,
            Boolean(images?.length)
          );
          if (savedSchedule) {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ savedSchedule })}\n\n`)
            );
          }
        }

        if (!images?.length && !realtimeLookup && chatMode !== "general") {
          const rawActionPlan = await detectDocumentActionPlan(prompt, messages, allDocs);
          const actionPlan = normalizeActionPlan(rawActionPlan);

          if (actionPlan?.needsClarification && actionPlan.clarificationQuestion) {
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ text: `\n\n추가 확인이 필요합니다.\n${actionPlan.clarificationQuestion}` })}\n\n`
              )
            );
          } else if (actionPlan?.actions.length) {
            const actionResult = await executeDocumentActions(
              actionPlan.actions,
              allDocs,
              resolvedAuthorName,
              workspaceId
            );

            if (actionResult.summaryLines.length > 0) {
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({ text: `\n\n작업 반영 결과\n${actionResult.summaryLines.join("\n")}` })}\n\n`
                )
              );
            }

            for (const createdDoc of actionResult.createdDocs) {
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ savedDoc: createdDoc })}\n\n`)
              );
            }

            for (const updatedDoc of actionResult.updatedDocs) {
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ updatedDoc })}\n\n`)
              );
            }

            for (const deletedDocId of actionResult.deletedDocIds) {
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ deletedDocId })}\n\n`)
              );
            }
          }
        }

        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      } catch (error) {
        const message = toUserFacingErrorMessage(error);
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ text: `❌ ${message}` })}\n\n`)
        );
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      }
    },
  });

  return new NextResponse(readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
