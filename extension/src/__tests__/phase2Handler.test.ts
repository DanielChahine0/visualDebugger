import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeCapturedError, makePhase2Response, makeBugRecord } from "./helpers";
import type { CapturedDiff } from "../types";

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------
const mockAnalyzeDiff = vi.hoisted(() => vi.fn());
const mockIsInitialized = vi.hoisted(() => vi.fn().mockReturnValue(true));
const mockFlowFixerError = vi.hoisted(() => {
  class FlowFixerError extends Error {
    constructor(message: string) {
      super(message);
      this.name = "FlowFixerError";
    }
  }
  return FlowFixerError;
});
const mockShowWarningMessage = vi.hoisted(() => vi.fn());

vi.mock("vscode", () => ({
  window: {
    showWarningMessage: mockShowWarningMessage,
  },
}), { virtual: true });

vi.mock("../llmClient", () => ({
  analyzeDiff: mockAnalyzeDiff,
  isInitialized: mockIsInitialized,
  FlowFixerError: mockFlowFixerError,
}));

const { createPhase2Handler, buildFallbackDiffExplanation } = await import("../phase2Handler");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCapturedDiff(overrides: Partial<CapturedDiff> = {}): CapturedDiff {
  return {
    file: "App.tsx",
    language: "typescriptreact",
    beforeContent: "const x = 1;\n",
    afterContent: "const x = 2;\n",
    unifiedDiff: "--- a/App.tsx\n+++ b/App.tsx\n-const x = 1;\n+const x = 2;\n",
    timestamp: Date.now(),
    ...overrides,
  };
}

