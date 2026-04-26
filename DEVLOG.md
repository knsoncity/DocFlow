# DocFlow DEVLOG

DocFlow의 현재 구현 상태와 세션별 작업 내역을 함께 관리하는 로그다.
이 파일은 "지금 무엇이 구현되어 있는지"와 "최근에 무엇을 했는지"를 빠르게 파악하기 위한 기준 문서로 사용한다.

## 메타

- 마지막 업데이트: 2026-04-25
- 작업 경로: `/Users/brad.and/Downloads/docflow`
- 현재 브랜치: `main`
- 최근 확인 커밋
  - `a22b0eb` `Implement DocFlow workspace MVP`
  - `472f0c9` `Initial commit from Create Next App`

## 프로젝트 한 줄 요약

서비스 기획 문서, 참고자료, 이미지, URL, 파일을 AI로 분석해서 워크스페이스 카드로 축적하고,
상태 변경, 일정 관리, 관계도 탐색, 정책 영향 추적까지 한 화면에서 다루는 한국어 중심 문서 워크스페이스.

## 현재 스택

- 프레임워크: Next.js `16.2.4` App Router
- UI: React `19.2.4`, Tailwind CSS `4`
- 저장소: Supabase
- AI SDK: Gemini, Groq, Anthropic
- 파일 파싱: `pdf-parse`, `mammoth`, `xlsx`
- 기타 주요 라이브러리: `react-force-graph`, `react-markdown`, `uuid`

## 현재 구현 범위

### 1. 워크스페이스 셸

- 메인 화면은 `list`, `graph`, `timeline` 3개 탭으로 구성
- 카드형 뷰와 컴팩트 뷰 전환 지원
- 검색, 카테고리/세부 유형/상태 필터, 정렬 지원
- 저장된 뷰 프리셋 제공
  - 전체 데스크
  - 기획 집중
  - 설계 리뷰
  - API 워크
  - 운영 팔로업
  - 참고 큐
- 작성자명, 테마, 채팅 패널 너비를 `localStorage`에 저장
- 모바일에서는 채팅/워크스페이스 표면 전환 구조 사용
- Supabase Auth 이메일 OTP 기반 로그인 게이트 추가
- 로그인 사용자의 세션 토큰을 문서/채팅/일정/관계도 API 요청에 전달
- 좌측 헤더에서 워크스페이스 선택/생성 지원
- 선택한 워크스페이스 ID를 `localStorage`에 저장하고 `x-docflow-workspace-id` 헤더로 전달
- 워크스페이스 전환 시 문서 목록, 상세 선택, 신규 일정 상태를 초기화하고 해당 워크스페이스 데이터로 재조회

### 2. 채팅 인터페이스

파일: `app/components/ChatWindow.tsx`

- SSE 기반 스트리밍 응답
- 일반 질의, 문서 분석, 카드 액션, 일정 등록을 한 입력창에서 처리
- 첨부 지원
  - 문서: `pdf`, `docx`, `txt`, `md`, `csv`, `xlsx`, `xls`
  - 이미지: `png`, `jpeg`, `webp`, `gif`
- 드래그 앤 드롭 지원
- 여러 장 이미지 OCR 후 분석 가능
- URL 입력 시 본문 추출 후 분석 가능
- 분석 결과로 문서 추가, 수정, 삭제, 일정 추가 이벤트를 UI에 즉시 반영

### 3. AI 분석 및 액션 파이프라인

파일: `app/api/chat/route.ts`

- 기본 역할
  - 일반 대화
  - 문서/파일/URL/이미지 분석
  - 등록된 카드 조회/요약/정리
  - 카드 수정/삭제/생성 액션 실행
  - 일정 의도 감지 및 일정 생성
- 모델 라우팅
  - 1차: Gemini `gemini-2.5-flash`
  - 2차: Gemini `gemini-2.5-flash-lite`
  - 3차: Groq 스트리밍 fallback
  - 최종: Anthropic `claude-sonnet-4-5`
