export function validMutationSource(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    const source = new URL(origin);
    const target = new URL(request.url);
    if (source.origin === target.origin) return true;

    // Sites may hand a route its internal URL while preserving the public host.
    // Require all browser-controlled same-origin signals to agree with that host.
    const host = request.headers.get("host");
    const referer = request.headers.get("referer");
    return (
      source.protocol === "https:" &&
      !!host &&
      source.host === host &&
      request.headers.get("sec-fetch-site") === "same-origin" &&
      !!referer &&
      new URL(referer).origin === source.origin
    );
  } catch {
    return false;
  }
}
