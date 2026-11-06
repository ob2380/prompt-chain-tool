import { createClient } from "@/lib/supabase/server";

export async function getAdminContext() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null, isSuperadmin: false };
  const { data: profile } = await supabase
    .from("profiles")
    .select("is_superadmin")
    .eq("id", user.id)
    .maybeSingle();
  return { supabase, user, isSuperadmin: profile?.is_superadmin === true };
}

/** For server actions / route handlers: throws unless profiles.is_superadmin is TRUE. */
export async function requireSuperadmin() {
  const ctx = await getAdminContext();
  if (!ctx.user || !ctx.isSuperadmin) throw new Error("Forbidden: superadmin only");
  return { supabase: ctx.supabase, user: ctx.user };
}
