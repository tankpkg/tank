export function isAiGenerationRequest(method: string, _path: string, body: string): boolean {
  if (method.toUpperCase() !== 'POST') {
    return false;
  }

  if (body.length === 0) {
    return false;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return false;
  }

  if (!parsed || typeof parsed !== 'object') {
    return false;
  }

  const candidate = parsed as { messages?: unknown };
  return Array.isArray(candidate.messages);
}
