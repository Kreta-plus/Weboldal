export async function api(method, path, body) {
  const opt = { method, headers: { "X-KP": "1" }, credentials: "same-origin" };
  if (body !== undefined) {
    opt.headers["Content-Type"] = "application/json";
    opt.body = JSON.stringify(body);
  }
  let r;
  try {
    r = await fetch(path, opt);
  } catch {
    throw Object.assign(new Error("Nincs kapcsolat a szerverrel"), { code: "net" });
  }
  let j = {};
  try { j = await r.json(); } catch {}
  if (!r.ok) {
    const err = Object.assign(new Error(j.error || `Hiba (${r.status})`), { status: r.status, code: j.code, detail: j.detail });
    if (r.status === 401 && (j.code === "auth" || j.code === "relogin")) window.dispatchEvent(new CustomEvent("kp:auth", { detail: j.code }));
    throw err;
  }
  return j;
}
export const get = (p) => api("GET", p);
export const post = (p, b = {}) => api("POST", p, b);
export const put = (p, b) => api("PUT", p, b);