- 문서 분석 시 구조화 메타데이터 생성
  - `isDocument`
  - `docType`
  - `serviceName`
  - `featureName`
  - `version`
  - `author`
  - `summary`
  - `keywords`
  - `relatedDocTypes`
  - `completeness`
  - `missingParts`
  - `progressState`
  - `scheduleSummary`
  - `deliveryHealth`
  - `dueDate`
- 뉴스 기사와 기획 문서를 분리하는 분류 정책 적용
- 문서가 아닌 입력도 `file`, `url`, `image` 소스이면 참고자료로 저장 가능
- 카드 액션 플래너가 자연어에서 다음 작업을 판별
  - `create`
  - `update`
  - `delete`
- 일정 파서가 자연어에서 `title`, `startDate`, `endDate`, `category`, `note`를 추출해 일정 테이블에 저장
- 로그인 사용자가 있으면 클라이언트가 보낸 작성자명보다 Supabase 사용자 표시명을 우선 사용
- Gemini 스트림 파싱 오류가 부분 응답 이후 발생하면 전체 실패로 처리하지 않고 부분 응답을 유지
- 워크스페이스 컨텍스트 조회, 카드 생성/수정/삭제, 일정 자동 생성이 선택된 워크스페이스 기준으로 동작

### 4. 파일/URL/이미지 처리

- `app/api/parse-file/route.ts`
  - PDF: `pdf-parse`
  - DOCX: `mammoth`
  - TXT/MD: UTF-8 문자열 처리
  - CSV/XLSX/XLS: 시트별 표 데이터를 읽고 마크다운 테이블 텍스트로 변환
- `app/api/parse-url/route.ts`
  - HTML에서 스크립트/스타일 제거
  - 블록 요소를 줄바꿈으로 정규화
  - 최대 8000자까지 본문 추출
- 이미지 입력
  - OCR 텍스트를 별도로 저장
  - 이미지 미리보기와 이미지 수를 함께 관리

### 5. 문서 카드와 상세 모달

파일: `app/components/DocCard.tsx`, `app/components/DocModal.tsx`

- 카드 요약 정보
  - 문서 유형 배지
  - 카테고리 색상
  - 진행 상태
  - 일정 요약
  - D-day
  - 작성일
  - 정책 배지
- 카드 디자인을 인스타그램형 4:5 비율에 가까운 컴팩트 카드로 정리
- 목록 상단 검색/필터 영역을 카드 크기와 맞게 더 조밀한 컨트롤로 조정
- 상세 모달 기능
  - 진행 상태 수정
  - 색상 상태 수정
  - 마감일 수정
  - 작성자/서비스/문서 속성 표시
  - 원문 보기
  - OCR 원문 보기
  - 스프레드시트 시트 탐색
  - 변경 이력 확인
  - 정책 문서 수동 지정
  - 삭제 처리
- 상세 모달은 탭 구조로 정리
  - 정리본
  - 원문
  - 시트
  - 정책/영향
  - 변경 이력
- 정리본 탭은 원문을 기획/정책서 표준 양식에 가깝게 재구성해서 표시
- CSV/XLS/XLSX 파일 업로드, 표형식 문서, 표형식 붙여넣기일 때만 시트 탭 노출
- 변경 이력은 최대 30개까지 유지

### 6. 정책 추적

파일: `lib/policy-tracking.ts`

- 정책 문서 자동 감지
- 정책 문서 수동 지정 지원
- 같은 서비스 내 정책 버전 그룹화
- 이전 정책 버전 연결
- 정책 변경 비교
  - 추가
  - 삭제
  - 수정
- 정책 변경이 영향을 줄 가능성이 높은 문서 후보 연결
- 영향 후보/영향 받은 문서를 카드와 상세 모달에서 노출

### 7. 관계도와 시각화

파일: `app/components/GraphView.tsx`, `app/components/ForceGraph.tsx`

