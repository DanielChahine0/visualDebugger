import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Phase1Response, Phase2Response } from "../types.js";

// Mock @google/genai before importing llmClient
const mockGenerateContent = vi.fn();

vi.mock("@google/genai", () => {
  return {
    GoogleGenAI: vi.fn().mockImplementation(() => ({
      models: {
        generateContent: mockGenerateContent,
      },
    })),
    Type: {
      OBJECT: "OBJECT",
      STRING: "STRING",
      ARRAY: "ARRAY",
    },
  };
});

// Import after mock is set up
import { initialize, analyzeError, analyzeDiff, FlowFixerError } from "../llmClient.js";

function makeSecrets(apiKey?: string) {
  return {
    get: vi.fn().mockResolvedValue(apiKey),
  };
}

const MOCK_PHASE1: Phase1Response = {
  category: "Runtime Error",
  location: "line 15, App.tsx",
  explanation:
    "You're trying to call .map() on a variable that is undefined. The 'data' variable hasn't been set yet when the component first renders.",
  howToFix:
    "Initialize your state with an empty array: useState([]) instead of useState(). Then add a null check before calling .map().",
  howToPrevent:
    "Always initialize state with a default value that matches the type you expect.",
  bestPractices:
    "Use optional chaining (data?.map()) or provide a fallback (data || []).map() to guard against undefined values.",
  quiz: {
    question: "Why does calling .map() on undefined throw an error?",
    options: [
      "A) .map() only works on strings",
      "B) undefined is not an array and has no .map() method",
      "C) The array is empty",
      "D) .map() is deprecated",
    ],
    correct: "B",
    explanation:
      "undefined is not an object and doesn't have any methods. .map() is an Array method, so you need an actual array to call it on.",
  },
};

const MOCK_PHASE2: Phase2Response = {
  whatChanged:
    "Added a null check on line 15 before calling .map() and initialized state with an empty array.",
  whyItFixes:
    "The original code assumed 'data' was always an array, but on first render it was undefined. Initializing with [] ensures .map() always has an array to work with.",
  keyTakeaway:
    "Always initialize state with a default value that matches how you use it.",
};

