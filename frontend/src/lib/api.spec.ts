import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api-response";
import { apiBlob, apiJson, apiPostJsonOrBlob, setStoredToken } from "@/lib/api";

describe("apiJson", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response()),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    setStoredToken(null);
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
      "http://localhost:5243/api/v1/submissions/x",
      expect.objectContaining({ headers: expect.any(Headers) }),
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
});

describe("apiBlob", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
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

describe("apiPostJsonOrBlob", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    setStoredToken("test-token");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    setStoredToken(null);
  });

  it("returns json kind when Content-Type is application/json", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
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
  });

  it("returns blob kind for docx download", async () => {
    const docx = new Blob(["PK"], {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
    vi.mocked(fetch).mockResolvedValueOnce(
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
  });
});
