/**
 * Qodex Provider SDK — Error Layer
 *
 * Normalises provider-specific errors into a standardised type.
 * Agent Runtime (M3) only ever sees these canonical errors.
 */

export type ProviderErrorType =
  | "auth_error"
  | "rate_limit"
  | "network_error"
  | "model_not_found"
  | "invalid_request"
  | "unknown";

export interface ProviderError {
  type: ProviderErrorType;
  message: string;
  retryable: boolean;
}

/** Map HTTP status codes to canonical error types */
export function errorFromHttpStatus(status: number, body?: string): ProviderError {
  switch (status) {
    case 401:
    case 403:
      return { type: "auth_error", message: body ?? "Authentication failed", retryable: false };
    case 429:
      return { type: "rate_limit", message: "Rate limit exceeded", retryable: true };
    case 404:
      return { type: "model_not_found", message: body ?? "Model endpoint not found", retryable: false };
    case 400:
      return { type: "invalid_request", message: body ?? "Invalid request", retryable: false };
    default:
      return { type: "network_error", message: `HTTP ${status}`, retryable: status >= 500 };
  }
}

/** Wrap a fetch/network exception into a canonical error */
export function errorFromException(error: unknown): ProviderError {
  if (error instanceof TypeError && error.message === "fetch failed") {
    return { type: "network_error", message: "Network request failed", retryable: true };
  }
  return {
    type: "unknown",
    message: error instanceof Error ? error.message : String(error),
    retryable: false,
  };
}

/** Create a canonical error directly */
export function createError(type: ProviderErrorType, message: string, retryable?: boolean): ProviderError {
  return { type, message, retryable: retryable ?? false };
}
