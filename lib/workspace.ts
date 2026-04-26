export const DEFAULT_WORKSPACE_ID =
  process.env.DOCFLOW_DEFAULT_WORKSPACE_ID ??
  process.env.NEXT_PUBLIC_DOCFLOW_WORKSPACE_ID ??
  "00000000-0000-4000-8000-000000000001";

const WORKSPACE_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function normalizeWorkspaceId(value?: string | null) {
  const workspaceId = value?.trim();
  return workspaceId && WORKSPACE_ID_PATTERN.test(workspaceId)
    ? workspaceId
    : DEFAULT_WORKSPACE_ID;
}

export function getWorkspaceIdFromRequest(req: Request) {
  const url = new URL(req.url);
  return normalizeWorkspaceId(
    url.searchParams.get("workspaceId") ?? req.headers.get("x-docflow-workspace-id")
  );
}
