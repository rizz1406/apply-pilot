function decodeBase64Url(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return Uint8Array.from(atob(normalized), character => character.charCodeAt(0));
}

function decodeJson(value) {
  return JSON.parse(new TextDecoder().decode(decodeBase64Url(value)));
}

export function validateAccessClaims(claims, env, now = Date.now()) {
  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  const teamDomain = String(env.ACCESS_TEAM_DOMAIN || "").replace(/^https?:\/\//, "").replace(/\/$/, "");
  if (!audiences.includes(env.ACCESS_AUD)) throw new Error("Access audience mismatch");
  if (!claims.exp || Number(claims.exp) * 1000 <= now) throw new Error("Access session expired");
  if (claims.nbf && Number(claims.nbf) * 1000 > now) throw new Error("Access session is not active");
  if (teamDomain && claims.iss && claims.iss !== `https://${teamDomain}`) throw new Error("Access issuer mismatch");
  return { email: claims.email || claims.sub || "Cloudflare Access user", subject: claims.sub || "" };
}

async function verifyAccessJwt(token, env) {
  const parts = String(token || "").split(".");
  if (parts.length !== 3) throw new Error("Missing Access assertion");
  const header = decodeJson(parts[0]);
  const claims = decodeJson(parts[1]);
  if (header.alg !== "RS256" || !header.kid) throw new Error("Unsupported Access token");
  const teamDomain = String(env.ACCESS_TEAM_DOMAIN).replace(/^https?:\/\//, "").replace(/\/$/, "");
  const response = await fetch(`https://${teamDomain}/cdn-cgi/access/certs`);
  if (!response.ok) throw new Error("Access signing keys unavailable");
  const keys = await response.json();
  const jwk = (keys.keys || []).find(key => key.kid === header.kid);
  if (!jwk) throw new Error("Access signing key not found");
  const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  const valid = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, decodeBase64Url(parts[2]), new TextEncoder().encode(`${parts[0]}.${parts[1]}`));
  if (!valid) throw new Error("Invalid Access signature");
  return validateAccessClaims(claims, env);
}

export async function authorizeRequest(request, env) {
  const accessEnabled = Boolean(env.ACCESS_AUD && env.ACCESS_TEAM_DOMAIN);
  const bearerValid = Boolean(env.ADMIN_TOKEN) && request.headers.get("Authorization") === `Bearer ${env.ADMIN_TOKEN}`;
  if (!accessEnabled) {
    if (env.DEMO_MODE === "true" && !env.ADMIN_TOKEN) return { authorized: true, mode: "demo", identity: "Demo user" };
    return { authorized: bearerValid, mode: "token", identity: bearerValid ? "API token" : null };
  }
  if (bearerValid && env.ALLOW_ADMIN_TOKEN !== "false") return { authorized: true, mode: "token", identity: "Automation token" };
  try {
    const identity = await verifyAccessJwt(request.headers.get("Cf-Access-Jwt-Assertion"), env);
    return { authorized: true, mode: "access", identity: identity.email };
  } catch (error) {
    return { authorized: false, mode: "access", identity: null, error: error.message };
  }
}
