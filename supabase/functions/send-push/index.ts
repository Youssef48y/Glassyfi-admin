// Glassyfi Admin v2 - Secure FCM HTTP v1 Push Notification & Live Silent Sync Edge Function
// Reads Firebase credentials strictly from Supabase Edge Function Secrets.

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ALLOWED_TOPICS = new Set([
  "all_users",
  "pro_users",
  "free_users",
  "lab_users",
  "dev_users",
]);

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlEncodeJson(obj: unknown): string {
  const bytes = new TextEncoder().encode(JSON.stringify(obj));
  return base64UrlEncode(bytes);
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const normalized = pem
    .replace(/\\n/g, "\n")
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\s+/g, "");
  const binary = atob(normalized);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

async function mintGoogleAccessToken(
  clientEmail: string,
  privateKeyPem: string,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claimSet = {
    iss: clientEmail,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };

  const signingInput = `${base64UrlEncodeJson(header)}.${base64UrlEncodeJson(claimSet)}`;
  const keyData = pemToArrayBuffer(privateKeyPem);
  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    keyData,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const signatureBuffer = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    new TextEncoder().encode(signingInput),
  );
  const assertion = `${signingInput}.${base64UrlEncode(new Uint8Array(signatureBuffer))}`;

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });

  if (!tokenRes.ok) {
    const errText = await tokenRes.text();
    throw new Error(`Google OAuth2 error (${tokenRes.status}): ${errText}`);
  }

  const tokenJson = await tokenRes.json();
  if (!tokenJson.access_token) {
    throw new Error("Google OAuth2 response did not contain access_token");
  }
  return tokenJson.access_token as string;
}

