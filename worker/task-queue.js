export async function enqueueTask(env, taskType, payload = {}, dedupeKey = null) {
  const id = crypto.randomUUID();
  const result = await env.DB.prepare(`INSERT OR IGNORE INTO task_queue
    (id, task_type, payload_json, dedupe_key) VALUES (?, ?, ?, ?)`)
    .bind(id, taskType, JSON.stringify(payload), dedupeKey).run();
  if (!result.meta.changes) return { queued: false, duplicate: true };
  if (env.TASK_QUEUE) await env.TASK_QUEUE.send({ id, taskType, payload });
  return { queued: true, id, transport: env.TASK_QUEUE ? "cloudflare-queue" : "d1" };
}

export async function runQueuedTask(env, message, handlers) {
  const id = message.id;
  await env.DB.prepare(`UPDATE task_queue SET status='processing', attempts=attempts+1,
    lease_until=datetime('now', '+10 minutes'), updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(id).run();
  try {
    const handler = handlers[message.taskType];
    if (!handler) throw new Error(`Unsupported queued task: ${message.taskType}`);
    const result = await handler(message.payload || {});
    await env.DB.prepare("UPDATE task_queue SET status='succeeded', completed_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(id).run();
    return result;
  } catch (error) {
    await env.DB.prepare("UPDATE task_queue SET status='failed', last_error=?, completed_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(error.message, id).run();
    throw error;
  }
}
