export function isWorkspaceSchemaError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const { code, message } = error as { code?: string; message?: string };
  return (
    code === "42703" ||
    code === "PGRST204" ||
    code === "PGRST205" ||
    Boolean(message?.includes("workspace_id")) ||
    Boolean(message?.includes("workspaces"))
  );
}