async function sendFcmMessage(
  projectId: string,
  accessToken: string,
  fcmBody: Record<string, unknown>,
) {
  const res = await fetch(
    `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/messages:send`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(fcmBody),
    },
  );
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
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
    const firebaseProjectId = Deno.env.get("FIREBASE_PROJECT_ID");
    const firebaseClientEmail = Deno.env.get("FIREBASE_CLIENT_EMAIL");
    const firebasePrivateKey = Deno.env.get("FIREBASE_PRIVATE_KEY");

    if (!supabaseUrl || !serviceRoleKey) {
      return jsonResponse(
        { ok: false, error: "Supabase runtime environment is not configured" },
        500,
      );
    }

    if (!firebaseProjectId || !firebaseClientEmail || !firebasePrivateKey) {
      return jsonResponse(
        { ok: false, error: "Firebase secrets are not configured" },
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

    // 3. Parse & validate request payload
    const payload = await req.json().catch(() => null);
    if (!payload || typeof payload !== "object") {
      return jsonResponse({ ok: false, error: "Invalid JSON body" }, 400);
    }

    const silentSync = Boolean(payload.silent_sync);
    const alsoSilentSync = Boolean(payload.also_silent_sync);
    const validateOnly = Boolean(payload.validate_only);

    const fcmToken =
      typeof payload.fcm_token === "string" ? payload.fcm_token.trim() : "";
    const topic =
      typeof payload.topic === "string" && payload.topic.trim()
        ? payload.topic.trim()
        : "all_users";
    const targetLabel =
      typeof payload.target_label === "string" ? payload.target_label.trim() : "";

    if (!fcmToken && !ALLOWED_TOPICS.has(topic)) {
      return jsonResponse(
        {
          ok: false,
          error:
            "Invalid topic. Must be all_users, pro_users, free_users, lab_users, or dev_users",
        },
        400,
      );
    }

    const targetField: Record<string, string> = fcmToken
      ? { token: fcmToken }
      : { topic };

    const googleAccessToken = await mintGoogleAccessToken(
      firebaseClientEmail,
      firebasePrivateKey,
    );

    // 4a. Data-only Silent Live Sync mode
    if (silentSync) {
      const syncBody: Record<string, unknown> = {
        message: {
          ...targetField,
          data: {
            type: "sync_now",
            ts: String(Date.now()),
          },
          android: {
            priority: "HIGH",
          },
        },
      };
      if (validateOnly) syncBody.validate_only = true;

      const syncRes = await sendFcmMessage(
        firebaseProjectId,
        googleAccessToken,
        syncBody,
      );
      if (!syncRes.ok) {
        return jsonResponse(
          {
            ok: false,
            error: "Silent sync FCM failed",
            details: syncRes.data?.error?.message ?? syncRes.data,
          },
          502,
        );
      }

      return jsonResponse({
        ok: true,
        silentSync: true,
        messageId: syncRes.data?.name ?? null,
        ...(validateOnly ? { validateOnly: true } : {}),
      });
    }

    // 4b. Standard Push Notification (Topic or Single Device Token + optional Deep Link)
    const title = typeof payload.title === "string" ? payload.title.trim() : "";
    const body = typeof payload.body === "string" ? payload.body.trim() : "";
    const rawImageUrl =
      typeof payload.image_url === "string" ? payload.image_url.trim() : "";
    const rawDeepLink =
      typeof payload.deep_link === "string" ? payload.deep_link.trim() : "";

    if (!title || !body) {
      return jsonResponse(
        { ok: false, error: "Both title and body are required" },
        400,
      );
    }

    if (rawImageUrl && !/^https?:\/\/.+/i.test(rawImageUrl)) {
      return jsonResponse(
        { ok: false, error: "image_url must be a valid http(s) URL" },
        400,
      );
    }

    if (rawDeepLink && !/^(glassyfi|https?):\/\/.+/i.test(rawDeepLink)) {
      return jsonResponse(
        { ok: false, error: "deep_link must start with glassyfi://, http://, or https://" },
        400,
      );
    }

    const notification: Record<string, string> = { title, body };
    const dataPayload: Record<string, string> = {
      type: "notification",
      title,
      body,
      target: fcmToken ? "direct" : topic,
    };
    const androidNotification: Record<string, string> = { sound: "default" };

    if (rawImageUrl) {
      notification.image = rawImageUrl;
      dataPayload.image_url = rawImageUrl;
      androidNotification.image = rawImageUrl;
    }

    if (rawDeepLink) {
      dataPayload.deep_link = rawDeepLink;
    }

    const fcmBody: Record<string, unknown> = {
      message: {
        ...targetField,
        notification,
        data: dataPayload,
        android: {
          priority: "HIGH",
          notification: androidNotification,
        },
      },
    };
    if (validateOnly) {
      fcmBody.validate_only = true;
    }

    const fcmRes = await sendFcmMessage(
      firebaseProjectId,
      googleAccessToken,
      fcmBody,
    );

    if (!fcmRes.ok) {
      return jsonResponse(
        {
          ok: false,
          error: "FCM send failed",
          details: fcmRes.data?.error?.message ?? fcmRes.data,
        },
        502,
      );
    }

    // Optional paired silent sync ping (e.g. Lab Approval immediate unlock)
    if (alsoSilentSync && !validateOnly) {
      await sendFcmMessage(firebaseProjectId, googleAccessToken, {
        message: {
          ...targetField,
          data: {
            type: "sync_now",
            ts: String(Date.now()),
          },
          android: {
            priority: "HIGH",
          },
        },
      }).catch(() => null);
    }

    // 5. Log to push_history (skip when validate_only is true)
    if (!validateOnly) {
      await fetch(`${supabaseUrl}/rest/v1/push_history`, {
        method: "POST",
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        },
        body: JSON.stringify({
          title,
          body,
          topic: fcmToken ? "direct_device" : topic,
          image_url: rawImageUrl || null,
          deep_link: rawDeepLink || null,
          target_label: targetLabel || (fcmToken ? "جهاز محدد" : null),
        }),
      });
    }

    return jsonResponse({
      ok: true,
      messageId: fcmRes.data?.name ?? null,
      ...(validateOnly ? { validateOnly: true } : {}),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ ok: false, error: message }, 500);
  }
});
