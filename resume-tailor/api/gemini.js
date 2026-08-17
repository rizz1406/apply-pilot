export default async function handler(request, response) {
  if (request.method !== "POST") return response.status(405).json({ error: "Method not allowed" });
  const key = request.headers["x-gemini-key"];
  const model = request.headers["x-gemini-model"] || "gemini-3.5-flash";
  if (!key || typeof key !== "string" || key.length < 10) return response.status(401).json({ error: "Missing Gemini key" });
  if (!/^gemini-[a-z0-9._-]+$/i.test(model)) return response.status(400).json({ error: "Invalid model" });
  try {
    const upstream = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify(request.body),
      signal: AbortSignal.timeout(55_000),
    });
    const text = await upstream.text();
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("Content-Type", upstream.headers.get("content-type") || "application/json");
    return response.status(upstream.status).send(text);
  } catch (error) {
    return response.status(502).json({ error: "Could not reach Gemini", detail: error.message });
  }
}
