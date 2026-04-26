import type { User } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "./supabase";

export async function getAuthUserFromRequest(req: Request): Promise<User | null> {
  const authorization = req.headers.get("authorization");
  const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];

  if (!token) return null;

  const { data, error } = await getSupabaseAdmin().auth.getUser(token);
  if (error) {
    console.error("getAuthUserFromRequest:", error.message);
    return null;
  }

  return data.user ?? null;
}

export function getDisplayNameFromUser(user: User | null) {
  if (!user) return undefined;

  const metadata = user.user_metadata as {
    name?: string;
    full_name?: string;
    preferred_username?: string;
  };

  return (
    metadata.full_name?.trim() ||
    metadata.name?.trim() ||
    metadata.preferred_username?.trim() ||
    user.email?.trim() ||
    undefined
  );
}
