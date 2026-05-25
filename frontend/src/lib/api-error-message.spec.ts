import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api-response";
import {
  getApiErrorKind,
  isCsrfApiError,
  isUserFacingApiMessage,
  resolveApiErrorMessage,
} from "@/lib/api-error-message";

const MESSAGES = {
  tooManyRequests: "Slow down.",
  notFound: "Missing.",
  unauthorized: "Sign in.",
  invalidCredentials: "Wrong login.",
  forbidden: "Denied.",
  badRequest: "Invalid.",
  serverError: "Server broke.",
  networkError: "Offline.",
};

describe("resolveApiErrorMessage", () => {
  it("maps 429 to tooManyRequests", () => {
    const msg = resolveApiErrorMessage(
      new ApiError("ThrottlerException: Too Many Requests", "TOO_MANY_REQUESTS", 429),
      "fallback",
      MESSAGES,
    );
    expect(msg).toBe("Slow down.");
  });

  it("maps 404 to notFound", () => {
    const msg = resolveApiErrorMessage(
      new ApiError("Submission not found", "NOT_FOUND", 404),
      "fallback",
      MESSAGES,
    );
    expect(msg).toBe("Missing.");
  });

  it("keeps user-facing validation messages", () => {
    const msg = resolveApiErrorMessage(
      new ApiError("Title is required", "VALIDATION_ERROR", 400),
      "fallback",
      MESSAGES,
    );
    expect(msg).toBe("Title is required");
  });

  it("maps login failure to translated invalidCredentials", () => {
    const msg = resolveApiErrorMessage(
      new ApiError("Invalid email or password", "UNAUTHORIZED", 401),
      "Login failed",
      MESSAGES,
    );
    expect(msg).toBe("Wrong login.");
  });

  it("maps generic Unauthorized to translated copy", () => {
    const msg = resolveApiErrorMessage(
      new ApiError("Unauthorized", "UNAUTHORIZED", 401),
      "fallback",
      MESSAGES,
    );
    expect(msg).toBe("Sign in.");
  });

  it("uses fallback for unknown errors", () => {
    expect(resolveApiErrorMessage(new Error("x"), "fallback", MESSAGES)).toBe(
      "fallback",
    );
  });

  it("uses fallback for CSRF errors instead of raw message", () => {
    const msg = resolveApiErrorMessage(
      new ApiError("Invalid or missing CSRF token", "CSRF_TOKEN_INVALID", 403),
      "Could not update status",
      MESSAGES,
    );
    expect(msg).toBe("Could not update status");
  });
});

describe("isUserFacingApiMessage", () => {
  it("rejects throttler strings", () => {
    expect(isUserFacingApiMessage("ThrottlerException: Too Many Requests")).toBe(
      false,
    );
  });

  it("rejects generic Unauthorized", () => {
    expect(isUserFacingApiMessage("Unauthorized")).toBe(false);
  });

  it("rejects CSRF strings", () => {
    expect(isUserFacingApiMessage("Invalid or missing CSRF token")).toBe(false);
  });
});

describe("isCsrfApiError", () => {
  it("detects CSRF_TOKEN_INVALID code", () => {
    expect(
      isCsrfApiError(
        new ApiError("Invalid or missing CSRF token", "CSRF_TOKEN_INVALID", 403),
      ),
    ).toBe(true);
  });
});

describe("getApiErrorKind", () => {
  it("detects rate limit", () => {
    expect(
      getApiErrorKind(
        new ApiError("x", "TOO_MANY_REQUESTS", 429),
      ),
    ).toBe("rateLimit");
  });
});
