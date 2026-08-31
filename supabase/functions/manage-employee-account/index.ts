import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Offboards/reactivates an employee's login account. Replaces the old
// Employees.tsx handleDeleteEmployee, which only did DELETE FROM employees
// -- user_profiles, user_roles, user_project_assignments, and the actual
// Supabase auth account were never touched, so a "deleted" employee still
// showed up in every assignment picker and could still log in. Hard
// deletes are also unsafe here: several tables referencing user_profiles
// are NO ACTION/RESTRICT (would just fail) or SET NULL (would silently
// erase real historical attribution), and employees itself cascades to
// attendance/leave_requests.
//
// Instead this bans the Supabase auth account for real (the only actual
// security boundary, since user_profiles has no relationship RLS can lean
// on to block a still-valid JWT) and calls the offboard_employee() RPC to
// revoke role/project access and flip status flags -- no deletes anywhere.
//
// Auth pattern copied from create-employee-account: verify_jwt (deploy-time
// setting) only confirms the caller has a valid JWT, not who they are, so
// the role check below is the real authorization boundary. Uses a direct
// user_roles -> roles table lookup under the service-role client rather
// than the is_super_admin() RPC, which relies on auth.uid() and would
// evaluate to null under a service-role-authenticated call.
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

    const { data: { user: caller }, error: callerError } = await adminClient.auth.getUser(callerJwt);
    if (callerError || !caller) {
      return new Response(JSON.stringify({ error: "Could not resolve caller identity" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Offboarding/reactivating a login is a stricter action than creating
    // one -- super_admin only, unlike create-employee-account's wider
    // allowlist.
    const { data: roleRow, error: roleCheckError } = await adminClient
      .from("user_roles")
      .select("roles(name)")
      .eq("user_id", caller.id)
      .maybeSingle();

    const roleName = (roleRow as any)?.roles?.name;
    if (roleCheckError || roleName !== "super_admin") {
      return new Response(JSON.stringify({ error: "Unauthorized: only a super admin can manage employee accounts" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { action, employee_id, user_id } = await req.json();
    if (!action || !employee_id || !user_id) {
      return new Response(JSON.stringify({ error: "action, employee_id, and user_id are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (user_id === caller.id) {
      return new Response(JSON.stringify({ error: "You cannot manage your own account" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "offboard") {
      // Ban first -- this is the actual security boundary (kills refresh
      // tokens immediately). If the table-side RPC below then refuses
      // (e.g. last super_admin), we unban again so we don't leave someone
      // locked out with none of their access actually revoked.
      const { error: banError } = await adminClient.auth.admin.updateUserById(user_id, {
        ban_duration: "876000h", // ~100 years -- effectively permanent
      });
      if (banError) {
        return new Response(JSON.stringify({ error: banError.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Run the actual DB-side offboarding as the calling super_admin (not
      // the service role) so offboard_employee()'s own is_super_admin()
      // check applies for real -- pass the caller's JWT through to a
      // second client rather than reusing the admin client.
      const callerClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
        auth: { persistSession: false },
        global: { headers: { Authorization: `Bearer ${callerJwt}` } },
      });
      const { error: rpcError } = await callerClient.rpc("offboard_employee", { p_employee_id: employee_id });
      if (rpcError) {
        // Roll back the ban so a refused offboard doesn't still lock the
        // person out with nothing else actually revoked.
        await adminClient.auth.admin.updateUserById(user_id, { ban_duration: "none" });
        return new Response(JSON.stringify({ error: rpcError.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "ban_login") {
      // Deactivate is meant to be reversible -- suspend someone (leave,
      // investigation, etc.) without wiping their role/project assignments
      // the way offboard does, so reactivating puts them back exactly as
      // they were. Previously the Deactivate toggle only flipped
      // employment_status in the employees table and never touched the
      // actual Supabase auth account, so a "deactivated" employee could
      // still log in and use the app normally.
      const { error: banError } = await adminClient.auth.admin.updateUserById(user_id, {
        ban_duration: "876000h",
      });
      if (banError) {
        return new Response(JSON.stringify({ error: banError.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { error: empError } = await adminClient
        .from("employees")
        .update({ employment_status: "inactive" })
        .eq("id", employee_id);
      if (empError) {
        await adminClient.auth.admin.updateUserById(user_id, { ban_duration: "none" });
        return new Response(JSON.stringify({ error: empError.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "unban_login") {
      const { error: unbanError } = await adminClient.auth.admin.updateUserById(user_id, {
        ban_duration: "none",
      });
      if (unbanError) {
        return new Response(JSON.stringify({ error: unbanError.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { error: empError } = await adminClient
        .from("employees")
        .update({ employment_status: "active" })
        .eq("id", employee_id);
      if (empError) {
        return new Response(JSON.stringify({ error: empError.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "reactivate") {
      const { error: unbanError } = await adminClient.auth.admin.updateUserById(user_id, {
        ban_duration: "none",
      });
      if (unbanError) {
        return new Response(JSON.stringify({ error: unbanError.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Role/project assignments are NOT restored here -- kept simple, the
      // super_admin re-assigns them via the normal Employee edit form
      // afterward, same as onboarding anyone else.
      const { error: profileError } = await adminClient
        .from("user_profiles")
        .update({ status: "active" })
        .eq("id", user_id);
      const { error: empError } = await adminClient
        .from("employees")
        .update({ employment_status: "active" })
        .eq("id", employee_id);

      if (profileError || empError) {
        return new Response(JSON.stringify({ error: (profileError || empError)?.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: `Unknown action: ${action}` }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
