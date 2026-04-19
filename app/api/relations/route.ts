import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function GET() {
  const { data, error } = await getSupabaseAdmin()
    .from("doc_relations")
    .select("from_doc, to_doc, relation_type");

  if (error) {
    console.error("relations GET:", error);
    return NextResponse.json({ relations: [] });
  }

  return NextResponse.json({ relations: data ?? [] });
}
