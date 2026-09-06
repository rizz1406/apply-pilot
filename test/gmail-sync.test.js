import test from "node:test";
import assert from "node:assert/strict";
import { syncRecruiterReplies, syncApplicationConfirmations } from "../worker/gmail.js";

// Minimal D1 stub: prepare(sql) is matched by substring so each query returns the fixture
// registered for it. Real enough to exercise the actual matching/update logic, not just
// confirm the function doesn't throw.
function makeDb(fixtures) {
  const calls = [];
  return {
    calls,
    prepare(sql) {
      const key = Object.keys(fixtures).find(k => sql.includes(k));
      const fixture = fixtures[key] || {};
      const bound = (...args) => ({
        first: async () => (typeof fixture.first === "function" ? fixture.first(...args) : fixture.first ?? null),
        all: async () => ({ results: typeof fixture.all === "function" ? fixture.all(...args) : fixture.all ?? [] }),
        run: async () => { calls.push({ sql, args }); return { meta: { changes: typeof fixture.changes === "function" ? fixture.changes(...args) : fixture.changes ?? 1 } }; }
      });
      return { bind: (...args) => bound(...args), ...bound() };
    }
  };
}

const fakeEnv = (fixtures, gmailResponses) => {
  const env = { DB: makeDb(fixtures), GOOGLE_CLIENT_ID: "id", GOOGLE_CLIENT_SECRET: "secret", GMAIL_REFRESH_TOKEN: "refresh" };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async url => {
    const path = String(url);
    if (path.includes("oauth2.googleapis.com")) return new Response(JSON.stringify({ access_token: "token", expires_in: 3600 }));
    const match = Object.keys(gmailResponses).find(k => path.includes(k));
    return new Response(JSON.stringify(gmailResponses[match] || {}));
  };
  return { env, restore: () => { globalThis.fetch = originalFetch; } };
};

test("detects a recruiter reply from an INBOX-labeled thread message", async () => {
  const { env, restore } = fakeEnv(
    { "FROM outreach": { all: [{ id: "o1", thread_id: "t1" }] } },
    { "/threads/t1": { messages: [{ labelIds: ["SENT"] }, { labelIds: ["INBOX"] }] } }
  );
  try {
    const result = await syncRecruiterReplies(env);
    assert.equal(result.checked, 1);
    assert.equal(result.replies, 1);
    assert.ok(env.DB.calls.some(c => c.sql.includes("status = 'replied'")));
  } finally { restore(); }
});

test("does not flag an outreach thread with no inbox-side message", async () => {
  const { env, restore } = fakeEnv(
    { "FROM outreach": { all: [{ id: "o1", thread_id: "t1" }] } },
    { "/threads/t1": { messages: [{ labelIds: ["SENT"] }] } }
  );
  try {
    const result = await syncRecruiterReplies(env);
    assert.equal(result.replies, 0);
    assert.ok(!env.DB.calls.some(c => c.sql.includes("status = 'replied'")));
  } finally { restore(); }
});

test("confirms an application when company and role terms both match the email", async () => {
  const messageBody = {
    payload: {
      headers: [{ name: "Subject", value: "Thank you for applying" }],
      body: { data: Buffer.from("Thank you for applying to Acme Analytics for the Data Analyst role. We received your application.").toString("base64").replace(/\+/g, "-").replace(/\//g, "_") }
    }
  };
  const { env, restore } = fakeEnv(
    {
      "FROM applications a JOIN jobs j": { all: [{ id: "app1", company: "Acme Analytics", title: "Data Analyst" }] },
      "UPDATE applications SET stage='applied'": { changes: 1 }
    },
    { "/messages?q=": { messages: [{ id: "m1" }] }, "/messages/m1": messageBody }
  );
  try {
    const result = await syncApplicationConfirmations(env);
    assert.equal(result.confirmed, 1);
    assert.ok(env.DB.calls.some(c => c.sql.includes("stage='applied'") && c.args[0] === "app1"));
  } finally { restore(); }
});

test("does not confirm when the email references a different company", async () => {
  const messageBody = {
    payload: {
      headers: [{ name: "Subject", value: "Thank you for applying" }],
      body: { data: Buffer.from("Thank you for applying to Other Corp for the Sales role.").toString("base64").replace(/\+/g, "-").replace(/\//g, "_") }
    }
  };
  const { env, restore } = fakeEnv(
    { "FROM applications a JOIN jobs j": { all: [{ id: "app1", company: "Acme Analytics", title: "Data Analyst" }] } },
    { "/messages?q=": { messages: [{ id: "m1" }] }, "/messages/m1": messageBody }
  );
  try {
    const result = await syncApplicationConfirmations(env);
    assert.equal(result.confirmed, 0);
  } finally { restore(); }
});
