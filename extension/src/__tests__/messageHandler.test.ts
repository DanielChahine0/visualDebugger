import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock ttsClient
const mockFetchTtsAudio = vi.hoisted(() => vi.fn());
vi.mock("../ttsClient", () => ({
  fetchTtsAudio: mockFetchTtsAudio,
}));

const { createMessageHandler } = await import("../messageHandler");

function makeTarget() {
  return { postMessage: vi.fn() };
}

function makeSecrets(keys: Record<string, string> = {}) {
  return {
    get: vi.fn(async (key: string) => keys[key]),
  };
}

describe("createMessageHandler", () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  it("handles 'ready' message by logging", async () => {
    const handler = createMessageHandler({ mergedSecrets: makeSecrets() });
    const target = makeTarget();

    await handler("error", target, { type: "ready" });

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("error panel ready"));
    expect(target.postMessage).not.toHaveBeenCalled();
  });

  it("handles 'diffReviewClosed' message by logging", async () => {
    const handler = createMessageHandler({ mergedSecrets: makeSecrets() });
    const target = makeTarget();

    await handler("diff", target, { type: "diffReviewClosed" });

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("diff review unpinned"));
  });

  it("handles 'quizAnswer' message by logging", async () => {
    const handler = createMessageHandler({ mergedSecrets: makeSecrets() });
    const target = makeTarget();

    await handler("dashboard", target, { type: "quizAnswer", answer: "B" });

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("quiz answered from dashboard panel: B"));
  });

  describe("requestTts", () => {
    it("returns early for empty text", async () => {
      const handler = createMessageHandler({ mergedSecrets: makeSecrets() });
      const target = makeTarget();

      await handler("error", target, { type: "requestTts", text: "   " });

      expect(target.postMessage).not.toHaveBeenCalled();
    });

    it("sends ttsError when ElevenLabs key is missing", async () => {
      const handler = createMessageHandler({ mergedSecrets: makeSecrets() });
      const target = makeTarget();

      await handler("error", target, { type: "requestTts", text: "Hello world" });

      expect(target.postMessage).toHaveBeenCalledWith({
        type: "ttsError",
        data: { message: "ElevenLabs key not set. Check .env file." },
      });
    });

    it("sends playAudio on successful TTS fetch", async () => {
      const secrets = makeSecrets({ "visualdebugger.elevenLabsKey": "test-key" });
      mockFetchTtsAudio.mockResolvedValue("base64data");
      const handler = createMessageHandler({ mergedSecrets: secrets });
      const target = makeTarget();

      await handler("error", target, { type: "requestTts", text: "Hello world" });

      expect(mockFetchTtsAudio).toHaveBeenCalledWith("Hello world", "test-key", "female");
      expect(target.postMessage).toHaveBeenCalledWith({
        type: "playAudio",
        data: { base64Audio: "base64data", mimeType: "audio/mpeg" },
      });
    });

    it("sends ttsError on TTS fetch failure", async () => {
      const secrets = makeSecrets({ "visualdebugger.elevenLabsKey": "test-key" });
      mockFetchTtsAudio.mockRejectedValue(new Error("Network error"));
      const handler = createMessageHandler({ mergedSecrets: secrets });
      const target = makeTarget();

      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      await handler("error", target, { type: "requestTts", text: "Hello world" });

      expect(target.postMessage).toHaveBeenCalledWith({
        type: "ttsError",
        data: { message: "TTS is temporarily unavailable. Using browser voice fallback." },
      });
      errorSpy.mockRestore();
    });
  });
});
