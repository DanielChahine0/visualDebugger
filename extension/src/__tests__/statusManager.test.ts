import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock vscode
vi.mock("vscode", () => ({}), { virtual: true });

// Mock llmClient — statusManager imports isInitialized
const mockIsInitialized = vi.hoisted(() => vi.fn().mockReturnValue(true));
vi.mock("../llmClient", () => ({
  isInitialized: mockIsInitialized,
}));

const { createStatusManager } = await import("../statusManager");

function makeStatusItem() {
  return {
    text: "",
    tooltip: "",
    command: "",
    name: "",
    show: vi.fn(),
    hide: vi.fn(),
    dispose: vi.fn(),
  };
}

describe("createStatusManager", () => {
  let item: ReturnType<typeof makeStatusItem>;

  beforeEach(() => {
    vi.useFakeTimers();
    item = makeStatusItem();
    mockIsInitialized.mockReturnValue(true);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("sets 'ready' state correctly", () => {
    const sm = createStatusManager(item as never);
    sm.updateStatus("ready");
    expect(item.text).toBe("$(bug) Visual Debugger Ready");
    expect(item.tooltip).toBe("Visual Debugger is active. Click to open Bug Dashboard.");
    expect(item.command).toBe("visualdebugger.showDashboard");
    expect(item.show).toHaveBeenCalled();
  });

  it("sets 'needsKey' state correctly", () => {
    const sm = createStatusManager(item as never);
    sm.updateStatus("needsKey");
    expect(item.text).toBe("$(key) Visual Debugger: Set Gemini Key");
    expect(item.tooltip).toBe("Gemini API key is required for analysis. Click to configure.");
    expect(item.command).toBe("visualdebugger.setGeminiKey");
  });

  it("sets 'analyzingError' state correctly", () => {
    const sm = createStatusManager(item as never);
    sm.updateStatus("analyzingError");
    expect(item.text).toBe("$(loading~spin) Visual Debugger: Analyzing error...");
    expect(item.command).toBe("visualdebugger.showDebugPanel");
  });

  it("sets 'errorExplained' state and resets after 5s", () => {
    const sm = createStatusManager(item as never);
    sm.updateStatus("errorExplained");
    expect(item.text).toBe("$(check) Visual Debugger: Error explained");
    expect(item.command).toBe("visualdebugger.showDebugPanel");

    // After 5s, should reset to "ready" (isInitialized returns true)
    vi.advanceTimersByTime(5000);
    expect(item.text).toBe("$(bug) Visual Debugger Ready");
  });

  it("sets 'errorExplained' state and resets to 'needsKey' when not initialized", () => {
    const sm = createStatusManager(item as never);
    mockIsInitialized.mockReturnValue(false);
    sm.updateStatus("errorExplained");

    vi.advanceTimersByTime(5000);
    expect(item.text).toBe("$(key) Visual Debugger: Set Gemini Key");
  });

  it("sets 'analyzingDiff' state correctly", () => {
    const sm = createStatusManager(item as never);
    sm.updateStatus("analyzingDiff");
    expect(item.text).toBe("$(loading~spin) Visual Debugger: Reviewing fix...");
    expect(item.command).toBe("visualdebugger.showDebugPanel");
  });

  it("sets 'diffReviewed' state and resets after 5s", () => {
    const sm = createStatusManager(item as never);
    sm.updateStatus("diffReviewed");
    expect(item.text).toBe("$(git-compare) Visual Debugger: Fix reviewed");

    vi.advanceTimersByTime(5000);
    expect(item.text).toBe("$(bug) Visual Debugger Ready");
  });

  it("sets 'analysisFailed' state and resets after 5s", () => {
    const sm = createStatusManager(item as never);
    sm.updateStatus("analysisFailed");
    expect(item.text).toBe("$(error) Visual Debugger: Analysis failed");
    expect(item.command).toBe("visualdebugger.showDashboard");

    vi.advanceTimersByTime(5000);
    expect(item.text).toBe("$(bug) Visual Debugger Ready");
  });

  it("clears pending reset timer when a new status is set", () => {
    const sm = createStatusManager(item as never);
    sm.updateStatus("errorExplained"); // starts 5s timer
    vi.advanceTimersByTime(3000); // not yet

    sm.updateStatus("analyzingError"); // should clear the timer
    vi.advanceTimersByTime(5000); // original timer would have fired by now

    // Should still be "analyzingError" (not reset to "ready")
    expect(item.text).toBe("$(loading~spin) Visual Debugger: Analyzing error...");
  });

  it("dispose() clears any pending timer", () => {
    const sm = createStatusManager(item as never);
    sm.updateStatus("diffReviewed"); // starts 5s timer
    sm.dispose();

    vi.advanceTimersByTime(10000);
    // Should still be "diffReviewed" since dispose cleared the timer
    expect(item.text).toBe("$(git-compare) Visual Debugger: Fix reviewed");
  });

  it("calls show() on every status update", () => {
    const sm = createStatusManager(item as never);
    sm.updateStatus("ready");
    sm.updateStatus("analyzingError");
    sm.updateStatus("errorExplained");
    expect(item.show).toHaveBeenCalledTimes(3);
  });
});
