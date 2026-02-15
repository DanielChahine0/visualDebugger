import { describe, it, expect, vi, beforeEach } from "vitest";
import type { CapturedError, BugRecord } from "../types";
import { makeCapturedError, makePhase1Response, makeBugRecord } from "./helpers";

// Hoisted mocks
const mockAnalyzeError = vi.hoisted(() => vi.fn());
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
const mockGetSeedBugRecords = vi.hoisted(() => vi.fn().mockReturnValue([]));
const mockShowWarningMessage = vi.hoisted(() => vi.fn());

vi.mock("vscode", () => ({
  window: {
    showWarningMessage: mockShowWarningMessage,
  },
}), { virtual: true });

vi.mock("../llmClient", () => ({
  analyzeError: mockAnalyzeError,
  isInitialized: mockIsInitialized,
  FlowFixerError: mockFlowFixerError,
}));

vi.mock("../seedData", () => ({
  getSeedBugRecords: mockGetSeedBugRecords,
}));

const { createPhase1Handler } = await import("../phase1Handler");

function makeDeps() {
  return {
    debugPanel: { postMessage: vi.fn() },
    dashboardPanel: { postMessage: vi.fn() },
    diffEngine: { startTracking: vi.fn() },
    storage: {
      save: vi.fn().mockResolvedValue(undefined),
      update: vi.fn().mockResolvedValue(undefined),
      getAll: vi.fn().mockResolvedValue([]),
      dispose: vi.fn(),
    },
    statusManager: { updateStatus: vi.fn(), dispose: vi.fn() },
  };
}

