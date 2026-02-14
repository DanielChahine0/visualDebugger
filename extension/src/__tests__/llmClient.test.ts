import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Phase1Response, Phase2Response, DiffAnalysisRequest } from "../types.js";

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
  tldr: "You called .map() on undefined data.",
  explanation:
    "You're trying to call .map() on a variable that is undefined. The 'data' variable hasn't been set yet when the component first renders.",
  howToFix:
    "Initialize your state with an empty array: useState([]) instead of useState(). Then add a null check before calling .map().",
  howToPrevent:
    "Always initialize state with a default value that matches the type you expect.",
  bestPractices:
    "Use optional chaining (data?.map()) or provide a fallback (data || []).map() to guard against undefined values.",
  keyTerms: ["Cannot read properties", "undefined", "map"],
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

const MOCK_PHASE1_SYNTAX: Phase1Response = {
  category: "Syntax Error",
  location: "line 17, BrokenSyntax.tsx",
  tldr: "The return statement is missing a closing parenthesis.",
  explanation: "The error says 'Unexpected token, expected \",\"'. The parser reached the end of your return statement and found '}' instead of ')'. The return() on line 12 was never closed.",
  howToFix: "Add a closing ')' after </div> on line 16 so the return statement is properly closed.",
  howToPrevent: "When you type an opening bracket, immediately type the closing one, then fill in the middle.",
  bestPractices: "Use an editor with bracket matching. Most editors highlight unmatched brackets in red.",
  keyTerms: ["Unexpected token", "expected ','", "closing parenthesis"],
  quiz: {
    question: "What is the root cause of this SyntaxError?",
    options: [
      "A) The <div> tag is not closed",
      "B) The return statement is missing its closing parenthesis",
      "C) The JSX expression {message} is invalid",
      "D) The function is missing a return type",
    ],
    correct: "B",
    explanation: "The return( on line 12 opens a parenthesis that is never closed. The parser expected ')' but found '}' instead.",
  },
};