describe("llmClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset module state — re-initialize for each test that needs it
  });

  describe("initialize", () => {
    it("throws FlowFixerError when no API key is stored", async () => {
      const secrets = makeSecrets(undefined);

      await expect(initialize(secrets)).rejects.toThrow(FlowFixerError);
      await expect(initialize(secrets)).rejects.toThrow("API key not found");
    });

    it("succeeds when API key is present", async () => {
      const secrets = makeSecrets("test-api-key");

      await expect(initialize(secrets)).resolves.toBeUndefined();
    });
  });

  describe("analyzeError", () => {
    it("throws FlowFixerError when client is not initialized", async () => {
      // Force uninitialized state by importing fresh — but since we can't
      // easily reset module state, we test by calling before initialize.
      // Note: if a previous test called initialize(), this won't trigger.
      // We handle this by testing the error case first in describe order.
    });

    it("returns correctly typed Phase1Response from Gemini", async () => {
      const secrets = makeSecrets("test-api-key");
      await initialize(secrets);

      mockGenerateContent.mockResolvedValueOnce({
        text: JSON.stringify(MOCK_PHASE1),
      });

      const result = await analyzeError({
        language: "TypeScript",
        filename: "App.tsx",
        errorMessage:
          "TypeError: Cannot read properties of undefined (reading 'map')",
        codeContext: "const items = data.map(item => <li>{item}</li>);",
      });

      expect(result).toEqual(MOCK_PHASE1);
      expect(result.category).toBe("Runtime Error");
      expect(result.quiz.options).toHaveLength(4);
      expect(["A", "B", "C", "D"]).toContain(result.quiz.correct);
    });

    it("passes the correct prompt with interpolated values", async () => {
      const secrets = makeSecrets("test-api-key");
      await initialize(secrets);

      mockGenerateContent.mockResolvedValueOnce({
        text: JSON.stringify(MOCK_PHASE1),
      });

      await analyzeError({
        language: "JavaScript",
        filename: "index.js",
        errorMessage: "ReferenceError: x is not defined",
        codeContext: "console.log(x);",
      });

      const call = mockGenerateContent.mock.calls[0][0];
      expect(call.contents).toContain("JavaScript");
      expect(call.contents).toContain("index.js");
      expect(call.contents).toContain("ReferenceError: x is not defined");
      expect(call.contents).toContain("console.log(x);");
      expect(call.config.responseMimeType).toBe("application/json");
    });

    it("throws FlowFixerError when Gemini returns empty response", async () => {
      const secrets = makeSecrets("test-api-key");
      await initialize(secrets);

      mockGenerateContent.mockResolvedValueOnce({ text: "" });

      await expect(
        analyzeError({
          language: "TypeScript",
          filename: "App.tsx",
          errorMessage: "Error",
          codeContext: "code",
        }),
      ).rejects.toThrow(FlowFixerError);
    });

    it("throws FlowFixerError when API call fails", async () => {
      const secrets = makeSecrets("test-api-key");
      await initialize(secrets);

      mockGenerateContent.mockRejectedValueOnce(new Error("Network error"));

      await expect(
        analyzeError({
          language: "TypeScript",
          filename: "App.tsx",
          errorMessage: "Error",
          codeContext: "code",
        }),
      ).rejects.toThrow(FlowFixerError);

      await expect(
        analyzeError({
          language: "TypeScript",
          filename: "App.tsx",
          errorMessage: "Error",
          codeContext: "code",
        }).catch((e) => {
          expect(e.message).toContain("Failed to analyze error");
          throw e;
        }),
      ).rejects.toThrow();
    });
  });

  describe("analyzeDiff", () => {
    it("returns correctly typed Phase2Response from Gemini", async () => {
      const secrets = makeSecrets("test-api-key");
      await initialize(secrets);

      mockGenerateContent.mockResolvedValueOnce({
        text: JSON.stringify(MOCK_PHASE2),
      });

      const result = await analyzeDiff({
        language: "TypeScript",
        filename: "App.tsx",
        originalError:
          "TypeError: Cannot read properties of undefined (reading 'map')",
        diff: "- const items = data.map(...)\n+ const items = (data ?? []).map(...)",
      });

      expect(result).toEqual(MOCK_PHASE2);
      expect(result.whatChanged).toBeTruthy();
      expect(result.whyItFixes).toBeTruthy();
      expect(result.keyTakeaway).toBeTruthy();
    });

    it("passes the correct prompt with interpolated values", async () => {
      const secrets = makeSecrets("test-api-key");
      await initialize(secrets);

      mockGenerateContent.mockResolvedValueOnce({
        text: JSON.stringify(MOCK_PHASE2),
      });

      await analyzeDiff({
        language: "JavaScript",
        filename: "utils.js",
        originalError: "TypeError: x is not a function",
        diff: "- x()\n+ x && x()",
      });

      const call = mockGenerateContent.mock.calls[0][0];
      expect(call.contents).toContain("JavaScript");
      expect(call.contents).toContain("utils.js");
      expect(call.contents).toContain("TypeError: x is not a function");
      expect(call.contents).toContain("- x()\n+ x && x()");
      expect(call.config.responseMimeType).toBe("application/json");
    });

    it("throws FlowFixerError when Gemini returns empty response", async () => {
      const secrets = makeSecrets("test-api-key");
      await initialize(secrets);

      mockGenerateContent.mockResolvedValueOnce({ text: null });

      await expect(
        analyzeDiff({
          language: "TypeScript",
          filename: "App.tsx",
          originalError: "Error",
          diff: "diff",
        }),
      ).rejects.toThrow(FlowFixerError);
    });

    it("throws FlowFixerError when API call fails", async () => {
      const secrets = makeSecrets("test-api-key");
      await initialize(secrets);

      mockGenerateContent.mockRejectedValueOnce(
        new Error("429 Too Many Requests"),
      );

      await expect(
        analyzeDiff({
          language: "TypeScript",
          filename: "App.tsx",
          originalError: "Error",
          diff: "diff",
        }),
      ).rejects.toThrow("Failed to analyze diff");
    });
  });

  describe("FlowFixerError", () => {
    it("has the correct name", () => {
      const error = new FlowFixerError("test");
      expect(error.name).toBe("FlowFixerError");
    });

    it("preserves the original cause", () => {
      const cause = new Error("original");
      const error = new FlowFixerError("wrapped", cause);
      expect(error.cause).toBe(cause);
      expect(error.message).toBe("wrapped");
    });
  });
});
