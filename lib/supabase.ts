import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// 클라이언트 사이드용 (읽기)
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// 서버 사이드 전용 (API route에서만 import할 것)
export function getSupabaseAdmin() {
  return createClient(
    supabaseUrl,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export type DbDocument = {
  id: string;
  workspace_id?: string | null;
  service_id: string | null;
  raw_content: string;
  doc_type: string | null;
  feature_name: string | null;
  version: string | null;
  author: string | null;
  summary: string | null;
  keywords: string[] | null;
  completeness: number | null;
  missing_parts: string[] | null;
  related_doc_types: string[] | null;
  created_at: string;
  services?: { name: string } | null;
};

export type DbService = {
  id: string;
  workspace_id?: string | null;
  name: string;
  created_at: string;
};

export type DbDocRelation = {
  id: string;
  workspace_id?: string | null;
  from_doc: string;
  to_doc: string;
  relation_type: string;
};