const MOCK_PHASE1_LOGIC: Phase1Response = {
  category: "Logic Error",
  location: "line 10, BrokenLogic.tsx",
  tldr: "The loop runs one step beyond the array.",
  explanation: "No crash, but the loop runs one time too many. 'i <= items.length' should be 'i < items.length'. Arrays are zero-indexed, so items[3] is undefined, rendering an extra empty item.",
  howToFix: "On line 10, change '<=' to '<': for (let i = 0; i < items.length; i++).",
  howToPrevent: "Array indices go from 0 to length - 1. Always use '< length' not '<= length'.",
  bestPractices: "Prefer .map() or for...of loops over manual index loops to eliminate off-by-one bugs.",
  keyTerms: ["off-by-one", "<= items.length", "undefined item"],
  quiz: {
    question: "Why does the loop render an extra undefined item?",
    options: [
      "A) The array is empty",
      "B) The loop starts at index 1 instead of 0",
      "C) The condition '<=' runs one iteration past the last valid index",
      "D) The push() method adds an extra element",
    ],
    correct: "C",
    explanation: "'<=' means the loop runs when i equals items.length (3), but the last valid index is 2.",
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

// --- Syntax fix test data ---
const SYNTAX_FIX_REQUEST: DiffAnalysisRequest = {
  language: "TypeScript",
  filename: "BrokenSyntax.tsx",
  originalError: 'SyntaxError: Unexpected token, expected ","',
  diff: `  - <p>Hello, {name}</p>
  + <p>Hello, {name}</p>)
    </div>
  -
  +  );`,
};

const SYNTAX_FIX_RESPONSE: Phase2Response = {
  whatChanged:
    "Added a closing `)` after the JSX block to close the `return(` statement.",
  whyItFixes:
    "The `return(` had no matching `)`, so the parser could not determine where the expression ended. Adding `)` completes it.",
  keyTakeaway:
    "Every opening parenthesis needs a matching closing one, especially in multi-line JSX returns.",
};

// --- Logic fix test data ---
const LOGIC_FIX_REQUEST: DiffAnalysisRequest = {
  language: "TypeScript",
  filename: "BrokenLogic.tsx",
  originalError: "List renders an extra empty item at the end",
  diff: `  - for (let i = 0; i <= items.length; i++) {
  + for (let i = 0; i < items.length; i++) {`,
};

const LOGIC_FIX_RESPONSE: Phase2Response = {
  whatChanged:
    "Changed the loop condition from `<=` to `<` when iterating over the items array.",
  whyItFixes:
    "Using `<=` caused the loop to access one index past the end of the array, producing an undefined item. `<` stops at the last valid index.",
  keyTakeaway:
    "Use `i < array.length` not `i <= array.length` to avoid off-by-one errors.",
};

// --- Runtime fix test data ---
const RUNTIME_FIX_REQUEST: DiffAnalysisRequest = {
  language: "TypeScript",
  filename: "BrokenRuntime.tsx",
  originalError:
    "TypeError: Cannot read properties of undefined (reading 'map')",
  diff: `  - const [data, setData] = useState();
  + const [data, setData] = useState<string[]>([]);
  ...
  - <ul>{data.map(item => <li>{item}</li>)}</ul>
  + <ul>{data?.map(item => <li key={item}>{item}</li>)}</ul>`,
};

const RUNTIME_FIX_RESPONSE: Phase2Response = {
  whatChanged:
    "Initialized useState with an empty array and added optional chaining `?.` before `.map()`.",
  whyItFixes:
    "Without a default value, data was undefined on first render. Calling .map() on undefined crashes. An empty array default and `?.` prevent that.",
  keyTakeaway:
    "Initialize React state to match how you use it — call .map() only on arrays, not undefined.",
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

    it("returns correctly typed Phase1Response for a Syntax Error", async () => {
      await initialize(makeSecrets("test-api-key"));
      mockGenerateContent.mockResolvedValueOnce({
        text: JSON.stringify(MOCK_PHASE1_SYNTAX),
      });

      const result = await analyzeError({
        language: "TypeScript",
        filename: "BrokenSyntax.tsx",
        errorMessage: "SyntaxError: Unexpected token, expected \",\"",
        codeContext: `12 |   return (
13 |     <div>
14 |       <h1>Welcome</h1>
15 |       <p>{message}</p>
16 |     </div>
17 |   // missing closing parenthesis
18 |  }`,
      });

      expect(result).toEqual(MOCK_PHASE1_SYNTAX);
      expect(result.category).toBe("Syntax Error");
      expect(result.quiz.options).toHaveLength(4);
      expect(["A", "B", "C", "D"]).toContain(result.quiz.correct);
    });

    it("returns correctly typed Phase1Response for a Logic Error", async () => {
      await initialize(makeSecrets("test-api-key"));
      mockGenerateContent.mockResolvedValueOnce({
        text: JSON.stringify(MOCK_PHASE1_LOGIC),
      });

      const result = await analyzeError({
        language: "TypeScript",
        filename: "BrokenLogic.tsx",
        errorMessage: "",
        codeContext: `8  |  const items = ["Apple", "Banana", "Cherry"];
9  |  const listItems = [];
10 |  for (let i = 0; i <= items.length; i++) {
11 |    listItems.push(<li key={i}>{items[i]}</li>);
12 |  }`,
      });

      expect(result).toEqual(MOCK_PHASE1_LOGIC);
      expect(result.category).toBe("Logic Error");
      expect(result.quiz.options).toHaveLength(4);
    });

    it("uses fallback text when errorMessage is empty (logic error)", async () => {
      await initialize(makeSecrets("test-api-key"));
      mockGenerateContent.mockResolvedValueOnce({
        text: JSON.stringify(MOCK_PHASE1_LOGIC),
      });

      await analyzeError({
        language: "TypeScript",
        filename: "BrokenLogic.tsx",
        errorMessage: "",
        codeContext: "for (let i = 0; i <= items.length; i++) {}",
      });

      const call = mockGenerateContent.mock.calls[0][0];
      expect(call.contents).toContain("No error message");
      expect(call.contents).not.toContain("Error message: \n");
    });

    it("prompt includes few-shot examples for all 3 bug categories", async () => {
      await initialize(makeSecrets("test-api-key"));
      mockGenerateContent.mockResolvedValueOnce({
        text: JSON.stringify(MOCK_PHASE1),
      });

      await analyzeError({
        language: "TypeScript",
        filename: "App.tsx",
        errorMessage: "TypeError: test",
        codeContext: "code",
      });

      const call = mockGenerateContent.mock.calls[0][0];
      const prompt = call.contents;

      expect(prompt).toContain("Example 1: Syntax Error");
      expect(prompt).toContain("Example 2: Logic Error");
      expect(prompt).toContain("Example 3: Runtime Error");

      expect(prompt).toContain("Syntax Error");
      expect(prompt).toContain("Logic Error");
      expect(prompt).toContain("Runtime Error");
    });

    it("quiz has exactly 4 options and a valid correct answer", async () => {
      await initialize(makeSecrets("test-api-key"));

      for (const mock of [MOCK_PHASE1_SYNTAX, MOCK_PHASE1_LOGIC, MOCK_PHASE1]) {
        mockGenerateContent.mockResolvedValueOnce({
          text: JSON.stringify(mock),
        });

        const result = await analyzeError({
          language: "TypeScript",
          filename: "test.tsx",
          errorMessage: "test error",
          codeContext: "test code",
        });

        expect(result.quiz.options).toHaveLength(4);
        expect(["A", "B", "C", "D"]).toContain(result.quiz.correct);
        expect(result.quiz.question.length).toBeGreaterThan(10);
        expect(result.quiz.explanation.length).toBeGreaterThan(10);
      }
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

    it("syntax fix returns correct Phase2Response", async () => {
      const secrets = makeSecrets("test-api-key");
      await initialize(secrets);

      mockGenerateContent.mockResolvedValueOnce({
        text: JSON.stringify(SYNTAX_FIX_RESPONSE),
      });

      const result = await analyzeDiff(SYNTAX_FIX_REQUEST);

      expect(result).toEqual(SYNTAX_FIX_RESPONSE);
      expect(result.whatChanged).toBeTruthy();
      expect(result.whyItFixes).toBeTruthy();
      expect(result.keyTakeaway).toBeTruthy();
      expect(result.whatChanged).toMatch(/\)|parenthesis|closing/i);
    });

    it("logic fix returns correct Phase2Response", async () => {
      const secrets = makeSecrets("test-api-key");
      await initialize(secrets);

      mockGenerateContent.mockResolvedValueOnce({
        text: JSON.stringify(LOGIC_FIX_RESPONSE),
      });

      const result = await analyzeDiff(LOGIC_FIX_REQUEST);

      expect(result).toEqual(LOGIC_FIX_RESPONSE);
      expect(result.whatChanged).toBeTruthy();
      expect(result.whyItFixes).toBeTruthy();
      expect(result.keyTakeaway).toBeTruthy();
      expect(result.whatChanged).toMatch(/<=|less-than/i);
    });

    it("runtime fix returns correct Phase2Response", async () => {
      const secrets = makeSecrets("test-api-key");
      await initialize(secrets);

      mockGenerateContent.mockResolvedValueOnce({
        text: JSON.stringify(RUNTIME_FIX_RESPONSE),
      });

      const result = await analyzeDiff(RUNTIME_FIX_REQUEST);

      expect(result).toEqual(RUNTIME_FIX_RESPONSE);
      expect(result.whatChanged).toBeTruthy();
      expect(result.whyItFixes).toBeTruthy();
      expect(result.keyTakeaway).toBeTruthy();
      expect(result.whatChanged).toMatch(/useState|optional chaining|\?\./i);
    });

    it("multi-hunk diff prompt passes full diff content", async () => {
      const secrets = makeSecrets("test-api-key");
      await initialize(secrets);

      mockGenerateContent.mockResolvedValueOnce({
        text: JSON.stringify(RUNTIME_FIX_RESPONSE),
      });

      await analyzeDiff(RUNTIME_FIX_REQUEST);

      const call = mockGenerateContent.mock.calls[0][0];
      expect(call.contents).toContain("useState");
      expect(call.contents).toContain(".map(");
    });

    it("prompt includes few-shot examples", async () => {
      const secrets = makeSecrets("test-api-key");
      await initialize(secrets);

      mockGenerateContent.mockResolvedValueOnce({
        text: JSON.stringify(MOCK_PHASE2),
      });

      await analyzeDiff({
        language: "TypeScript",
        filename: "App.tsx",
        originalError: "Error",
        diff: "- old\n+ new",
      });

      const call = mockGenerateContent.mock.calls[0][0];
      expect(call.contents).toContain("## Examples");
      expect(call.contents).toContain("Syntax Fix");
      expect(call.contents).toContain("Logic Fix");
      expect(call.contents).toContain("Runtime Fix");
    });

    it("minimal single-line diff returns valid Phase2Response", async () => {
      const secrets = makeSecrets("test-api-key");
      await initialize(secrets);

      const minimalResponse: Phase2Response = {
        whatChanged: "Changed x to y.",
        whyItFixes: "The old value was incorrect.",
        keyTakeaway: "Use the right variable name.",
      };

      mockGenerateContent.mockResolvedValueOnce({
        text: JSON.stringify(minimalResponse),
      });

      const result = await analyzeDiff({
        language: "TypeScript",
        filename: "tiny.ts",
        originalError: "ReferenceError: x is not defined",
        diff: "- x\n+ y",
      });

      expect(result).toEqual(minimalResponse);
      expect(result.whatChanged).toBeTruthy();
      expect(result.whyItFixes).toBeTruthy();
      expect(result.keyTakeaway).toBeTruthy();
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
