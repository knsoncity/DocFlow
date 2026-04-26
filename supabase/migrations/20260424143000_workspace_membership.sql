-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Workspaces table
CREATE TABLE IF NOT EXISTS workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  owner_user_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO workspaces (id, name)
VALUES ('00000000-0000-4000-8000-000000000001', 'DocFlow Shared Workspace')
ON CONFLICT (id) DO NOTHING;

-- Workspace members table
CREATE TABLE IF NOT EXISTS workspace_members (
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner','admin','member','viewer')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (workspace_id, user_id)
);

-- Services table
CREATE TABLE IF NOT EXISTS services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001' REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE services
  ADD COLUMN IF NOT EXISTS workspace_id UUID NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001' REFERENCES workspaces(id) ON DELETE CASCADE;

ALTER TABLE services DROP CONSTRAINT IF EXISTS services_name_key;
ALTER TABLE services DROP CONSTRAINT IF EXISTS services_workspace_id_name_key;
ALTER TABLE services
  ADD CONSTRAINT services_workspace_id_name_key UNIQUE (workspace_id, name);

-- Documents table
CREATE TABLE IF NOT EXISTS documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001' REFERENCES workspaces(id) ON DELETE CASCADE,
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

ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS workspace_id UUID NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001' REFERENCES workspaces(id) ON DELETE CASCADE;

-- Document relations table
CREATE TABLE IF NOT EXISTS doc_relations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001' REFERENCES workspaces(id) ON DELETE CASCADE,
  from_doc UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  to_doc UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  relation_type TEXT NOT NULL CHECK (relation_type IN ('parent','version','reference','linked_service')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(from_doc, to_doc, relation_type)
);

ALTER TABLE doc_relations
  ADD COLUMN IF NOT EXISTS workspace_id UUID NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001' REFERENCES workspaces(id) ON DELETE CASCADE;

-- Schedules table
CREATE TABLE IF NOT EXISTS schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001' REFERENCES workspaces(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  category TEXT NOT NULL DEFAULT '기타',
  color TEXT,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE schedules
  ADD COLUMN IF NOT EXISTS workspace_id UUID NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001' REFERENCES workspaces(id) ON DELETE CASCADE;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_services_workspace_id ON services(workspace_id);
CREATE INDEX IF NOT EXISTS idx_documents_service_id ON documents(service_id);
CREATE INDEX IF NOT EXISTS idx_documents_workspace_id ON documents(workspace_id);
CREATE INDEX IF NOT EXISTS idx_documents_doc_type ON documents(doc_type);
CREATE INDEX IF NOT EXISTS idx_documents_created_at ON documents(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_doc_relations_workspace_id ON doc_relations(workspace_id);
CREATE INDEX IF NOT EXISTS idx_doc_relations_from ON doc_relations(from_doc);
CREATE INDEX IF NOT EXISTS idx_doc_relations_to ON doc_relations(to_doc);
CREATE INDEX IF NOT EXISTS idx_schedules_workspace_start ON schedules(workspace_id, start_date);
CREATE INDEX IF NOT EXISTS idx_workspace_members_user_id ON workspace_members(user_id);

-- Row level security baseline for future direct client access.
ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE services ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE doc_relations ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "workspace members can view workspaces" ON workspaces;
CREATE POLICY "workspace members can view workspaces"
ON workspaces FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM workspace_members
    WHERE workspace_members.workspace_id = workspaces.id
      AND workspace_members.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "users can view own memberships" ON workspace_members;
CREATE POLICY "users can view own memberships"
ON workspace_members FOR SELECT
USING (user_id = auth.uid());

DROP POLICY IF EXISTS "members can view services" ON services;
CREATE POLICY "members can view services"
ON services FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM workspace_members
    WHERE workspace_members.workspace_id = services.workspace_id
      AND workspace_members.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "members can view documents" ON documents;
CREATE POLICY "members can view documents"
ON documents FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM workspace_members
    WHERE workspace_members.workspace_id = documents.workspace_id
      AND workspace_members.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "members can view relations" ON doc_relations;
CREATE POLICY "members can view relations"
ON doc_relations FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM workspace_members
    WHERE workspace_members.workspace_id = doc_relations.workspace_id
      AND workspace_members.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "members can view schedules" ON schedules;
CREATE POLICY "members can view schedules"
ON schedules FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM workspace_members
    WHERE workspace_members.workspace_id = schedules.workspace_id
      AND workspace_members.user_id = auth.uid()
  )
);
