// Vitrify Admin v6 - Secure FCM HTTP v1 Push Notification (Topic / Single Token / Multi-Token Array) & Live Silent Sync
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

const MAX_BATCH_CONCURRENCY = 15;
const UNREGISTERED_ERROR_AR = "المستخدم حذف التطبيق أو التوكن غير صالح";

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function extractFcmErrorInfo(status: number, fcmData: Record<string, unknown>) {
  const errObj =
    fcmData && typeof fcmData.error === "object" && fcmData.error !== null
      ? (fcmData.error as Record<string, unknown>)
      : null;

  const fcmStatus = String(errObj?.status || "").toUpperCase();
  const message = String(errObj?.message || `FCM HTTP ${status}`);
  const detailsArr = Array.isArray(errObj?.details) ? errObj.details : [];
  const fcmErrorCodes = detailsArr
    .map((d) =>
      d && typeof d === "object" && "errorCode" in d
        ? String((d as Record<string, unknown>).errorCode || "").toUpperCase()
        : "",
    )
    .filter(Boolean);

  const isUnregisteredOrInvalid =
    status === 404 ||
    fcmStatus === "NOT_FOUND" ||
    fcmStatus === "INVALID_ARGUMENT" ||
    fcmErrorCodes.some((code) =>
      ["UNREGISTERED", "INVALID_ARGUMENT", "SENDER_ID_MISMATCH"].includes(code),
    ) ||
    /notregistered|unregistered|not a valid fcm registration token|requested entity was not found|invalid registration/i.test(
      message,
    );

  return {
    isUnregisteredOrInvalid,
    fcmStatus,
    fcmErrorCodes,
    message,
  };
}

async function clearStaleFcmTokens(
  supabaseUrl: string,
  serviceRoleKey: string,
  tokens: string[],
): Promise<void> {
  const uniqueTokens = Array.from(
    new Set(tokens.map((t) => t.trim()).filter(Boolean)),
  );
  if (uniqueTokens.length === 0) return;

  await Promise.all(
    uniqueTokens.map((token) =>
      fetch(
        `${supabaseUrl}/rest/v1/app_users?fcm_token=eq.${encodeURIComponent(token)}`,
        {
          method: "PATCH",
          headers: {
            apikey: serviceRoleKey,
            Authorization: `Bearer ${serviceRoleKey}`,
            "Content-Type": "application/json",
            Prefer: "return=minimal",
          },
          body: JSON.stringify({ fcm_token: null }),
        },
      ).catch(() => null),
    ),
  );
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
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: res.ok, status: res.status, data };
}

