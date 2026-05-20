import { NextRequest, NextResponse } from "next/server";

export interface ConfluencePage {
  id: string;
  title: string;
  url: string;
  childCount: number;
}

function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<\/(p|div|section|article|li|ul|ol|h1|h2|h3|h4|h5|h6|tr)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\r/g, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export { htmlToText };

// GET /api/confluence/pages?baseUrl=...&pageId=...
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const baseUrl = searchParams.get("baseUrl")?.replace(/\/$/, "");
  const pageId = searchParams.get("pageId");
  const pat = req.headers.get("x-confluence-token");

  if (!baseUrl || !pageId) {
    return NextResponse.json({ error: "baseUrl과 pageId가 필요합니다." }, { status: 400 });
  }
  if (!pat) {
    return NextResponse.json({ error: "Confluence PAT 토큰이 필요합니다." }, { status: 401 });
  }

  try {
    const url = `${baseUrl}/rest/api/content/${pageId}/child/page?limit=100&expand=children.page`;
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${pat}`,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error("Confluence pages error:", res.status, text.slice(0, 200));
      return NextResponse.json(
        { error: `Confluence API 오류 (${res.status}). PAT 토큰과 URL을 확인해주세요.` },
        { status: res.status === 401 || res.status === 403 ? 401 : 502 }
      );
    }

    const data = (await res.json()) as {
      results?: Array<{
        id: string;
        title: string;
        _links?: { webui?: string };
        children?: { page?: { size?: number } };
      }>;
      size?: number;
    };

    const pages: ConfluencePage[] = (data.results ?? []).map((p) => ({
      id: p.id,
      title: p.title,
      url: p._links?.webui ? `${baseUrl}${p._links.webui}` : `${baseUrl}/pages/${p.id}`,
      childCount: p.children?.page?.size ?? 0,
    }));

    return NextResponse.json({ pages, total: data.size ?? pages.length });
  } catch (e) {
    console.error("confluence/pages error:", e);
    return NextResponse.json({ error: "페이지 목록을 가져오지 못했습니다." }, { status: 500 });
  }
}
