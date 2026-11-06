"use strict";
/**
 * One-shot WhatsApp template connectivity check, disabled by default.
 * Requires an explicit deployment-scoped test ID and recipient.
 * Does not run for real customers, never retries, never logs secrets or contact numbers.
 * File marker suppresses repeat attempts on restarts of the same instance.
 * Administrators MUST clear VITRINE_ONE_SHOT_TEST_ID and VITRINE_ONE_SHOT_TEST_TO
 * immediately after the attempt.
 */
const fs = require("node:fs");
const crypto = require("node:crypto");

async function runOneShotTest() {
  const id = process.env.VITRINE_ONE_SHOT_TEST_ID || "";
  const to = process.env.VITRINE_ONE_SHOT_TEST_TO || "";
  const template = process.env.VITRINE_ONE_SHOT_TEST_TEMPLATE || "";
  const language = process.env.VITRINE_ONE_SHOT_TEST_LANGUAGE || "en_US";
  if (!id || !to || !template) return;
  if (!/^[a-zA-Z0-9_-]{12,80}$/.test(id) ||
      !/^[1-9][0-9]{7,14}$/.test(to) ||
      !/^[a-z][a-z0-9_]{0,199}$/.test(template) ||
      !/^[a-z]{2,3}_[A-Z]{2}$/.test(language)) {
    console.error("ONE_SHOT_TEST_INVALID_CONFIG"); return;
  }
  const token = process.env.META_WA_ACCESS_TOKEN;
  const phoneId = process.env.META_PHONE_NUMBER_ID;
  if (!token || !/^[0-9]{6,20}$/.test(phoneId || "")) {
    console.error("ONE_SHOT_TEST_MISSING_META_CREDENTIALS"); return;
  }

  const marker = "/tmp/vitrine-test-" + crypto.createHash("sha256").update(id).digest("hex").slice(0,32);
  try {fs.writeFileSync(marker, "started", {flag:"wx", mode:0o600});}
  catch (err) {
    if (err.code === "EEXIST") {
      console.log("ONE_SHOT_TEST_ALREADY_ATTEMPTED", JSON.stringify({id})); return;
    }
    console.error("ONE_SHOT_TEST_MARKER_ERROR"); return;
  }

  console.log("ONE_SHOT_TEST_BEGIN", JSON.stringify({id,template}));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch("https://graph.facebook.com/v25.0/" + phoneId + "/messages", {
      method:"POST",
      headers:{"Authorization":"Bearer " + token,"Content-Type":"application/json"},
      body:JSON.stringify({
        messaging_product:"whatsapp",
        to,
        type:"template",
        template:{name:template,language:{code:language}}
      }),
      signal:controller.signal
    });
    const payload = await response.json().catch(()=>({}));
    const output = {
      id, accepted_by_meta:response.ok, http_status:response.status,
      message_id:response.ok ? (payload.messages?.[0]?.id || null) : null,
      error_code:response.ok ? null : (payload.error?.code || null),
      error_type:response.ok ? null : (payload.error?.type || null)
    };
    console.log("ONE_SHOT_TEST_RESULT", JSON.stringify(output));
  } catch (e) {
    console.log("ONE_SHOT_TEST_ERROR", JSON.stringify({
      id, code:e?.name === "AbortError" ? "TIMEOUT" : "NETWORK_ERROR",
      delivery_status:"unknown_no_retry"
    }));
  } finally {
    clearTimeout(timer);
  }
}
module.exports = {runOneShotTest};