describe("createPhase1Handler", () => {
  let deps: ReturnType<typeof makeDeps>;

  beforeEach(() => {
    vi.clearAllMocks();
    deps = makeDeps();
    mockIsInitialized.mockReturnValue(true);
    mockAnalyzeError.mockResolvedValue(makePhase1Response());
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  describe("handlePhase1", () => {
    it("analyzes error and posts showError to debug panel", async () => {
      const handler = createPhase1Handler(deps as never);
      const error = makeCapturedError();

      await handler.handlePhase1(error, { trigger: "manual" });

      expect(mockAnalyzeError).toHaveBeenCalledWith({
        language: error.language,
        filename: error.file,
        errorMessage: error.message,
        codeContext: error.codeContext,
      });

      expect(deps.debugPanel.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: "showError" })
      );
    });

    it("clears the panel before analyzing", async () => {
      const handler = createPhase1Handler(deps as never);
      await handler.handlePhase1(makeCapturedError(), { trigger: "manual" });

      // First call should be clear, second should be showError
      const calls = deps.debugPanel.postMessage.mock.calls;
      expect(calls[0][0]).toEqual({ type: "clear" });
      expect(calls[1][0].type).toBe("showError");
    });

    it("starts tracking on the error file", async () => {
      const handler = createPhase1Handler(deps as never);
      const error = makeCapturedError({ file: "test.tsx" });
      await handler.handlePhase1(error, { trigger: "manual" });

      expect(deps.diffEngine.startTracking).toHaveBeenCalledWith("test.tsx");
    });

    it("saves a bug record to storage", async () => {
      const handler = createPhase1Handler(deps as never);
      await handler.handlePhase1(makeCapturedError(), { trigger: "manual" });

      expect(deps.storage.save).toHaveBeenCalledWith(
        expect.objectContaining({
          id: expect.stringMatching(/^bug_/),
          category: "Runtime Error",
          file: "App.tsx",
        })
      );
    });

    it("updates the dashboard after saving", async () => {
      deps.storage.getAll.mockResolvedValue([makeBugRecord()]);
      const handler = createPhase1Handler(deps as never);
      await handler.handlePhase1(makeCapturedError(), { trigger: "manual" });

      expect(deps.dashboardPanel.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: "showDashboard" })
      );
    });

    it("updates status to analyzingError then errorExplained", async () => {
      const handler = createPhase1Handler(deps as never);
      await handler.handlePhase1(makeCapturedError(), { trigger: "manual" });

      const calls = deps.statusManager.updateStatus.mock.calls.map((c: unknown[]) => c[0]);
      expect(calls).toEqual(["analyzingError", "errorExplained"]);
    });

    it("skips auto trigger when diff review is active (holdDiffReview)", async () => {
      const handler = createPhase1Handler(deps as never);
      handler.setHoldDiffReview(true);

      await handler.handlePhase1(makeCapturedError(), { trigger: "auto" });

      expect(mockAnalyzeError).not.toHaveBeenCalled();
    });

    it("skips auto trigger when diff review is pending", async () => {
      const handler = createPhase1Handler(deps as never);
      handler.setDiffReviewPending(true);

      await handler.handlePhase1(makeCapturedError(), { trigger: "auto" });

      expect(mockAnalyzeError).not.toHaveBeenCalled();
    });

    it("does NOT skip manual trigger when diff review is active", async () => {
      const handler = createPhase1Handler(deps as never);
      handler.setHoldDiffReview(true);

      await handler.handlePhase1(makeCapturedError(), { trigger: "manual" });

      expect(mockAnalyzeError).toHaveBeenCalled();
    });

    it("resets holdDiffReview to false on new error", async () => {
      const handler = createPhase1Handler(deps as never);
      handler.setHoldDiffReview(true);

      // Manual trigger proceeds despite holdDiffReview
      await handler.handlePhase1(makeCapturedError(), { trigger: "manual" });

      expect(handler.isHoldDiffReview()).toBe(false);
    });

    it("handles FlowFixerError (no API key) with warning", async () => {
      mockIsInitialized.mockReturnValue(false);
      const handler = createPhase1Handler(deps as never);
      await handler.handlePhase1(makeCapturedError(), { trigger: "manual" });

      expect(deps.statusManager.updateStatus).toHaveBeenCalledWith("analysisFailed");
      expect(mockShowWarningMessage).toHaveBeenCalledWith(
        expect.stringContaining("No API key set")
      );
    });

    it("handles analyzeError failure with analysisFailed status", async () => {
      mockAnalyzeError.mockRejectedValue(new Error("network error"));
      const handler = createPhase1Handler(deps as never);
      await handler.handlePhase1(makeCapturedError(), { trigger: "manual" });

      expect(deps.statusManager.updateStatus).toHaveBeenCalledWith("analysisFailed");
    });

    it("stores the last error for Phase 2 correlation", async () => {
      const handler = createPhase1Handler(deps as never);
      const error = makeCapturedError({ message: "specific error" });
      await handler.handlePhase1(error, { trigger: "manual" });

      expect(handler.getLastError()?.message).toBe("specific error");
    });

    it("stores the last bug ID for Phase 2 correlation", async () => {
      const handler = createPhase1Handler(deps as never);
      await handler.handlePhase1(makeCapturedError(), { trigger: "manual" });

      expect(handler.getLastBugId()).toMatch(/^bug_/);
    });
  });

  describe("getBugsWithFallback", () => {
    it("returns stored bugs when they exist", async () => {
      const bugs = [makeBugRecord({ id: "bug-1" })];
      deps.storage.getAll.mockResolvedValue(bugs);
      const handler = createPhase1Handler(deps as never);

      const result = await handler.getBugsWithFallback();
      expect(result).toEqual(bugs);
    });

    it("returns seed data when storage is empty", async () => {
      deps.storage.getAll.mockResolvedValue([]);
      const seeds = [makeBugRecord({ id: "seed-1" })];
      mockGetSeedBugRecords.mockReturnValue(seeds);
      const handler = createPhase1Handler(deps as never);

      const result = await handler.getBugsWithFallback();
      expect(result).toEqual(seeds);
    });
  });

  describe("state accessors", () => {
    it("isDiffReviewActive reflects holdDiffReview OR pendingDiffReview", () => {
      const handler = createPhase1Handler(deps as never);
      expect(handler.isDiffReviewActive()).toBe(false);

      handler.setHoldDiffReview(true);
      expect(handler.isDiffReviewActive()).toBe(true);

      handler.setHoldDiffReview(false);
      handler.setDiffReviewPending(true);
      expect(handler.isDiffReviewActive()).toBe(true);
    });
  });
});