- 서비스 기준 클러스터 시각화
- 문서 유형/키워드 기반 링크 생성
- `map`, `explore`, `force` 모드 지원
- 위험도/문서량 heat overlay 지원
- 노드 선택 시 문서 요약과 일정 정보 표시
- 노드 드래그, 줌, 클러스터 탐색 지원
- 관계도와 포스 그래프 전체화면 보기 지원
- 포스 그래프의 관계 조회도 로그인 토큰과 워크스페이스 헤더를 포함해서 요청

### 8. 타임라인과 일정 관리

파일: `app/components/TimelineView.tsx`, `app/api/schedules/*`

- 문서 일정과 개인 일정을 한 타임라인에 함께 표시
- 일정 CRUD 지원
  - 생성
  - 수정
  - 삭제
- 날짜 클릭으로 일정 추가
- 일정 바 클릭으로 수정
- 일정 카테고리
  - 업무
  - 회의
  - 리뷰
  - 출장
  - 휴가
  - 기타
- 일정 조회/생성/수정/삭제는 선택된 워크스페이스 기준으로 동작

### 9. 실시간 조회

파일: `lib/realtime.ts`

- 날씨 조회
  - 지역명 정규화
  - Open-Meteo 기반 조회
- 뉴스 조회
  - Google News RSS 기반 요약
- 검색 조회
  - DuckDuckGo 결과 수집
- 실시간 결과를 프롬프트 컨텍스트에 삽입해서 일반 채팅 답변에 반영

### 10. 다중 사용자/워크스페이스 구조

파일: `lib/workspace.ts`, `lib/workspaces.ts`, `lib/workspace-access.ts`, `lib/auth.ts`, `app/api/workspaces/route.ts`

- 기본 워크스페이스 ID 제공
  - `DOCFLOW_DEFAULT_WORKSPACE_ID`
  - `NEXT_PUBLIC_DOCFLOW_WORKSPACE_ID`
  - fallback: `00000000-0000-4000-8000-000000000001`
- API 요청에서 `workspaceId` query 또는 `x-docflow-workspace-id` 헤더를 읽어 워크스페이스 결정
- `requireWorkspaceAccess()`로 로그인 사용자와 워크스페이스 멤버십 확인
- 기본 공유 워크스페이스는 로그인 사용자를 자동 멤버로 upsert
- 워크스페이스 목록 조회와 신규 워크스페이스 생성 API 제공
- DB 스키마가 아직 적용되지 않은 환경에서도 기존 단일 구조가 최대한 동작하도록 fallback 유지

## 현재 API 표면

- `GET /api/documents`
- `PATCH /api/documents/[id]`
- `DELETE /api/documents/[id]`
- `GET /api/relations`
- `POST /api/parse-file`
- `POST /api/parse-url`
- `POST /api/chat`
- `GET /api/schedules`
- `POST /api/schedules`
- `PATCH /api/schedules/[id]`
- `DELETE /api/schedules/[id]`
- `GET /api/workspaces`
- `POST /api/workspaces`

## 현재 데이터 저장 구조

### Supabase 테이블

- `workspaces`
- `workspace_members`
- `services`
- `documents`
- `doc_relations`
- `schedules`

### 문서 저장 구조

- 기본 메타데이터는 `documents` 테이블에 저장
- `services`, `documents`, `doc_relations`, `schedules`는 `workspace_id` 기준으로 분리
- `workspace_members`는 `workspace_id`, `user_id`, `role` 조합으로 멤버십 관리
- 긴 원문, OCR, 이미지 미리보기, 스프레드시트 시트, 변경 이력 등은 구조화된 raw payload로 관리
- payload가 크거나 부가 정보가 많으면 Supabase Storage 버킷 `docflow-document-details`에 분리 저장
- `raw_content`에는 인라인 JSON 또는 Storage 포인터가 저장될 수 있음
- DB 스키마 파일
  - `supabase/schema.sql`
  - `supabase/migrations/20260424143000_workspace_membership.sql`
