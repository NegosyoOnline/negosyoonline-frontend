/* A posted form, read with a size limit. Anything that is not a small urlencoded form reads as empty. */
const MAX_BODY = 16 * 1024;

export async function postedForm(request: Request): Promise<URLSearchParams> {
  const type = request.headers.get("content-type") ?? "";
  if (!type.toLowerCase().startsWith("application/x-www-form-urlencoded")) return new URLSearchParams();
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY) return new URLSearchParams();
  try {
    const body = await request.text();
    return new URLSearchParams(body.length > MAX_BODY ? "" : body);
  } catch {
    return new URLSearchParams();
  }
}
