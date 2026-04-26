import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "DocFlow — MVP 운영 가이드",
  description: "DocFlow MVP의 기능, 설정, 다중 사용자 검증 흐름을 단계별로 정리한 랜딩 페이지",
};

type StepTone = "auth" | "workspace" | "data" | "review" | "graph" | "ops";

type LandingStep = {
  id: string;
  number: string;
  tag: string;
  tone: StepTone;
  title: string;
  description: string;
  code?: string;
  tips?: { label: string; text: string }[];
};

const steps: LandingStep[] = [
  {
    id: "step1",
    number: "01",
    tag: "Product",
    tone: "auth",
    title: "DocFlow가 하는 일",
    description:
      "서비스 기획 문서, 참고자료, 이미지, URL, 파일을 AI로 분석해서 카드로 축적하고 상태, 일정, 관계도, 정책 영향까지 한 화면에서 관리합니다.",
    tips: [
      { label: "핵심 가치", text: "흩어진 기획 자료를 붙여넣는 순간 검토 가능한 업무 자산으로 바꿉니다." },
      { label: "현재 범위", text: "문서 목록, 관계도, 타임라인, 상세 정리본, 워크스페이스 전환까지 MVP에 포함되어 있습니다." },
    ],
  },
  {
    id: "step2",
    number: "02",
    tag: "Auth",
    tone: "workspace",
    title: "로그인과 워크스페이스",
    description:
      "Supabase Auth 이메일 OTP로 사용자를 확인하고, 선택한 워크스페이스 ID를 모든 주요 API 요청에 전달합니다.",
    code: `Authorization: Bearer <supabase_access_token>
x-docflow-workspace-id: <workspace_id>`,
    tips: [
      { label: "사용자 식별", text: "채팅에서 전달한 작성자명보다 로그인 사용자 표시명을 우선 사용합니다." },
      { label: "전환 처리", text: "워크스페이스를 바꾸면 문서 목록, 상세 선택, 신규 일정 상태를 초기화하고 다시 조회합니다." },
    ],
  },
  {
    id: "step3",
    number: "03",
    tag: "Database",
    tone: "data",
    title: "Supabase 스키마",
    description:
      "workspaces, workspace_members를 추가하고 services, documents, doc_relations, schedules를 workspace_id 기준으로 분리했습니다.",
    code: `workspaces
workspace_members
services.workspace_id
documents.workspace_id
doc_relations.workspace_id
schedules.workspace_id`,
    tips: [
      { label: "마이그레이션", text: "supabase/migrations/20260424143000_workspace_membership.sql 실행 완료." },
      { label: "검증", text: "workspace_members 테이블은 service role REST 조회로 HTTP 200을 확인했습니다." },
    ],
  },
  {
    id: "step4",
    number: "04",
    tag: "Ingest",
    tone: "review",
    title: "문서 등록 흐름",
    description:
      "채팅창에 텍스트를 붙여넣거나 PDF, DOCX, TXT, MD, CSV, XLSX, XLS, 이미지, URL을 넣으면 분석 후 카드로 등록됩니다.",
    code: `텍스트 붙여넣기
파일 업로드
URL 분석
이미지 OCR
표형식 자료 시트 보존`,
    tips: [
      { label: "참고자료 분리", text: "뉴스 기사와 기획 문서를 구분해 참고자료로 저장할 수 있습니다." },
      { label: "스트림 안정성", text: "Gemini stream parse 오류가 부분 응답 이후 발생하면 부분 결과를 유지합니다." },
    ],
  },
  {
    id: "step5",
    number: "05",
    tag: "Review",
    tone: "graph",
    title: "상세 정리본",
    description:
      "상세 모달은 정리본, 원문, 시트, 정책/영향, 변경 이력 탭으로 정리되어 긴 원문을 더 읽기 쉬운 업무 문서 형태로 보여줍니다.",
    tips: [
      { label: "정리본", text: "원문 기반 내용을 기획/정책서 표준 양식에 가깝게 재구성합니다." },
      { label: "시트 탭", text: "CSV/XLS/XLSX 업로드, 표형식 문서, 표형식 붙여넣기일 때만 표시합니다." },
    ],
  },
  {
    id: "step6",
    number: "06",
    tag: "Map",
    tone: "ops",
    title: "관계도와 타임라인",
    description:
      "서비스 클러스터, 포스 그래프, 문서량/위험도 heat overlay, 전체화면 보기, 일정 CRUD를 통해 자료가 늘어나도 흐름을 확인할 수 있습니다.",
    code: `list  -> 카드/리스트 검토
graph -> 관계도/포스 그래프
timeline -> 문서 일정 + 개인 일정`,
    tips: [
      { label: "대량 자료", text: "관계도와 포스 그래프는 전체화면 보기를 지원합니다." },
      { label: "일정", text: "자연어로 감지된 일정도 선택된 워크스페이스 기준으로 저장됩니다." },
    ],
  },
  {
    id: "step7",
    number: "07",
    tag: "Access",
    tone: "workspace",
    title: "접근 제어",
    description:
      "서버 API는 로그인 사용자와 워크스페이스 멤버십을 확인합니다. 기본 공유 워크스페이스는 로그인 사용자를 자동 멤버로 등록합니다.",
    code: `requireWorkspaceAccess(req)
ensureDefaultWorkspaceMember()
isWorkspaceMember()`,
    tips: [
      { label: "현재 상태", text: "멤버십 확인은 구현됐고, 역할별 세부 제한은 다음 단계입니다." },
      { label: "역할", text: "owner, admin, member, viewer 모델을 기준으로 확장할 예정입니다." },
    ],
  },
  {
    id: "step8",
    number: "08",
    tag: "Next",
    tone: "data",
    title: "다음 작업 계획",
    description:
      "초대/멤버 관리, 역할별 기능 제한, 사용자 A/B/C 시나리오 검증, README와 MVP 테스트 체크리스트 정리가 다음 우선순위입니다.",
    code: `1. 멤버 목록 UI
2. 이메일 기반 멤버 추가
3. 역할 확인 helper
4. 쓰기 권한 제한
5. 데이터 격리 검증
6. README 정리`,
  },
];

