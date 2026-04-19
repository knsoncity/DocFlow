import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const { url } = await req.json();
  if (!url) return NextResponse.json({ error: "URL 없음" }, { status: 400 });

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; DocFlow/1.0)" },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) return NextResponse.json({ error: `페이지 접근 실패 (${res.status})` }, { status: 400 });

    const html = await res.text();

    // 블록 요소를 줄바꿈으로 바꿔 문단/리스트 구조를 최대한 보존
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<\/(p|div|section|article|li|ul|ol|h1|h2|h3|h4|h5|h6|tr)>/gi, "\n")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/\r/g, "")
      .replace(/[ \t]{2,}/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
      .slice(0, 8000); // 토큰 절약

    return NextResponse.json({ text, url });
  } catch (e) {
    console.error("parse-url error:", e);
    return NextResponse.json({ error: "URL 파싱 실패. 접근이 차단된 페이지일 수 있습니다." }, { status: 500 });
  }
}
