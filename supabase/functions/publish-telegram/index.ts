// Vitrify Admin - Secure Telegram APK Publisher Edge Function
// Reads TELEGRAM_BOT_TOKEN strictly from Supabase Edge Function Secrets.

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ALLOWED_TARGETS = new Set(["channel", "group", "both"]);

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ ok: false, error: "Method not allowed" }, 405);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const telegramBotToken = Deno.env.get("TELEGRAM_BOT_TOKEN");

    if (!supabaseUrl || !serviceRoleKey) {
      return jsonResponse(
        { ok: false, error: "Supabase runtime environment is not configured" },
        500,
      );
    }

    if (!telegramBotToken) {
      return jsonResponse(
        { ok: false, error: "TELEGRAM_BOT_TOKEN secret is not configured" },
        500,
      );
    }

    // 1. Verify caller JWT
    const authHeader = req.headers.get("Authorization") ?? "";
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    if (!match) {
      return jsonResponse({ ok: false, error: "Missing authorization token" }, 401);
    }
    const userJwt = match[1].trim();

    const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
      method: "GET",
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${userJwt}`,
      },
    });

    if (!userRes.ok) {
      return jsonResponse({ ok: false, error: "Invalid or expired session" }, 401);
    }

    const authUser = await userRes.json();
    const userId = authUser?.id;
    if (!userId) {
      return jsonResponse({ ok: false, error: "Unauthorized user" }, 401);
    }

    // 2. Verify caller exists in public.admin_users
    const adminCheckRes = await fetch(
      `${supabaseUrl}/rest/v1/admin_users?user_id=eq.${encodeURIComponent(userId)}&select=user_id,email`,
      {
        method: "GET",
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
        },
      },
    );

    if (!adminCheckRes.ok) {
      return jsonResponse(
        { ok: false, error: "Failed to verify admin permissions" },
        500,
      );
    }

    const adminRows = await adminCheckRes.json();
    if (!Array.isArray(adminRows) || adminRows.length === 0) {
      return jsonResponse(
        { ok: false, error: "Forbidden: admin privileges required" },
        403,
      );
    }

    // 3. Parse & validate request body
    const payload = await req.json().catch(() => null);
    if (!payload || typeof payload !== "object") {
      return jsonResponse({ ok: false, error: "Invalid JSON body" }, 400);
    }

    const target =
      typeof payload.target === "string" && payload.target.trim()
        ? payload.target.trim().toLowerCase()
        : "channel";
    if (!ALLOWED_TARGETS.has(target)) {
      return jsonResponse(
        { ok: false, error: "Invalid target. Must be channel, group, or both" },
        400,
      );
    }

    const apkUrl =
      typeof payload.apk_url === "string" ? payload.apk_url.trim() : "";
    if (!apkUrl || !/^https?:\/\/.+/i.test(apkUrl)) {
      return jsonResponse(
        { ok: false, error: "يرجى إدخال رابط تحميل الـ APK أولاً (update_url)" },
        400,
      );
    }

    const rawVersion =
      typeof payload.version_name === "string" && payload.version_name.trim()
        ? payload.version_name.trim().replace(/^v/i, "")
        : "1.0.0";
    const safeVersion = rawVersion.replace(/[^a-zA-Z0-9._-]/g, "") || "1.0.0";
    const fileName = `Vitrify-v${safeVersion}-release.apk`;

    const caption =
      typeof payload.caption === "string" ? payload.caption.trim().slice(0, 1024) : "";

    const channelId =
      typeof payload.channel_id === "string" && payload.channel_id.trim()
        ? payload.channel_id.trim()
        : "@VitrifyApp";
    const groupId =
      typeof payload.group_id === "string" && payload.group_id.trim()
        ? payload.group_id.trim()
        : "@Vitrify_chat";

    const destinations: Array<{ key: "channel" | "group"; chat_id: string }> = [];
    if (target === "channel" || target === "both") {
      destinations.push({ key: "channel", chat_id: channelId });
    }
    if (target === "group" || target === "both") {
      destinations.push({ key: "group", chat_id: groupId });
    }

    // 4. Fetch the .apk binary following redirects
    const apkRes = await fetch(apkUrl, {
      method: "GET",
      redirect: "follow",
      headers: {
        "User-Agent": "Vitrify-Telegram-Publisher/1.0",
        Accept: "application/vnd.android.package-archive, application/octet-stream, */*",
      },
    });

    if (!apkRes.ok) {
      return jsonResponse(
        {
          ok: false,
          error: `تعذر تنزيل ملف الـ APK من الرابط (HTTP ${apkRes.status})`,
        },
        400,
      );
    }

    const apkBuffer = await apkRes.arrayBuffer();
    if (apkBuffer.byteLength === 0) {
      return jsonResponse(
        { ok: false, error: "ملف الـ APK الذي تم جلبه فارغ (0 bytes)" },
        400,
      );
    }
    if (apkBuffer.byteLength > 50 * 1024 * 1024) {
      return jsonResponse(
        {
          ok: false,
          error: "حجم ملف الـ APK يتجاوز حد Telegram Bot API المباشر (50 ميجابايت)",
        },
        400,
      );
    }

    // 5. Upload APK via multipart/form-data to Telegram sendDocument for each destination
    const telegramEndpoint = `https://api.telegram.org/bot${telegramBotToken}/sendDocument`;
    const results: Array<{
      target: "channel" | "group";
      chat_id: string;
      ok: boolean;
      message_id?: number;
      error?: string;
    }> = [];

    for (const dest of destinations) {
      const formData = new FormData();
      formData.append("chat_id", dest.chat_id);
      if (caption) {
        formData.append("caption", caption);
      }

      const apkBlob = new Blob([apkBuffer], {
        type: "application/vnd.android.package-archive",
      });
      formData.append("document", apkBlob, fileName);

      const tgRes = await fetch(telegramEndpoint, {
        method: "POST",
        body: formData,
      });

      const tgData = await tgRes.json().catch(() => ({}));
      if (tgRes.ok && tgData?.ok) {
        results.push({
          target: dest.key,
          chat_id: dest.chat_id,
          ok: true,
          message_id: tgData?.result?.message_id,
        });
      } else {
        results.push({
          target: dest.key,
          chat_id: dest.chat_id,
          ok: false,
          error:
            tgData?.description ||
            `Telegram API HTTP ${tgRes.status}`,
        });
      }
    }

    const allSucceeded = results.every((r) => r.ok);
    const anySucceeded = results.some((r) => r.ok);

    return jsonResponse(
      {
        ok: anySucceeded,
        allSucceeded,
        fileName,
        fileSizeBytes: apkBuffer.byteLength,
        results,
        ...(allSucceeded
          ? {}
          : {
              error: results
                .filter((r) => !r.ok)
                .map((r) => `${r.chat_id}: ${r.error}`)
                .join(" | "),
            }),
      },
      anySucceeded ? 200 : 502,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ ok: false, error: message }, 500);
  }
});
