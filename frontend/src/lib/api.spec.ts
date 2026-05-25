import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api-response";
import { apiBlob, apiJson, apiPostJsonOrBlob } from "@/lib/api";
import { clearCsrfToken, getCsrfToken, setCsrfToken } from "@/lib/csrf-token";

const API_BASE = "http://localhost:5243";

describe("apiJson", () => {
  beforeEach(() => {
    clearCsrfToken();
    vi.stubEnv("NEXT_PUBLIC_API_URL", API_BASE);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response()),
    );
    setCsrfToken("test-csrf");
  });

  afterEach(() => {
    clearCsrfToken();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("returns parsed JSON on success", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ id: "1", title: "Hi" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const data = await apiJson<{ id: string; title: string }>("/submissions/x");
    expect(data).toEqual({ id: "1", title: "Hi" });
    expect(fetch).toHaveBeenCalledWith(
      `${API_BASE}/api/v1/submissions/x`,
      expect.objectContaining({
        credentials: "include",
        headers: expect.any(Headers),
      }),
    );
  });

  it("throws ApiError with code and details on Nest error body", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          message: "Incomplete",
          code: "CONSTRUCTOR_VALIDATION_FAILED",
          errors: [{ code: "MISSING_TITLE" }],
        }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      ),
    );

    await expect(apiJson("/submissions/x/submit", { method: "POST" })).rejects.toMatchObject({
      name: "ApiError",
      message: "Incomplete",
      code: "CONSTRUCTOR_VALIDATION_FAILED",
      status: 400,
    });

    try {
      await apiJson("/submissions/x/submit", { method: "POST" });
    } catch (e) {
      expect(e).toBeInstanceOf(ApiError);
      const err = e as ApiError;
      expect(err.details?.errors).toEqual([{ code: "MISSING_TITLE" }]);
    }
  });

  it("stores csrfToken from GET /auth/me", async () => {
    clearCsrfToken();
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({ id: "u1", email: "a@b.c", csrfToken: "from-me" }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );

    await apiJson("/auth/me");
    expect(getCsrfToken()).toBe("from-me");
  });
});

describe("apiBlob", () => {
  beforeEach(() => {
    clearCsrfToken();
    setCsrfToken("test-csrf");
    vi.stubEnv("NEXT_PUBLIC_API_URL", API_BASE);
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    clearCsrfToken();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("returns blob on 200", async () => {
    const payload = new Blob(["pdf-bytes"], { type: "application/pdf" });
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(payload, { status: 200 }),
    );

    const blob = await apiBlob("/submissions/s/files/f1");
    expect(blob.type).toBe("application/pdf");
  });

  it("throws ApiError on 400 with JSON body", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({ message: "Forbidden", code: "FORBIDDEN" }),
        { status: 403, headers: { "Content-Type": "application/json" } },
      ),
    );

    await expect(apiBlob("/submissions/s/files/f1")).rejects.toBeInstanceOf(
      ApiError,
    );
  });
});

describe("apiJson login", () => {
  beforeEach(() => {
    clearCsrfToken();
    vi.stubEnv("NEXT_PUBLIC_API_URL", API_BASE);
    vi.stubGlobal("fetch", vi.fn());
    vi.stubGlobal("document", { cookie: "" });
  });

  afterEach(() => {
    clearCsrfToken();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("does not bootstrap CSRF via /auth/me before POST /auth/login", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({ user: { id: "1" }, csrfToken: "login-csrf" }),
        {
          status: 201,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );

    await apiJson("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: "a@b.c", password: "secret" }),
    });

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(getCsrfToken()).toBe("login-csrf");
  });
});

describe("apiPostJsonOrBlob", () => {
  beforeEach(() => {
    clearCsrfToken();
    vi.stubEnv("NEXT_PUBLIC_API_URL", API_BASE);
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    clearCsrfToken();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  function mockMeThenPost(postResponse: Response) {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: "u1", csrfToken: "synced-csrf" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(postResponse);
  }

  it("returns json kind when Content-Type is application/json", async () => {
    mockMeThenPost(
      new Response(JSON.stringify({ id: "file-1", kind: "manuscript" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const result = await apiPostJsonOrBlob<{ id: string; kind: string }>(
      "/submissions/s/generate-docx?attach=true",
      { content: {}, attach: true },
    );
    expect(result.kind).toBe("json");
    if (result.kind === "json") {
      expect(result.data).toEqual({ id: "file-1", kind: "manuscript" });
    }
    expect(fetch).toHaveBeenCalledTimes(2);
    const [, postInit] = vi.mocked(fetch).mock.calls[1]!;
    expect((postInit?.headers as Headers).get("X-CSRF-Token")).toBe(
      "synced-csrf",
    );
  });

  it("returns blob kind for docx download", async () => {
    const docx = new Blob(["PK"], {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
    mockMeThenPost(
      new Response(docx, {
        status: 200,
        headers: {
          "Content-Type":
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        },
      }),
    );

    const result = await apiPostJsonOrBlob(
      "/submissions/generate-docx-standalone",
      { content: {}, attach: false },
    );
    expect(result.kind).toBe("blob");
    if (result.kind === "blob") {
      expect(result.data.size).toBeGreaterThan(0);
    }
    const [, postInit] = vi.mocked(fetch).mock.calls[1]!;
    expect((postInit?.headers as Headers).get("X-CSRF-Token")).toBe(
      "synced-csrf",
    );
  });
});
