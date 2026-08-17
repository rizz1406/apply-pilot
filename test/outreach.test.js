import test from "node:test";
import assert from "node:assert/strict";
import { sendOutreach } from "../worker/gmail.js";

test("sends an approved outreach message through Gmail", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (String(url).includes("oauth2.googleapis.com")) return new Response(JSON.stringify({ access_token: "access" }));
    return new Response(JSON.stringify({ id: "message-1", threadId: "thread-1" }));
  };
  try {
    const result = await sendOutreach({ GOOGLE_CLIENT_ID: "id", GOOGLE_CLIENT_SECRET: "secret", GMAIL_REFRESH_TOKEN: "refresh" }, { recruiter_email: "recruiter@example.com", subject: "Follow-up", body: "Hello" });
    assert.equal(result.threadId, "thread-1");
    assert.match(calls[1].url, /messages\/send/);
  } finally { globalThis.fetch = originalFetch; }
});
