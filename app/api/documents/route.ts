import { NextResponse } from "next/server";
import { fetchDocuments } from "@/lib/documents";

export async function GET() {
  const docs = await fetchDocuments();
  return NextResponse.json(docs, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
