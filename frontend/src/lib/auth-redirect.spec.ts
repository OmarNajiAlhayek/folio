import { describe, expect, it } from "vitest";
import { loginPathWithNext, sanitizeNextParam } from "./auth-redirect";

/** Adversarial and edge-case inputs — must all sanitize to `null`. */
const ADVERSARIAL_NULL: (string | null)[] = [
  null,
  "",
  "   ",
  "//evil.com/x",
  "%2F%2Fevil.com",
  "/%2F%2Fevil.com",
  "/\\evil.com",
  String.raw`/\evil.com`,
  "/foo/../bar",
  "/%2e%2e/admin",
  "/login",
  "/register",
  "/login?x=1",
  "javascript:alert(1)",
  "data:text/html,hi",
  "\n/submissions",
  "\0/submissions",
  `${"a".repeat(2049)}`,
  "//user@host/path",
];

describe("sanitizeNextParam", () => {
  it("returns null for every adversarial / disallowed input", () => {
    for (const input of ADVERSARIAL_NULL) {
      expect(sanitizeNextParam(input)).toBeNull();
    }
  });

  it("accepts safe internal paths with query and hash", () => {
    expect(sanitizeNextParam("/submissions")).toBe("/submissions");
    expect(sanitizeNextParam("/dashboard")).toBe("/dashboard");
    expect(sanitizeNextParam("/submissions?foo=bar:baz#row")).toBe(
      "/submissions?foo=bar:baz#row",
    );
  });

  it("allows backslash only in query (not in path portion)", () => {
    expect(sanitizeNextParam("/submissions?path=\\foo")).toBe(
      "/submissions?path=\\foo",
    );
  });

  it("trims benign paths", () => {
    expect(sanitizeNextParam("  /submissions  ")).toBe("/submissions");
  });
});

describe("loginPathWithNext", () => {
  it("omits next when sanitized path is null", () => {
    expect(loginPathWithNext("//evil")).toBe("/login");
  });

  it("includes encoded next for safe paths", () => {
    expect(loginPathWithNext("/submissions")).toBe(
      "/login?next=%2Fsubmissions",
    );
  });
});