- 2026-04-25 기준 Supabase SQL Editor에서 워크스페이스 스키마 실행 완료
- `workspace_members` 테이블은 service role REST 조회로 `HTTP 200` 확인

## 운영 메모

### 환경 변수

- `GEMINI_API_KEY`
- `GROQ_API_KEY`
- `ANTHROPIC_API_KEY`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

### 개발 서버

- 실행 명령: `npm run dev`
- 기본 주소: `http://localhost:3000`

### 주의할 점

- 셸의 `ANTHROPIC_API_KEY`가 비어 있는 값으로 잡혀 있으면 `.env.local`보다 우선될 수 있음
- 이 경우 `unset ANTHROPIC_API_KEY` 후 서버 실행이 필요할 수 있음
- 새 워크스페이스 생성은 Supabase DB에 `workspaces`, `workspace_members`, `workspace_id` 컬럼, RLS 정책이 적용되어 있어야 정상 동작
- `SUPABASE_SERVICE_ROLE_KEY`는 서버 API에서만 사용하고 클라이언트 번들에는 포함하지 않도록 주의

## 현재까지 확인된 이슈와 후속 후보

- 실시간 조회 결과가 Gemini 응답 품질에 얼마나 안정적으로 반영되는지 추가 검증 필요
- `"내일 과천 날씨"` 같은 시간 수식어 포함 날씨 질의의 지역 추출은 더 다듬을 여지 있음
- 그래프/타임라인 대량 데이터 성능은 아직 별도 측정 로그가 없음
- `README.md`는 아직 기본 Next.js 템플릿 문서라 실제 프로젝트 설명과 어긋남
- 초대/멤버 관리 UI는 아직 없음
- 권한별 기능 제한은 기본 멤버십 확인까지만 구현되어 있고 역할별 세부 제한은 후속 작업 필요
- 워크스페이스별 데이터 격리는 실제 다중 사용자 시나리오로 추가 검증 필요

## 다음 단계 계획

다음 작업은 여러 사용자가 같은 MVP를 검증할 수 있도록 워크스페이스 운영 기능을 완성하는 순서로 진행한다.

### 1. 워크스페이스 초대/멤버 관리

목표: 워크스페이스 생성자가 다른 사용자를 같은 워크스페이스에 넣을 수 있게 한다.

- API 추가
  - `GET /api/workspaces/[id]/members`
  - `POST /api/workspaces/[id]/members`
  - `PATCH /api/workspaces/[id]/members/[userId]`
  - `DELETE /api/workspaces/[id]/members/[userId]`
- UI 추가
  - 환경설정 또는 워크스페이스 선택 영역에 `멤버 관리` 진입점 추가
  - 멤버 목록 표시
  - 이메일로 멤버 초대/추가
  - 역할 선택
    - `owner`
    - `admin`
    - `member`
    - `viewer`
  - 멤버 제거
- 구현 시 주의
  - Supabase Auth 사용자는 이메일로 직접 조회하기 어렵기 때문에, 초기 MVP에서는 이미 가입/로그인한 사용자의 이메일 기준으로 등록 가능한지 확인하는 서버 로직이 필요하다.
  - 초대 메일 발송까지는 후순위로 두고, 먼저 `workspace_members`에 직접 추가하는 관리 기능부터 구현한다.

### 2. 역할별 권한 제한

목표: 멤버십은 확인되지만 역할별 제한이 없는 현재 상태를 실제 협업 권한 모델로 확장한다.

- 권한 정책 초안
  - `owner`: 워크스페이스 삭제, 멤버 관리, 모든 문서/일정 관리
  - `admin`: 멤버 관리, 모든 문서/일정 관리
  - `member`: 문서/일정 생성/수정/삭제
  - `viewer`: 조회만 가능
- 서버 적용 위치
  - `lib/workspace-access.ts`
  - `app/api/documents/*`
  - `app/api/schedules/*`
  - `app/api/chat/route.ts`
  - `app/api/workspaces/*`
