"use strict";

/**
 * Vitrine Criativa Web — Meta WhatsApp Cloud API webhook receiver.
 * Isolated from the existing Peach integration. NO auto-sending, forwarding, storing, or logging message bodies.
 * Production message processing MUST wait for APP_SECRET to be configured and authorized.
 */
const http = require("node:http");
const crypto = require("node:crypto");
const outbound = require("./send-api");
const mcpServer = require("./mcp");
const inbox = require("./postgres-inbox");
const port = Number(process.env.PORT || 3000);
const route = "/webhooks/whatsapp";

function fixedEquals(a, b) {
  const x = Buffer.from(String(a || ""), "utf8");
  const y = Buffer.from(String(b || ""), "utf8");
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

function reply(res, status, data, contentType = "text/plain; charset=utf-8") {
  res.writeHead(status, {
    "Content-Type": contentType,
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff"
  });
  res.end(data);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url || "/", "http://localhost");

  if (req.method === "GET" && url.pathname === "/health") {
    return reply(res, 200, JSON.stringify({
      ok: true,
      service: "vitrine-vendedor-ia-webhook",
      whatsapp_verify_token_set: Boolean(process.env.WEBHOOK_VERIFY_TOKEN),
      app_signature_enabled: Boolean(process.env.META_APP_SECRET),
      auto_reply_enabled: false,
      access_token_set: Boolean(process.env.META_WA_ACCESS_TOKEN),
      phone_number_id_set: Boolean(process.env.META_PHONE_NUMBER_ID),
      outbound_integration_enabled: Boolean(process.env.VITRINE_SEND_API_KEY && process.env.VITRINE_SEND_API_KEY.length >= 24)
    }), "application/json; charset=utf-8");
  }

  if (req.method === "GET" && url.pathname === "/chat") {
    const fs = require("node:fs");
    const file = require("node:path").join(__dirname, "chat.html");
    return reply(res, 200, fs.readFileSync(file, "utf8"), "text/html; charset=utf-8");
  }
  if (url.pathname === "/api/whatsapp/inbox") {
    if (req.method !== "GET") return reply(res, 405, "Method not allowed");
    const secret = process.env.VITRINE_SEND_API_KEY || "";
    const auth = String(req.headers.authorization || "");
    if (secret.length < 24 || !auth.startsWith("Bearer ") || !fixedEquals(auth.slice(7), secret)) {
      return reply(res, 401, JSON.stringify({error:"Unauthorized"}), "application/json; charset=utf-8");
    }
    const limit = url.searchParams.get("limit") || "30";
    const date = url.searchParams.get("date") || undefined;
    return inbox.list({limit,date}).then(result =>
      reply(res, 200, JSON.stringify(result), "application/json; charset=utf-8")
    ).catch(() => reply(res, 503, JSON.stringify({error:"Inbox unavailable"}), "application/json; charset=utf-8"));
  }
  if (url.pathname === "/mcp") return mcpServer.mcp(req, res);

  if (req.method === "GET" && url.pathname === "/openapi.json") {
    return reply(res, 200, JSON.stringify(outbound.schema), "application/json; charset=utf-8");
  }
  if (req.method === "POST" && url.pathname === outbound.PATH) {
    return outbound.sendTemplate(req, res);
  }

  if (url.pathname !== route) return reply(res, 404, "Not found");

  if (req.method === "GET") {
    const expected = process.env.WEBHOOK_VERIFY_TOKEN;
    const mode = url.searchParams.get("hub.mode");
    const receivedToken = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");
    if (expected && mode === "subscribe" && fixedEquals(receivedToken, expected) &&
        challenge !== null && /^\d{1,24}$/.test(challenge)) {
      return reply(res, 200, challenge);
    }
    return reply(res, 403, "Verification failed");
  }

  if (req.method !== "POST") return reply(res, 405, "Method not allowed");

  const appSecret = process.env.META_APP_SECRET;
  if (!appSecret) return reply(res, 503, "Webhook signatures are not configured");

  let size = 0;
  const chunks = [];
  req.on("data", chunk => {
    size += chunk.length;
    if (size > 1024 * 1024) {
      req.destroy();
      return;
    }
    chunks.push(chunk);
  });
  req.on("end", async () => {
    const body = Buffer.concat(chunks);
    const received = req.headers["x-hub-signature-256"];
    const expected = "sha256=" + crypto.createHmac("sha256", appSecret).update(body).digest("hex");
    if (!received || !fixedEquals(received, expected)) {
      return reply(res, 401, "Invalid signature");
    }
    try {
      const event = JSON.parse(body.toString("utf8"));
      // Persist verified incoming messages before acknowledging Meta.
      const received = await inbox.ingest(event);
      const entries = Array.isArray(event.entry) ? event.entry.length : 0;
      console.log("Valid webhook received", JSON.stringify({type: event.object || "unknown", entries, received}));
      return reply(res, 200, "EVENT_RECEIVED");
    } catch (error) {
      console.error("Webhook processing failed", error?.name || "error");
      return reply(res, 503, "Webhook processing unavailable");
    }
  });
  req.on("error", () => { if (!res.headersSent) reply(res, 400, "Request error"); });
});

server.listen(port, "0.0.0.0", () => {
  console.log("Meta webhook receiver listening", JSON.stringify({port, route}));
  // An explicit, isolated, one-attempt test runs only if dedicated env vars exist.
  require("./one-shot-test").runOneShotTest().catch(()=>console.error("ONE_SHOT_TEST_FAILED"));
});
