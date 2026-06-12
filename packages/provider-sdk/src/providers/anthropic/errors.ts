interface AnthropicError {
  error: { type: string; message: string };
}

interface RateLimitError {
  error: { type: string; message: string };
}

export function normalizeAnthropicError(status: number, body: string, retryAfter?: string): { type: string; message: string; retryAfter?: number } {
  let parsed: AnthropicError | RateLimitError | null = null;
  try { parsed = JSON.parse(body); } catch { /* not JSON */ }

  const errorType = parsed?.error?.type ?? "";
  const errorMessage = parsed?.error?.message ?? body;

  switch (status) {
    case 400: return { type: "invalid_request", message: errorMessage };
    case 401: return { type: "unauthorized", message: "Invalid API key. Please check your credentials." };
    case 403: return { type: "forbidden", message: errorMessage };
    case 404: return { type: "not_found", message: errorMessage };
    case 429: return { type: "rate_limited", message: errorMessage, retryAfter: retryAfter ? parseInt(retryAfter) : undefined };
    case 500: return { type: "provider_error", message: errorMessage };
    case 529: return { type: "overloaded", message: "Anthropic is overloaded. " + errorMessage, retryAfter: retryAfter ? parseInt(retryAfter) : 60 };
    default: return { type: errorType || "provider_error", message: errorMessage };
  }
}
