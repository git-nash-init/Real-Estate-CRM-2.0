import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Bans/unbans a Channel Partner's login account, mirroring
// manage-employee-account. ChannelPartners.tsx previously toggled
// channel_partners.status (which correctly hides the CP from every
// picker, since those already filter on it) and hard-deleted the row on
// Delete, but neither path ever touched the actual Supabase auth account
// -- a deactivated or deleted CP with a linked login could still sign in
// and use the app normally.
//
// Delete keeps hard-deleting the channel_partners row (channel_partners
// already has cp_leads/cp_commissions as RESTRICT foreign keys, so a CP
// with real history simply can't be deleted -- the DB itself is the
// safety net there, unlike employees where a hard delete would silently
// corrupt historical attribution). This only adds the missing ban.
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

    const { data: roleRow, error: roleCheckError } = await adminClient
      .from("user_roles")
      .select("roles(name)")
      .eq("user_id", caller.id)
      .maybeSingle();

    const roleName = (roleRow as any)?.roles?.name;
    if (roleCheckError || roleName !== "super_admin") {
      return new Response(JSON.stringify({ error: "Unauthorized: only a super admin can manage Channel Partner accounts" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { action, cp_id, user_id } = await req.json();
    if (!action || !cp_id) {
      return new Response(JSON.stringify({ error: "action and cp_id are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "ban_login") {
      if (!user_id) {
        return new Response(JSON.stringify({ error: "user_id is required to ban a login" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { error: banError } = await adminClient.auth.admin.updateUserById(user_id, {
        ban_duration: "876000h",
      });
      if (banError) {
        return new Response(JSON.stringify({ error: banError.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { error: cpError } = await adminClient
        .from("channel_partners")
        .update({ status: "inactive", updated_at: new Date().toISOString() })
        .eq("id", cp_id);
      if (cpError) {
        await adminClient.auth.admin.updateUserById(user_id, { ban_duration: "none" });
        return new Response(JSON.stringify({ error: cpError.message }), {
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
      if (!user_id) {
        return new Response(JSON.stringify({ error: "user_id is required to unban a login" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { error: unbanError } = await adminClient.auth.admin.updateUserById(user_id, {
        ban_duration: "none",
      });
      if (unbanError) {
        return new Response(JSON.stringify({ error: unbanError.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { error: cpError } = await adminClient
        .from("channel_partners")
        .update({ status: "active", updated_at: new Date().toISOString() })
        .eq("id", cp_id);
      if (cpError) {
        return new Response(JSON.stringify({ error: cpError.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "ban_and_delete") {
      // Ban first (if there's a login to ban) so the security boundary
      // takes effect immediately; if the row delete is then refused by a
      // foreign key (real commission/lead history), unban again so we
      // don't leave someone locked out over a delete that didn't happen.
      if (user_id) {
        const { error: banError } = await adminClient.auth.admin.updateUserById(user_id, {
          ban_duration: "876000h",
        });
        if (banError) {
          return new Response(JSON.stringify({ error: banError.message }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }

      const { error: deleteError } = await adminClient
        .from("channel_partners")
        .delete()
        .eq("id", cp_id);
      if (deleteError) {
        if (user_id) {
          await adminClient.auth.admin.updateUserById(user_id, { ban_duration: "none" });
        }
        return new Response(JSON.stringify({ error: deleteError.message }), {
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
