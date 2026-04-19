-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Services table
CREATE TABLE IF NOT EXISTS services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Documents table
CREATE TABLE IF NOT EXISTS documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id UUID REFERENCES services(id) ON DELETE SET NULL,
  raw_content TEXT NOT NULL,
  doc_type TEXT CHECK (doc_type IN ('PRD','화면정의서','플로우차트','API명세','회의록','기타')),
  feature_name TEXT,
  version TEXT,
  author TEXT,
  summary TEXT,
  keywords TEXT[],
  completeness INT CHECK (completeness BETWEEN 0 AND 100),
  missing_parts TEXT[],
  related_doc_types TEXT[],
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Document relations table
CREATE TABLE IF NOT EXISTS doc_relations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_doc UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  to_doc UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  relation_type TEXT NOT NULL CHECK (relation_type IN ('parent','version','reference','linked_service')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(from_doc, to_doc, relation_type)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_documents_service_id ON documents(service_id);
CREATE INDEX IF NOT EXISTS idx_documents_doc_type ON documents(doc_type);
CREATE INDEX IF NOT EXISTS idx_documents_created_at ON documents(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_doc_relations_from ON doc_relations(from_doc);
CREATE INDEX IF NOT EXISTS idx_doc_relations_to ON doc_relations(to_doc);
