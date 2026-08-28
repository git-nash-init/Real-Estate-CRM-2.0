import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Replaces the old client-side supabase.auth.signUp() call in
// Employees.tsx's onboarding flow. That call went through the PUBLIC
// signup endpoint, which sends a confirmation email even when the caller
// never uses it -- and Supabase's built-in email sender caps out at a
// handful of sends per hour on the free tier, so onboarding the 3rd+
// employee in a short span failed with "email rate limit exceeded"
// (confirmed live). The admin.createUser() call used here is a privileged
// server-side call that never sends an email at all when `email_confirm`
// is true, so it has no rate-limit exposure -- and it also means the
// service_role key never has to reach the browser.
//
// `verify_jwt: true` (set at deploy time) means Supabase has already
// authenticated the caller's JWT before this code runs. What it does NOT
// do is check *who* the caller is, so the super_admin check below is the
// real authorization boundary -- without it, any logged-in user could
// call this function to mint arbitrary new accounts.
//
// v2 fix: the first version tried to identify the caller via
// auth.getUser() on a client built with the service_role key and the
// caller's JWT stuffed into `global.headers.Authorization`. That header
// override is only honoured by PostgREST/Storage/Functions requests --
// auth.getUser() ignores it entirely unless the token is passed as an
// explicit argument, so it always failed with "Could not resolve caller
// identity". Separately, even if identity resolution had worked, calling
// the existing is_super_admin() RPC through a service-role-keyed client
// would evaluate auth.uid() as null (service role has no user context),
// so that check would always have returned false. Fixed by extracting the
// JWT explicitly and checking the caller's role via a direct table query
// with the admin client (safe: identity was already verified first).
// Verified live end-to-end after this fix.
Deno.serve(async (req: Request) => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing Authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const callerJwt = authHeader.replace(/^Bearer\s+/i, "");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    // Explicitly verify the caller's own JWT against the Auth server --
    // this does NOT use the admin client's own identity, it validates
    // whichever token is passed as the argument.
    const { data: { user: caller }, error: callerError } = await adminClient.auth.getUser(callerJwt);
    if (callerError || !caller) {
      return new Response(JSON.stringify({ error: "Could not resolve caller identity" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Role check via direct table query (RLS-bypassing service client, but
    // identity is already pinned above) rather than the is_super_admin()
    // RPC, which relies on auth.uid() and would be null under a
    // service-role-authenticated call.
    const { data: roleRow, error: roleCheckError } = await adminClient
      .from("user_roles")
      .select("roles(name)")
      .eq("user_id", caller.id)
      .maybeSingle();

    const roleName = (roleRow as any)?.roles?.name;
    const allowedRoles = ["super_admin", "site_head", "sourcing_manager_tl", "sourcing_manager"];
    if (roleCheckError || !allowedRoles.includes(roleName)) {
      return new Response(JSON.stringify({ error: "Unauthorized: only administrators and managers can create accounts" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { email, password, full_name } = await req.json();
    if (!email || !password) {
      return new Response(JSON.stringify({ error: "email and password are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: created, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: full_name ? { full_name } : undefined,
    });

    if (createError) {
      return new Response(JSON.stringify({ error: createError.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ id: created.user.id, email: created.user.email }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
