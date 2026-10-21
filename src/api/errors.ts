// Docker and Kubernetes both put useful explanations in a JSON `message`.
// Proxies may return plain text or an HTML error page instead.
export async function responseError(response: Response, fallback: string): Promise<string> {
  const status = `${fallback}: ${response.status} ${response.statusText}`.trim();
  const text = (await response.text()).trim();
  if (!text) return status;
  try {
    const body: unknown = JSON.parse(text);
    if (typeof body === 'object' && body !== null && 'message' in body) {
      const message = body.message;
      if (typeof message === 'string' && message.trim()) return message;
    }
    return status;
  } catch {
    return text.startsWith('<') ? status : text;
  }
}
