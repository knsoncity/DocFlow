import { NextRequest, NextResponse } from "next/server";
import { SpreadsheetSheet } from "@/app/types";

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get("file") as File | null;

  if (!file) return NextResponse.json({ error: "파일 없음" }, { status: 400 });

  const ext = file.name.split(".").pop()?.toLowerCase();
  const buffer = Buffer.from(await file.arrayBuffer());
  let text = "";
  let spreadsheetSheets: SpreadsheetSheet[] | undefined;

  try {
    if (ext === "pdf") {
      const pdfParse = await import("pdf-parse");
      const parseFn = (pdfParse as unknown as { default: (b: Buffer) => Promise<{ text: string }> }).default ?? pdfParse;
      const result = await parseFn(buffer);
      text = result.text;
    } else if (ext === "docx") {
      const mammoth = await import("mammoth");
      const result = await mammoth.extractRawText({ buffer });
      text = result.value;
    } else if (["txt", "md"].includes(ext ?? "")) {
      text = buffer.toString("utf-8");
    } else if (["xlsx", "xls", "csv"].includes(ext ?? "")) {
      const XLSX = await import("xlsx");
      const workbook =
        ext === "csv"
          ? XLSX.read(buffer.toString("utf-8"), { type: "string" })
          : XLSX.read(buffer, { type: "buffer" });
      const parts: string[] = [];
      spreadsheetSheets = [];
      for (const sheetName of workbook.SheetNames) {
        const sheet = workbook.Sheets[sheetName];
        const rows = XLSX.utils
          .sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" })
          .map((row) =>
            (row as unknown[]).map((cell) =>
              cell == null ? "" : typeof cell === "string" ? cell : String(cell)
            )
          )
          .filter((row) => row.some((cell) => cell.trim() !== ""));
        if (rows.length === 0) continue;
        spreadsheetSheets.push({ name: sheetName, rows });
        const header = rows[0] as string[];
        const separator = header.map(() => "---");
        const mdRows = [header, separator, ...(rows.slice(1) as string[][])].map(
          (row) => `| ${(row as string[]).join(" | ")} |`
        );
        parts.push(`### 시트: ${sheetName}\n\n${mdRows.join("\n")}`);
      }
      text = parts.join("\n\n");
    } else {
      return NextResponse.json({ error: "지원하지 않는 파일 형식입니다. (PDF, DOCX, TXT, MD, CSV, XLSX)" }, { status: 400 });
    }

    return NextResponse.json({
      text: text.trim(),
      fileName: file.name,
      spreadsheetSheets,
    });
  } catch (e) {
    console.error("parse-file error:", e);
    return NextResponse.json({ error: "파일 파싱 실패" }, { status: 500 });
  }
}