- UI 적용
  - `viewer`는 채팅 분석/등록, 문서 수정, 일정 추가, 삭제 버튼 비활성화
  - 권한 부족 시 토스트 메시지로 안내

### 3. 워크스페이스별 데이터 격리 검증

목표: 실제 다중 사용자 테스트 전에 데이터가 워크스페이스별로 확실히 분리되는지 검증한다.

- 테스트 시나리오
  - 사용자 A가 워크스페이스 A 생성
  - 사용자 A가 문서/일정 등록
  - 사용자 A가 워크스페이스 B 생성
  - 워크스페이스 B에서 A의 문서/일정이 보이지 않는지 확인
  - 사용자 B를 워크스페이스 A에 추가
  - 사용자 B가 워크스페이스 A 문서/일정을 볼 수 있는지 확인
  - 초대받지 않은 사용자 C가 워크스페이스 A에 접근할 수 없는지 확인
- 확인 대상
  - 문서 목록
  - 문서 상세
  - 채팅 컨텍스트
  - 관계도
  - 포스 그래프
  - 타임라인 일정
  - 자연어 액션으로 생성/수정/삭제되는 문서와 일정

### 4. MVP 테스트 운영 화면 정리

목표: 여러 사용자가 테스트할 때 혼란이 적도록 기본 안내와 빈 상태를 정리한다.

- 빈 워크스페이스 화면 개선
  - 첫 문서 등록 안내
  - 파일/붙여넣기/URL/이미지 등록 예시
- 워크스페이스 생성 실패 메시지 정리
  - 스키마 미적용
  - 권한 부족
  - 중복/네트워크 오류
- 로그인 상태 표시 개선
  - 현재 사용자 이메일
  - 현재 워크스페이스명
  - 현재 역할

### 5. 문서화와 운영 체크리스트

목표: 다음 작업자와 MVP 테스트 참여자가 현재 구조를 빠르게 이해할 수 있게 한다.

- `README.md`를 Next.js 기본 템플릿에서 DocFlow 전용 문서로 교체
- Supabase 설정 절차 문서화
  - 환경 변수
  - SQL 마이그레이션 실행
  - Auth 이메일 OTP 설정
  - Redirect URL 설정
- MVP 테스트 체크리스트 작성
  - 로그인
  - 워크스페이스 생성
  - 멤버 추가
  - 문서 등록
  - 관계도 확인
  - 일정 등록
  - 상세 정리본 확인
  - 권한 제한 확인

### 추천 작업 순서

1. `GET /api/workspaces/[id]/members`와 멤버 목록 UI 구현
2. `POST /api/workspaces/[id]/members`로 이메일 기반 멤버 추가 구현
3. `lib/workspace-access.ts`에 역할 확인 helper 추가
4. 문서/일정/채팅 API에 쓰기 권한 제한 적용
5. 사용자 A/B/C 시나리오로 데이터 격리 검증
6. README와 MVP 테스트 체크리스트 정리

## 세션 로그

### 2026-04-25

- 다중 사용자 검증 구조를 Supabase Auth와 워크스페이스 멤버십 기반으로 확장
  - 이메일 OTP 로그인 게이트 추가
  - 로그인 세션 토큰을 문서/채팅/일정/관계도 API 요청에 전달
  - 서버에서 `Authorization: Bearer` 토큰으로 사용자 확인
  - 채팅 저장 작성자는 로그인 사용자 표시명을 우선 사용
- 워크스페이스 기능 추가
  - `GET /api/workspaces`, `POST /api/workspaces` 추가
  - 워크스페이스 선택/생성 UI 추가
  - 선택된 워크스페이스를 `x-docflow-workspace-id` 헤더로 전달
  - 문서, 일정, 관계도, 채팅 API가 선택 워크스페이스 기준으로 동작
