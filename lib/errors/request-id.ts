export function getRequestId(request: Request): string {
  const existing = request.headers.get('X-Request-ID');
  if (existing) return existing;
  return crypto.randomUUID();
}