async function sendToTokenBatch(
  tokens: string[],
  buildBodyForToken: (token: string) => Record<string, unknown>,
  projectId: string,
  accessToken: string,
) {
  let sentCount = 0;
  let failedCount = 0;
  const succeededTokens: string[] = [];
  const unregisteredTokens: string[] = [];
  const failedDetails: string[] = [];

  for (let i = 0; i < tokens.length; i += MAX_BATCH_CONCURRENCY) {
    const chunk = tokens.slice(i, i + MAX_BATCH_CONCURRENCY);
    const settled = await Promise.all(
      chunk.map(async (token) => {
        const res = await sendFcmMessage(
          projectId,
          accessToken,
          buildBodyForToken(token),
        );
        return { token, res };
      }),
    );

    for (const item of settled) {
      if (item.res.ok) {
        sentCount += 1;
        succeededTokens.push(item.token);
      } else {
        failedCount += 1;
        const info = extractFcmErrorInfo(item.res.status, item.res.data);
        if (info.isUnregisteredOrInvalid) {
          unregisteredTokens.push(item.token);
        }
        if (failedDetails.length < 5) {
          failedDetails.push(info.message);
        }
      }
    }
  }

  return {
    sentCount,
    failedCount,
    succeededTokens,
    unregisteredTokens,
    failedDetails,
  };
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
        { ok: false, error: "إعدادات خادم Supabase غير مكتملة" },
        500,
      );
    }

    if (!firebaseProjectId || !firebaseClientEmail || !firebasePrivateKey) {
      return jsonResponse(
        { ok: false, error: "مفاتيح Firebase غير مهيأة في أسرار الدالة" },
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
      return jsonResponse({ ok: false, error: "انتهت الجلسة، يرجى تسجيل الدخول مجدداً" }, 401);
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
        { ok: false, error: "تعذر التحقق من صلاحيات المدير" },
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

    const hasFcmTokensField = Object.prototype.hasOwnProperty.call(
      payload,
      "fcm_tokens",
    );
    const fcmTokens: string[] = Array.isArray(payload.fcm_tokens)
      ? Array.from(
          new Set(
            payload.fcm_tokens
              .filter(
                (t: unknown): t is string =>
                  typeof t === "string" && t.trim().length > 0,
              )
              .map((t: string) => t.trim()),
          ),
        )
      : [];

    if (hasFcmTokensField && fcmTokens.length === 0) {
      return jsonResponse(
        { ok: false, error: "لا توجد أجهزة مطابقة تحمل FCM Token صالحاً حالياً" },
        400,
      );
    }

    const fcmToken =
      typeof payload.fcm_token === "string" ? payload.fcm_token.trim() : "";
    const rawTopic =
      typeof payload.topic === "string" && payload.topic.trim()
        ? payload.topic.trim()
        : "all_users";
    const targetLabel =
      typeof payload.target_label === "string" ? payload.target_label.trim() : "";

    const isMultiTokenMode = fcmTokens.length > 0;
    const isSingleTokenMode = !isMultiTokenMode && Boolean(fcmToken);

    if (!isMultiTokenMode && !isSingleTokenMode && !ALLOWED_TOPICS.has(rawTopic)) {
      return jsonResponse(
        {
          ok: false,
          error:
            "Invalid topic. Must be all_users, pro_users, free_users, lab_users, or dev_users",
        },
        400,
      );
    }

    const googleAccessToken = await mintGoogleAccessToken(
      firebaseClientEmail,
      firebasePrivateKey,
    );

    // 4a. Data-only Silent Live Sync mode
    if (silentSync) {
      const ts = String(Date.now());
      if (isMultiTokenMode) {
        const batch = await sendToTokenBatch(
          fcmTokens,
          (token) => {
            const body: Record<string, unknown> = {
              message: {
                token,
                data: { type: "sync_now", ts },
                android: { priority: "HIGH" },
              },
            };
            if (validateOnly) body.validate_only = true;
            return body;
          },
          firebaseProjectId,
          googleAccessToken,
        );

        if (!validateOnly && batch.unregisteredTokens.length > 0) {
          await clearStaleFcmTokens(
            supabaseUrl,
            serviceRoleKey,
            batch.unregisteredTokens,
          );
        }

        if (batch.sentCount === 0) {
          if (batch.unregisteredTokens.length === batch.failedCount) {
            return jsonResponse(
              {
                ok: false,
                silentSync: true,
                unregistered: true,
                sentCount: 0,
                failedCount: batch.failedCount,
                error: UNREGISTERED_ERROR_AR,
                details: batch.failedDetails.join(" | "),
              },
              200,
            );
          }
          return jsonResponse(
            {
              ok: false,
              silentSync: true,
              error: `تعذر إرسال المزامنة الصامتة: ${batch.failedDetails.join(" | ") || "خطأ FCM"}`,
              failedCount: batch.failedCount,
              details: batch.failedDetails,
            },
            502,
          );
        }

        return jsonResponse({
          ok: true,
          silentSync: true,
          sentCount: batch.sentCount,
          failedCount: batch.failedCount,
          unregisteredCount: batch.unregisteredTokens.length,
          totalTargets: fcmTokens.length,
          ...(validateOnly ? { validateOnly: true } : {}),
        });
      }

      const targetField: Record<string, string> = isSingleTokenMode
        ? { token: fcmToken }
        : { topic: rawTopic };

      const syncBody: Record<string, unknown> = {
        message: {
          ...targetField,
          data: { type: "sync_now", ts },
          android: { priority: "HIGH" },
        },
      };
      if (validateOnly) syncBody.validate_only = true;

      const syncRes = await sendFcmMessage(
        firebaseProjectId,
        googleAccessToken,
        syncBody,
      );
      if (!syncRes.ok) {
        const info = extractFcmErrorInfo(syncRes.status, syncRes.data);
        if (isSingleTokenMode && info.isUnregisteredOrInvalid) {
          if (!validateOnly) {
            await clearStaleFcmTokens(supabaseUrl, serviceRoleKey, [fcmToken]);
          }
          return jsonResponse(
            {
              ok: false,
              silentSync: true,
              unregistered: true,
              error: UNREGISTERED_ERROR_AR,
              details: info.message,
            },
            200,
          );
        }

        return jsonResponse(
          {
            ok: false,
            error: `فشل إرسال المزامنة الصامتة: ${info.message}`,
            details: info.message,
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

    // 4b. Standard Push Notification (Topic, Single Token, or Multi-Token Array + optional Deep Link)
    const title = typeof payload.title === "string" ? payload.title.trim() : "";
    const body = typeof payload.body === "string" ? payload.body.trim() : "";
    const rawImageUrl =
      typeof payload.image_url === "string" ? payload.image_url.trim() : "";
    const rawDeepLink =
      typeof payload.deep_link === "string" ? payload.deep_link.trim() : "";

    if (!title || !body) {
      return jsonResponse(
        { ok: false, error: "يرجى إدخال عنوان ونص الإشعار" },
        400,
      );
    }

    if (rawImageUrl && !/^https?:\/\/.+/i.test(rawImageUrl)) {
      return jsonResponse(
        { ok: false, error: "رابط الصورة يجب أن يبدأ بـ http:// أو https://" },
        400,
      );
    }

    if (rawDeepLink && !/^(glassyfi|vitrify|https?):\/\/.+/i.test(rawDeepLink)) {
      return jsonResponse(
        {
          ok: false,
          error:
            "رابط التوجيه يجب أن يبدأ بـ vitrify:// أو glassyfi:// أو http(s)://",
        },
        400,
      );
    }

    const notification: Record<string, string> = { title, body };
    const dataPayload: Record<string, string> = {
      type: "notification",
      title,
      body,
      target: isMultiTokenMode
        ? rawTopic === "online_now"
          ? "online_now"
          : "multi_direct"
        : isSingleTokenMode
          ? "direct"
          : rawTopic,
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

    // Multi-token dispatch (e.g., Online Now / Multi-Filter Deduplicated Set)
    if (isMultiTokenMode) {
      const batch = await sendToTokenBatch(
        fcmTokens,
        (token) => {
          const msgBody: Record<string, unknown> = {
            message: {
              token,
              notification,
              data: dataPayload,
              android: {
                priority: "HIGH",
                notification: androidNotification,
              },
            },
          };
          if (validateOnly) msgBody.validate_only = true;
          return msgBody;
        },
        firebaseProjectId,
        googleAccessToken,
      );

      if (!validateOnly && batch.unregisteredTokens.length > 0) {
        await clearStaleFcmTokens(
          supabaseUrl,
          serviceRoleKey,
          batch.unregisteredTokens,
        );
      }

      if (batch.sentCount === 0) {
        const allUnregistered =
          batch.unregisteredTokens.length === batch.failedCount &&
          batch.failedCount > 0;
        if (allUnregistered) {
          return jsonResponse(
            {
              ok: false,
              unregistered: true,
              sentCount: 0,
              failedCount: batch.failedCount,
              unregisteredCount: batch.unregisteredTokens.length,
              error: UNREGISTERED_ERROR_AR,
              details: batch.failedDetails.join(" | "),
            },
            200,
          );
        }

        return jsonResponse(
          {
            ok: false,
            error: `فشل إرسال الإشعار لجميع الأجهزة المستهدفة: ${batch.failedDetails.join(" | ") || "خطأ FCM"}`,
            sentCount: 0,
            failedCount: batch.failedCount,
            unregisteredCount: batch.unregisteredTokens.length,
            details: batch.failedDetails.join(" | "),
          },
          502,
        );
      }

      if (alsoSilentSync && !validateOnly && batch.succeededTokens.length > 0) {
        const ts = String(Date.now());
        await sendToTokenBatch(
          batch.succeededTokens,
          (token) => ({
            message: {
              token,
              data: { type: "sync_now", ts },
              android: { priority: "HIGH" },
            },
          }),
          firebaseProjectId,
          googleAccessToken,
        ).catch(() => null);
      }

      if (!validateOnly) {
        const historyTopic =
          rawTopic === "online_now" ? "online_now" : "direct_device";
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
            topic: historyTopic,
            image_url: rawImageUrl || null,
            deep_link: rawDeepLink || null,
            target_label: targetLabel || `${batch.sentCount} جهاز`,
          }),
        });
      }

      return jsonResponse({
        ok: true,
        sentCount: batch.sentCount,
        failedCount: batch.failedCount,
        unregisteredCount: batch.unregisteredTokens.length,
        totalTargets: fcmTokens.length,
        ...(validateOnly ? { validateOnly: true } : {}),
      });
    }

    // Single token or Topic dispatch
    const targetField: Record<string, string> = isSingleTokenMode
      ? { token: fcmToken }
      : { topic: rawTopic };

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
      const info = extractFcmErrorInfo(fcmRes.status, fcmRes.data);
      if (isSingleTokenMode && info.isUnregisteredOrInvalid) {
        if (!validateOnly) {
          await clearStaleFcmTokens(supabaseUrl, serviceRoleKey, [fcmToken]);
        }
        return jsonResponse(
          {
            ok: false,
            unregistered: true,
            error: UNREGISTERED_ERROR_AR,
            details: info.message,
          },
          200,
        );
      }

      return jsonResponse(
        {
          ok: false,
          error: `فشل إرسال الإشعار عبر FCM: ${info.message}`,
          details: info.message,
        },
        502,
      );
    }

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
          topic: isSingleTokenMode ? "direct_device" : rawTopic,
          image_url: rawImageUrl || null,
          deep_link: rawDeepLink || null,
          target_label: targetLabel || (isSingleTokenMode ? "جهاز محدد" : null),
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