- DB 스키마와 마이그레이션 정리
  - `workspaces`, `workspace_members` 테이블 추가
  - `services`, `documents`, `doc_relations`, `schedules`에 `workspace_id` 추가
  - 워크스페이스별 인덱스와 기본 RLS SELECT 정책 추가
  - `supabase/migrations/20260424143000_workspace_membership.sql` 생성
  - Supabase SQL Editor에서 마이그레이션 실행 완료
  - `workspace_members` REST 조회가 `HTTP 200`으로 응답하는 것 확인
- 상세/시각화/카드 UI 개선
  - 문서 카드를 더 컴팩트한 카드형 레이아웃으로 정리
  - 검색/필터 영역을 카드 디자인에 맞춰 축소
  - 관계도/포스 그래프 전체화면 보기 추가
  - 상세 모달을 탭 구조로 정리
  - 정리본 탭에서 원문 기반 내용을 기획/정책서 표준 양식으로 재구성
  - 표형식 자료일 때만 시트 탭이 보이도록 분기 처리
- Gemini 스트림 안정성 보강
  - `Failed to parse stream` 오류가 부분 응답 이후 발생하면 부분 결과를 유지
  - 텍스트 분석은 Groq fallback, 이미지 분석은 Anthropic fallback 경로 유지
- 변경한 주요 파일
  - `app/page.tsx`
  - `app/components/ChatWindow.tsx`
  - `app/components/DocCard.tsx`
  - `app/components/DocModal.tsx`
  - `app/components/GraphView.tsx`
  - `app/components/ForceGraph.tsx`
  - `app/components/TimelineView.tsx`
  - `app/api/chat/route.ts`
  - `app/api/documents/*`
  - `app/api/schedules/*`
  - `app/api/relations/route.ts`
  - `app/api/workspaces/route.ts`
  - `lib/auth.ts`
  - `lib/workspace.ts`
  - `lib/workspaces.ts`
  - `lib/workspace-access.ts`
  - `lib/documents.ts`
  - `lib/db-errors.ts`
  - `lib/supabase-client.ts`
  - `supabase/schema.sql`
  - `supabase/migrations/20260424143000_workspace_membership.sql`
- 검증 내용
  - `npm run lint` 통과
  - `npm run build` 통과
  - 개발 서버 `http://localhost:3000` 실행 유지
  - Supabase `workspace_members` REST 조회 `HTTP 200` 확인
- 남은 이슈 또는 다음 작업
  - 워크스페이스 초대/멤버 관리 UI 구현
  - `owner/admin/member/viewer` 역할별 기능 제한 적용
  - 사용자 A/B/C 시나리오로 워크스페이스 데이터 격리 검증
  - MVP 테스트 체크리스트와 README 정리

### 2026-04-20

- 개발 서버 다운 상태 확인
  - `package.json`의 `dev` 스크립트가 `next dev`임을 확인
  - `localhost:3000` 리스닝 부재 확인
- 개발 서버 재기동
  - `npm run dev`로 서버 재시작
  - `http://localhost:3000`에서 `HTTP 200 OK` 응답 확인
- `DEVLOG.md` 정비
  - 기존 로그가 현재 코드보다 뒤처져 있어 전체 기준 문서 형태로 재작성
  - 정책 추적, 일정 CRUD, 타임라인, 스프레드시트 처리, Storage 분리 저장 구조 반영

### 기준 마일스톤

- `472f0c9`
  - Create Next App 기반 초기 프로젝트 생성
- `a22b0eb`
  - DocFlow workspace MVP 구현

## 이후 업데이트 규칙

앞으로 작업할 때는 아래 형식으로 `세션 로그` 섹션 최상단에 새 날짜 블록을 추가한다.

```md
### YYYY-MM-DD

- 작업 요약
- 변경한 주요 파일
- 검증 내용
- 남은 이슈 또는 다음 작업
```

짧게 적더라도 아래 4가지는 남기는 것을 원칙으로 한다.

- 무엇을 바꿨는지
- 어디를 바꿨는지
- 무엇으로 확인했는지
- 다음에 이어서 볼 포인트가 무엇인지