function makeDeps() {
  return {
    debugPanel: { postMessage: vi.fn() },
    dashboardPanel: { postMessage: vi.fn() },
    storage: {
      save: vi.fn().mockResolvedValue(undefined),
      update: vi.fn().mockResolvedValue(undefined),
      getAll: vi.fn().mockResolvedValue([]),
      dispose: vi.fn(),
    },
    statusManager: { updateStatus: vi.fn(), dispose: vi.fn() },
    phase1Handler: {
      handlePhase1: vi.fn(),
      getLastError: vi.fn().mockReturnValue(makeCapturedError({ message: "TypeError: x is undefined" })),
      getLastBugId: vi.fn().mockReturnValue("bug-123"),
      isDiffReviewActive: vi.fn().mockReturnValue(false),
      setHoldDiffReview: vi.fn(),
      setDiffReviewPending: vi.fn(),
      isHoldDiffReview: vi.fn().mockReturnValue(false),
      isPendingDiffReview: vi.fn().mockReturnValue(false),
      getBugsWithFallback: vi.fn().mockResolvedValue([]),
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("createPhase2Handler", () => {
  let deps: ReturnType<typeof makeDeps>;

  beforeEach(() => {
    vi.clearAllMocks();
    deps = makeDeps();
    mockIsInitialized.mockReturnValue(true);
    mockAnalyzeDiff.mockResolvedValue(makePhase2Response());
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("calls analyzeDiff with correct params", async () => {
    const diff = makeCapturedDiff({ file: "test.tsx", language: "typescript" });
    const handler = createPhase2Handler(deps as never);
    await handler(diff);

    expect(mockAnalyzeDiff).toHaveBeenCalledWith({
      language: "typescript",
      filename: "test.tsx",
      originalError: "TypeError: x is undefined",
      diff: diff.unifiedDiff,
    });
  });

  it("posts showDiff to debugPanel on success", async () => {
    const handler = createPhase2Handler(deps as never);
    const diff = makeCapturedDiff();
    await handler(diff);

    expect(deps.debugPanel.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: "showDiff" })
    );
    const data = deps.debugPanel.postMessage.mock.calls[0][0].data;
    expect(data.diff).toEqual(diff);
    expect(data.quickSummary).toBeDefined();
  });

  it("sets holdDiffReview=true and pendingDiffReview=false on success", async () => {
    const handler = createPhase2Handler(deps as never);
    await handler(makeCapturedDiff());

    expect(deps.phase1Handler.setHoldDiffReview).toHaveBeenCalledWith(true);
    expect(deps.phase1Handler.setDiffReviewPending).toHaveBeenCalledWith(false);
  });

  it("sets pendingDiffReview=true at the start", async () => {
    const handler = createPhase2Handler(deps as never);
    await handler(makeCapturedDiff());

    // setDiffReviewPending is called with true first, then false on success
    const calls = deps.phase1Handler.setDiffReviewPending.mock.calls;
    expect(calls[0][0]).toBe(true);
    expect(calls[1][0]).toBe(false);
  });

  it("updates storage with diffExplanation for matching bug", async () => {
    const bug = makeBugRecord({ id: "bug-123", file: "App.tsx" });
    deps.storage.getAll.mockResolvedValue([bug]);

    const handler = createPhase2Handler(deps as never);
    await handler(makeCapturedDiff());

    expect(deps.storage.update).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "bug-123",
        diffExplanation: expect.objectContaining({ quickSummary: expect.any(String) }),
      })
    );
  });

  it("updates dashboard with all bugs after success", async () => {
    const bugs = [makeBugRecord()];
    deps.phase1Handler.getBugsWithFallback.mockResolvedValue(bugs);

    const handler = createPhase2Handler(deps as never);
    await handler(makeCapturedDiff());

    expect(deps.dashboardPanel.postMessage).toHaveBeenCalledWith({
      type: "showDashboard",
      data: { bugs },
    });
  });

  it("updates status to analyzingDiff then diffReviewed on success", async () => {
    const handler = createPhase2Handler(deps as never);
    await handler(makeCapturedDiff());

    const calls = deps.statusManager.updateStatus.mock.calls.map((c: unknown[]) => c[0]);
    expect(calls).toEqual(["analyzingDiff", "diffReviewed"]);
  });

  it("uses 'unknown error' when lastError is undefined", async () => {
    deps.phase1Handler.getLastError.mockReturnValue(undefined);
    const handler = createPhase2Handler(deps as never);
    await handler(makeCapturedDiff());

    expect(mockAnalyzeDiff).toHaveBeenCalledWith(
      expect.objectContaining({ originalError: "unknown error" })
    );
  });

  describe("error handling", () => {
    it("falls back to buildFallbackDiffExplanation on error", async () => {
      mockAnalyzeDiff.mockRejectedValue(new Error("network timeout"));
      const handler = createPhase2Handler(deps as never);
      const diff = makeCapturedDiff();
      await handler(diff);

      // Should still post showDiff with fallback content
      expect(deps.debugPanel.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: "showDiff" })
      );
      const data = deps.debugPanel.postMessage.mock.calls[0][0].data;
      expect(data.quickSummary).toContain("No more errors");
    });

    it("sets holdDiffReview=true even on error", async () => {
      mockAnalyzeDiff.mockRejectedValue(new Error("fail"));
      const handler = createPhase2Handler(deps as never);
      await handler(makeCapturedDiff());

      expect(deps.phase1Handler.setHoldDiffReview).toHaveBeenCalledWith(true);
    });

    it("sets pendingDiffReview=false on error", async () => {
      mockAnalyzeDiff.mockRejectedValue(new Error("fail"));
      const handler = createPhase2Handler(deps as never);
      await handler(makeCapturedDiff());

      // Last call to setDiffReviewPending should be false
      const calls = deps.phase1Handler.setDiffReviewPending.mock.calls;
      expect(calls[calls.length - 1][0]).toBe(false);
    });

    it("updates status to diffReviewed even on error (shows fallback)", async () => {
      mockAnalyzeDiff.mockRejectedValue(new Error("fail"));
      const handler = createPhase2Handler(deps as never);
      await handler(makeCapturedDiff());

      const calls = deps.statusManager.updateStatus.mock.calls.map((c: unknown[]) => c[0]);
      expect(calls).toContain("diffReviewed");
    });

    it("shows warning message on FlowFixerError", async () => {
      mockIsInitialized.mockReturnValue(false);
      const handler = createPhase2Handler(deps as never);
      await handler(makeCapturedDiff());

      expect(mockShowWarningMessage).toHaveBeenCalledWith(
        expect.stringContaining("No API key set")
      );
    });

    it("does not show warning message for generic errors", async () => {
      mockAnalyzeDiff.mockRejectedValue(new Error("generic error"));
      const handler = createPhase2Handler(deps as never);
      await handler(makeCapturedDiff());

      expect(mockShowWarningMessage).not.toHaveBeenCalled();
    });
  });

  describe("bug matching for diffExplanation storage", () => {
    it("matches bug by lastBugId first", async () => {
      const matchByFile = makeBugRecord({ id: "file-match", file: "App.tsx" });
      const matchById = makeBugRecord({ id: "bug-123", file: "Other.tsx" });
      deps.storage.getAll.mockResolvedValue([matchByFile, matchById]);

      const handler = createPhase2Handler(deps as never);
      await handler(makeCapturedDiff());

      // Should update the one matching by ID, not by file
      expect(deps.storage.update).toHaveBeenCalledWith(
        expect.objectContaining({ id: "bug-123" })
      );
    });

    it("falls back to file match when lastBugId not found", async () => {
      deps.phase1Handler.getLastBugId.mockReturnValue("nonexistent");
      const bug = makeBugRecord({ id: "file-match", file: "App.tsx" });
      bug.diffExplanation = undefined;
      deps.storage.getAll.mockResolvedValue([bug]);

      const handler = createPhase2Handler(deps as never);
      await handler(makeCapturedDiff({ file: "App.tsx" }));

      expect(deps.storage.update).toHaveBeenCalledWith(
        expect.objectContaining({ id: "file-match" })
      );
    });

    it("does not update storage when no matching bug exists", async () => {
      deps.phase1Handler.getLastBugId.mockReturnValue("nonexistent");
      deps.storage.getAll.mockResolvedValue([]);

      const handler = createPhase2Handler(deps as never);
      await handler(makeCapturedDiff());

      expect(deps.storage.update).not.toHaveBeenCalled();
    });
  });
});

describe("buildFallbackDiffExplanation", () => {
  function makeDiff(overrides: Partial<CapturedDiff> = {}): CapturedDiff {
    return {
      file: "App.tsx",
      language: "typescriptreact",
      beforeContent: "const x = 1;\n",
      afterContent: "const x = 2;\n",
      unifiedDiff: "mock diff",
      timestamp: Date.now(),
      ...overrides,
    };
  }

  it("returns correct shape with all required fields", () => {
    const result = buildFallbackDiffExplanation(makeDiff(), "some error");

    expect(result.quickSummary).toBeDefined();
    expect(result.whyItWorks).toBeDefined();
    expect(result.whatToDoNext).toHaveLength(3);
    expect(result.keyTakeaway).toBeDefined();
    expect(result.checkQuestion).toBeDefined();
  });

  it("includes original error in whyItWorks", () => {
    const result = buildFallbackDiffExplanation(makeDiff(), "TypeError: x is undefined");

    expect(result.whyItWorks).toContain("TypeError: x is undefined");
  });

  it("uses fallback text when originalError is empty", () => {
    const result = buildFallbackDiffExplanation(makeDiff(), "   ");

    expect(result.whyItWorks).toContain("the original issue");
  });

  it("quickSummary mentions local review", () => {
    const result = buildFallbackDiffExplanation(makeDiff(), "some error");

    expect(result.quickSummary).toContain("reviewed locally");
  });
});
