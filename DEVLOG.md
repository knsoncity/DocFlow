# DocFlow 개발 로그

## 프로젝트 개요

서비스 기획 문서를 AI로 자동 분류·관리하는 챗봇형 플랫폼.

- **스택**: Next.js 16 (App Router) · TypeScript · Tailwind CSS · Supabase · Gemini 2.5-flash · Groq · Anthropic
- **경로**: `/Users/brad.and/Downloads/docflow`

---

## 구현 기능 목록

### 1. 채팅 인터페이스 (`app/components/ChatWindow.tsx`)
- 챗봇형 메시지 입력/출력 (SSE 스트리밍)
- 파일 첨부: PDF · DOCX · TXT · MD · CSV
- 이미지 첨부: PNG · JPG · WEBP · GIF (최대 10MB, OCR 지원)
- URL 자동 감지 → `/api/parse-url` 로 분석
- 드래그 앤 드롭 지원
- 작성자명 설정 (localStorage 저장)

### 2. AI 문서 분석 (`app/api/chat/route.ts`)
- 붙여넣기/파일/URL 입력 → 자동 분류 및 메타데이터 추출
- 문서 유형 분류: PRD · 화면정의서 · 플로우차트 · API명세 · 회의록 · 기타
- 뉴스 기사 vs 기획 문서 자동 구분 (`isDocument: true/false`)
- JSON 메타데이터 파싱 후 Supabase 저장

### 3. 다중 모델 라우팅
| 우선순위 | 모델 | 용도 |
|---|---|---|
| 1순위 | Gemini 2.5-flash | 채팅 스트리밍, 문서 분석, 이미지 OCR |
| 2순위 | Groq llama-3.3-70b | Gemini 할당량 초과 시 fallback |
| 3순위 | Anthropic claude-sonnet | 모든 모델 실패 시 최종 fallback |

> **변경 이력**: 초기 Groq 1순위 → Gemini 한국어 품질이 우수하여 1순위로 변경

### 4. 문서 카드 (`app/components/DocCard.tsx`)
- 문서 유형별 색상 배지
- 배송 상태(Delivery Health): 🔴 지연 · 🟡 주의 · 🟢 정상 · ⚫ 미정
- 진행여부 · 일정 · D-day 표시
- 완성도 프로그레스 바
- 키워드 태그 (최대 3개 + 오버플로우 표시)

### 5. 문서 상세 모달 (`app/components/DocModal.tsx`)
- 진행여부 선택기 (대기 · 진행중 · 완료 · 보류 · 미정)
- 마감일 날짜 피커
- 변경 이력 표시 (최대 30개)
- 삭제 버튼

### 6. 대시보드 (`app/page.tsx`)
- 서비스별 그룹 섹션
- 카드뷰 / 컴팩트뷰 토글
- 검색 · 상태 필터 · 정렬
- 문서 삭제 (`DELETE /api/documents/[id]`)
- 문서 메타 수정 (`PATCH /api/documents/[id]`)

### 7. 관계도 (`app/components/GraphView.tsx`)
- 서비스 클러스터 허브 노드
- 링 레이아웃으로 문서 배치
- 키워드/문서 유형 기반 연결선
- 드래그로 노드 이동, 줌 지원
- 노드 클릭 → DocModal 열기

### 8. 실시간 조회 (`lib/realtime.ts`)
- 날씨: Open-Meteo API (지역명 추출 → 좌표 변환 → 날씨 조회)
- 뉴스: Google News RSS
- 검색: DuckDuckGo HTML

### 9. 파일 파싱
| 파일 형식 | 파싱 방법 |
|---|---|
| PDF | pdf-parse |
| DOCX | mammoth |
| TXT · MD · CSV | Buffer.toString() |

### 10. AI 워크스페이스 액션
채팅으로 문서 수정/삭제/생성 가능:
- `"A 카드 완료로 변경해줘"` → progressState 업데이트
- `"B 문서 삭제해줘"` → 삭제 실행
- `"새 카드 만들어줘"` → 카드 생성

---

## Supabase 스키마

```sql
-- 서비스
services (id, name)

-- 문서
documents (
  id, service_id, raw_content, doc_type,
  feature_name, version, author, summary,
  keywords, completeness, missing_parts,
  related_doc_types, created_at
)

-- 문서 관계
doc_relations (from_doc, to_doc, relation_type)
```

---

## 환경변수 (`.env.local`)

```
ANTHROPIC_API_KEY=sk-ant-...
GEMINI_API_KEY=AIza...
GROQ_API_KEY=gsk_...
NEXT_PUBLIC_SUPABASE_URL=https://...supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

---

## 주요 버그 수정 이력

| 증상 | 원인 | 해결 |
|---|---|---|
| `supabaseKey is required` | `supabaseAdmin`이 클라이언트 번들에 포함 | `getSupabaseAdmin()` lazy 함수로 변경 |
| DB 제약조건 위반 | Groq가 `"화면정의서\|개발 협의 문서"` 같은 복합 문자열 반환 | `normalizeDocType()` 추가 (부분 문자열 매칭) |
| ANTHROPIC_API_KEY 미적용 | 시스템 환경변수 빈값이 `.env.local` 덮어씀 | `unset ANTHROPIC_API_KEY` 후 서버 실행 |
| 토큰 한도 초과 | 전체 채팅 히스토리를 AI에 전달 | 마지막 메시지만 분석에 사용 |
| 날씨 질문 오류 | "안녕, 오늘 날씨 어때?" → "안녕,"이 지역명으로 인식 | 인사말 패턴 제거 + 지역명 없을 시 LLM에 위임 |
| Gemini 실시간 거부 | Gemini가 "실시간 정보 없음"으로 답변 | 시스템 프롬프트 강화 + 직접 bypass 제거 |

---

## 개발 서버 실행

```bash
# ANTHROPIC_API_KEY 시스템 환경변수 제거 (필수)
unset ANTHROPIC_API_KEY

# 개발 서버 시작
npm run dev
```

---

## 현재 미해결 이슈

- [ ] 날씨 실시간 조회 결과가 Gemini에 정상 전달되는지 검증 필요 (디버그 로그 확인 중)
- [ ] "내일 과천 날씨" 등 시간 수식어 포함 시 지역명 추출 정확도 개선 여지 있음
