"use strict";
const url = "https://vitrine-vendedor-ia-webhook.onrender.com/health";
(async () => {
  let last;
  for (let i = 0; i < 20; i++) {
    try {
      const response = await fetch(url, {signal: AbortSignal.timeout(12000)});
      if (!response.ok) throw new Error("HTTP " + response.status);
      const flags = await response.json();
      const allowed = [
        "whatsapp_verify_token_set","app_signature_enabled","access_token_set",
        "phone_number_id_set","outbound_integration_enabled","auto_reply_enabled"
      ];
      const status = Object.fromEntries(allowed.map(k=>[k, Boolean(flags[k])]));
      console.log("Render configuration flags (no values):", JSON.stringify(status));
      if (!status.whatsapp_verify_token_set || !status.phone_number_id_set) {
        process.exitCode=1;
      }
      return;
    } catch(e) {
      last=e;
      await new Promise(r=>setTimeout(r,5000));
    }
  }
  console.error("Render health probe unreachable:", String(last?.message||last));
  process.exitCode=1;
})();
