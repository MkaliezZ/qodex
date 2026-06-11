import { describe, it, expect } from "vitest";
import {
  errorFromHttpStatus,
  errorFromException,
  createError,
  type ProviderError,
} from "../src/errors/index.js";

describe("ProviderError", () => {
  describe("errorFromHttpStatus", () => {
    it("maps 401 to auth_error", () => {
      const err = errorFromHttpStatus(401);
      expect(err.type).toBe("auth_error");
      expect(err.retryable).toBe(false);
    });

    it("maps 403 to auth_error", () => {
      const err = errorFromHttpStatus(403);
      expect(err.type).toBe("auth_error");
    });

    it("maps 429 to rate_limit", () => {
      const err = errorFromHttpStatus(429);
      expect(err.type).toBe("rate_limit");
      expect(err.retryable).toBe(true);
    });

    it("maps 404 to model_not_found", () => {
      const err = errorFromHttpStatus(404);
      expect(err.type).toBe("model_not_found");
      expect(err.retryable).toBe(false);
    });

    it("maps 400 to invalid_request", () => {
      const err = errorFromHttpStatus(400, "Bad Request");
      expect(err.type).toBe("invalid_request");
      expect(err.message).toBe("Bad Request");
    });

    it("maps 5xx to network_error with retryable=true", () => {
      const err = errorFromHttpStatus(503);
      expect(err.type).toBe("network_error");
      expect(err.retryable).toBe(true);
    });

    it("maps other statuses to network_error", () => {
      const err = errorFromHttpStatus(418); // I'm a teapot
      expect(err.type).toBe("network_error");
    });
  });

  describe("errorFromException", () => {
    it("wraps TypeError for fetch failed", () => {
      const err = errorFromException(new TypeError("fetch failed"));
      expect(err.type).toBe("network_error");
      expect(err.retryable).toBe(true);
    });

    it("wraps generic Error as unknown", () => {
      const err = errorFromException(new Error("Something broke"));
      expect(err.type).toBe("unknown");
    });

    it("handles non-Error throws", () => {
      const err = errorFromException("just a string");
      expect(err.type).toBe("unknown");
    });
  });

  describe("createError", () => {
    it("creates a canonical error with defaults", () => {
      const err = createError("rate_limit", "Too fast");
      expect(err.type).toBe("rate_limit");
      expect(err.message).toBe("Too fast");
      expect(err.retryable).toBe(false);
    });

    it("respects retryable override", () => {
      const err = createError("rate_limit", "Try again later", true);
      expect(err.retryable).toBe(true);
    });
  });
});
