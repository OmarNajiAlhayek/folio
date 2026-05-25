import { describe, expect, it } from "vitest";
import { editorStatusOptions } from "@/lib/editor-status-transitions";

describe("editorStatusOptions", () => {
  it("lists current status plus allowed next states from submitted", () => {
    expect(editorStatusOptions("submitted")).toEqual([
      "submitted",
      "under_review",
      "revisions_requested",
      "rejected",
      "accepted",
    ]);
  });

  it("lists current status plus allowed next states from under_review", () => {
    expect(editorStatusOptions("under_review")).toEqual([
      "under_review",
      "accepted",
      "rejected",
      "revisions_requested",
    ]);
  });

  it("returns only current status when no editor transitions exist", () => {
    expect(editorStatusOptions("draft")).toEqual(["draft"]);
  });
});
