import { createClient } from "@/lib/supabase/server";

export async function getAdminContext() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null, isSuperadmin: false };
  // profiles.is_superadmin isn't readable by regular queries (RLS lockdown), so ask the database via its
  // SECURITY DEFINER helper, which checks profiles.is_superadmin = TRUE for the signed-in user.
  const { data } = await supabase.rpc("is_superadmin");
  return { supabase, user, isSuperadmin: data === true };
}

/** For server actions / route handlers: throws unless profiles.is_superadmin is TRUE. */
export async function requireSuperadmin() {
  const ctx = await getAdminContext();
  if (!ctx.user || !ctx.isSuperadmin) throw new Error("Forbidden: superadmin only");
  return { supabase: ctx.supabase, user: ctx.user };
}
