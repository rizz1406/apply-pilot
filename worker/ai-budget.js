export async function aiBudgetStatus(env) {
  const settings = await env.DB.prepare("SELECT ai_daily_budget FROM settings WHERE id=1").first();
  const usage = await env.DB.prepare("SELECT COALESCE(SUM(requests),0) AS requests, COALESCE(SUM(failures),0) AS failures FROM ai_usage WHERE usage_date=date('now')").first();
  const budget = Number(settings?.ai_daily_budget || 4);
  return { budget, used: Number(usage?.requests || 0), failures: Number(usage?.failures || 0), remaining: Math.max(0, budget - Number(usage?.requests || 0)) };
}

export async function recordAiUsage(env, provider, operation, failed = false) {
  await env.DB.prepare(`INSERT INTO ai_usage (usage_date, provider, operation, requests, failures)
    VALUES (date('now'), ?, ?, 1, ?) ON CONFLICT(usage_date, provider, operation)
    DO UPDATE SET requests=requests+1, failures=failures+excluded.failures`)
    .bind(provider, operation, failed ? 1 : 0).run();
}