const toneClasses: Record<StepTone, string> = {
  auth: "bg-[#ede6d5] text-[#8a5d13]",
  workspace: "bg-[#e7ece3] text-[#2f6b45]",
  data: "bg-[#e3ebf3] text-[#265f8f]",
  review: "bg-[#f0e4df] text-[#a34c30]",
  graph: "bg-[#ece8f2] text-[#6546a0]",
  ops: "bg-[#e9e7e0] text-[#5d5a50]",
};

const navItems = steps.map((step) => ({
  href: `#${step.id}`,
  number: step.number,
  label: step.title,
}));

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-[#f5f4f0] text-[#111113]">
      <aside className="fixed left-0 top-0 z-30 hidden h-screen w-[230px] flex-col gap-6 overflow-y-auto border-r border-black/10 bg-[#eeecea] px-6 py-10 lg:flex">
        <Link href="/" className="text-[15px] font-bold uppercase leading-[1.6] tracking-[0.12em] text-[#333338]">
          DocFlow <span className="text-[#8a5d13]">MVP</span>
        </Link>
        <nav className="flex flex-col gap-0.5">
          {navItems.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[12.5px] text-[#333338] transition-colors hover:bg-black/[0.04] hover:text-[#8a5d13]"
            >
              <span className="min-w-[22px] shrink-0 font-mono text-[13px] text-[#77736b]">{item.number}</span>
              <span className="truncate">{item.label}</span>
            </a>
          ))}
        </nav>
        <div className="mt-auto border-t border-black/10 pt-4 text-[11.5px] leading-[1.7] text-[#666670]">
          DEVLOG 기준
          <br />
          2026.04.25 업데이트
        </div>
      </aside>

      <div className="lg:ml-[230px]">
        <div className="max-w-[1120px] px-6 py-10 sm:px-10 lg:px-20 lg:py-20">
          <section className="grid gap-10 lg:grid-cols-[minmax(0,600px)_minmax(280px,360px)] lg:items-start">
            <div className="max-w-[600px]">
              <p className="mb-4 text-[13px] font-semibold uppercase tracking-[0.15em] text-[#8a5d13]">
                AI Product Document Workspace
              </p>
              <h1 className="mb-5 text-[35px] font-light leading-[1.38] tracking-[-0.02em] text-[#111113] sm:text-[42px]">
                흩어진 기획 자료를
                <br />
                <strong className="font-bold">검토 가능한 워크스페이스로</strong>
              </h1>
              <p className="text-[17px] leading-[1.9] text-[#222225]">
                DocFlow는 붙여넣기, 파일, URL, 이미지를 AI로 분석해 카드와 상세 정리본, 관계도,
                타임라인으로 연결하는 MVP입니다. 이 페이지는 현재 DEVLOG 기준 구현 범위와 다음 작업 순서를
                한 번에 확인하기 위한 운영 가이드입니다.
              </p>
              <div className="mt-8 flex flex-wrap gap-2">
                <Link
                  href="/"
                  className="rounded-md border border-black/15 bg-[#111113] px-4 py-2 text-[13px] font-semibold text-[#f5f4f0] transition-opacity hover:opacity-90"
                >
                  앱 열기
                </Link>
                <a
                  href="#step8"
                  className="rounded-md border border-black/15 px-4 py-2 text-[13px] font-semibold text-[#333338] transition-colors hover:bg-black/[0.04]"
                >
                  다음 작업 보기
                </a>
              </div>
            </div>

            <div className="rounded-[10px] border border-black/10 bg-[#ebe8df] p-3 shadow-[0_24px_60px_rgba(17,17,19,0.08)]">
              <div className="rounded-[8px] border border-black/10 bg-[#f9f8f4] p-4">
                <div className="mb-4 flex items-center justify-between border-b border-black/10 pb-3">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#77736b]">Workspace</p>
                    <p className="mt-1 text-[15px] font-semibold tracking-[-0.02em]">DocFlow Shared</p>
                  </div>
                  <span className="rounded-full bg-[#e7ece3] px-2.5 py-1 text-[11px] font-semibold text-[#2f6b45]">
                    member
                  </span>
                </div>
                <div className="space-y-2.5">
                  {["정책 변경 영향 검토", "회원가입 화면정의서", "배송비 정책 PRD"].map((title, index) => (
                    <div key={title} className="rounded-[8px] border border-black/10 bg-white px-3 py-3">
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <p className="truncate text-[13px] font-semibold">{title}</p>
                        <span className="font-mono text-[11px] text-[#77736b]">0{index + 1}</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-[#ede6d5]">
                        <div
                          className="h-full rounded-full bg-[#8a5d13]"
                          style={{ width: `${72 - index * 16}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                  {[
                    ["문서", "128"],
                    ["서비스", "18"],
                    ["일정", "34"],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-[8px] border border-black/10 bg-[#f5f4f0] px-2 py-2">
                      <p className="font-mono text-[15px] font-semibold">{value}</p>
                      <p className="text-[10px] text-[#77736b]">{label}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>

          <div className="mt-16 max-w-[600px]">
            {steps.map((step, index) => (
              <section key={step.id} id={step.id} className="scroll-mt-8">
                {index > 0 && <hr className="my-10 border-0 border-t border-black/10" />}
                <div className="mb-4 flex items-start gap-4">
                  <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-black/20 font-mono text-[14px] text-[#333338]">
                    {step.number}
                  </div>
                  <div className="min-w-0 flex-1">
                    <span
                      className={`mb-1.5 inline-block rounded-full px-2 py-0.5 text-[12px] font-semibold uppercase tracking-[0.08em] ${toneClasses[step.tone]}`}
                    >
                      {step.tag}
                    </span>
                    <h2 className="text-[20px] font-medium tracking-[-0.02em] text-[#111113]">{step.title}</h2>
                  </div>
                </div>
                <p className="mb-4 text-[17px] leading-[1.85] text-[#222225]">{step.description}</p>
                {step.code && (
                  <pre className="mb-3 overflow-x-auto rounded-lg border border-black/10 bg-[#1e1e24] px-5 py-4 font-mono text-[14px] leading-[1.9] text-[#e2e0da]">
                    {step.code}
                  </pre>
                )}
                {step.tips?.map((tip) => (
                  <div key={tip.label} className="mt-2 rounded-r-md border-l-2 border-black/20 bg-white/[0.24] px-3.5 py-2.5">
                    <p className="mb-1 text-[12px] font-bold uppercase tracking-[0.1em] text-[#666670]">{tip.label}</p>
                    <p className="text-[15.5px] leading-[1.75] text-[#333338]">{tip.text}</p>
                  </div>
                ))}
              </section>
            ))}

            <footer className="mt-20 border-t border-black/10 pt-8 text-[14px] leading-[1.8] text-[#666670]">
              <p>
                기준 문서: <code className="rounded bg-black/[0.06] px-1.5 py-0.5 font-mono text-[12px]">DEVLOG.md</code>
              </p>
              <p className="mt-2">
                다음 작업자는 멤버 관리, 역할별 권한 제한, 사용자 A/B/C 데이터 격리 검증부터 이어가면 됩니다.
              </p>
            </footer>
          </div>
        </div>
      </div>
    </main>
  );
}
