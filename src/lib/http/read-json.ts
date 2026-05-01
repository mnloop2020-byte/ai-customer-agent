export async function readJsonBody(request: Request): Promise<unknown | null> {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType && !contentType.includes("application/json")) return null;

  try {
    return await request.json();
  } catch {
    return null;
  }
}

export async function readOptionalJsonObject(request: Request): Promise<Record<string, unknown>> {
  const body = await readJsonBody(request);
  return body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
}
