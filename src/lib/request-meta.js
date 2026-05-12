/**
 * @param {Request} request
 */
export function getRequestIp(request) {
  const xf = request.headers.get("x-forwarded-for");
  if (xf) {
    const first = xf.split(",")[0]?.trim();
    if (first) return first.slice(0, 64);
  }
  const realIp = request.headers.get("x-real-ip");
  if (realIp) return realIp.trim().slice(0, 64);
  return null;
}

/**
 * @param {Request} request
 */
export function getRequestUserAgent(request) {
  const ua = request.headers.get("user-agent");
  return ua ? ua.slice(0, 512) : null;
}
