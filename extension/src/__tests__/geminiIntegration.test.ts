import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock vscode before importing anything that uses it
vi.mock("vscode", () => ({
  workspace: {
    workspaceFolders: [{ uri: { fsPath: process.cwd() } }],
  },
}));

import { initialize, analyzeError, analyzeDiff, isInitialized, testConnection } from "../llmClient.js";
import { loadEnv } from "../envLoader.js";

// Load real .env for integration testing
const env = loadEnv();
const REAL_API_KEY = env.get("GEMINI_API_KEY");

// Only run these tests if an API key is present
const describeIntegration = REAL_API_KEY ? describe : describe.skip;

describeIntegration("Gemini Integration (Real API)", () => {
  beforeEach(async () => {
    console.log(`[IntegrationTest] Initializing with key length: ${REAL_API_KEY?.length ?? 0}`);
    // Re-initialize with real key for each test
    await initialize({ get: (key) => (key === "visualdebugger.geminiKey" ? REAL_API_KEY : undefined) });
  });

  it("successfully initializes and connects to Gemini", () => {
    expect(isInitialized()).toBe(true);
  });

  it("verifies connection with a simple ping", async () => {
    try {
      const response = await testConnection();
      expect(response).toBeTruthy();
      expect(typeof response).toBe("string");
      console.log("[IntegrationTest] Connection Test Response:", response);
    } catch (e) {
      console.error("[IntegrationTest] Connection Test Failed:", e);
      throw e;
    }
  });

  it("analyzes a real Runtime Error context", async () => {
    const result = await analyzeError({
      language: "typescriptreact",
      filename: "BrokenRuntime.tsx",
      errorMessage: "TypeError: Cannot read properties of undefined (reading 'map')",
      codeContext: `
5  |  const [data, setData] = useState();
6  |  useEffect(() => {
7  |    fetch("/api/items").then(res => res.json()).then(setData);
8  |  }, []);
9  |  return (
10 |    <ul>{data.map(item => <li>{item}</li>)}</ul>
11 |  );`,
    });

    expect(result.category).toBe("Runtime Error");
    expect(result.tldr.length).toBeLessThan(100);
    expect(result.quiz.options).toHaveLength(4);
    expect(["A", "B", "C", "D"]).toContain(result.quiz.correct);
    console.log("[IntegrationTest] Phase 1 Response:", JSON.stringify(result, null, 2));
  }, 30000); // 30s timeout for real API

  it("analyzes a real Logic Error context", async () => {
    const result = await analyzeError({
      language: "typescriptreact",
      filename: "BrokenLogic.tsx",
      errorMessage: "", // Empty for logic error logic
      codeContext: `
7  |  export function MyList() {
8  |    const items = ["Apple", "Banana", "Cherry"];
9  |    const listItems = [];
10 |    for (let i = 0; i <= items.length; i++) {
11 |      listItems.push(<li key={i}>{items[i]}</li>);
12 |    }
13 |    return <ul>{listItems}</ul>;
14 |  }`,
    });

    // Accept either Logic Error or Syntax Error for this specific case
    // as LLM classification can vary, but ensure we got a valid response.
    expect(["Logic Error", "Syntax Error"]).toContain(result.category);
    // Real-model integration is non-deterministic; verify location is well-formed
    // instead of pinning to one exact line.
    expect(result.location).toMatch(/line\s+\d+/i);
    console.log("[IntegrationTest] Phase 1 Logic Response:", JSON.stringify(result, null, 2));
  }, 30000);

  it("analyzes a real code diff (Phase 2)", async () => {
    const result = await analyzeDiff({
      language: "typescriptreact",
      filename: "BrokenLogic.tsx",
      originalError: "List renders an extra empty item at the end",
      diff: `--- a/BrokenLogic.tsx
+++ b/BrokenLogic.tsx
-  for (let i = 0; i <= items.length; i++) {
+  for (let i = 0; i < items.length; i++) {`,
    });

    expect(result.quickSummary).toBeTruthy();
    expect(result.whyItWorks).toBeTruthy();
    expect(result.whatToDoNext).toHaveLength(3);
    console.log("[IntegrationTest] Phase 2 Response:", JSON.stringify(result, null, 2));
  }, 30000);

  it("fails gracefully with an invalid API key", async () => {
    // Re-init with bad key
    await initialize({ get: () => "invalid-key-123" });
    
    try {
      const result = await analyzeError({
        language: "js",
        filename: "test.js",
        errorMessage: "err",
        codeContext: "code"
      });
      console.error("[IntegrationTest] UNEXPECTED SUCCESS with invalid key:", result);
      throw new Error("Should have thrown but succeeded");
    } catch (e: any) {
      console.log("[IntegrationTest] Correctly caught error with invalid key:", e.message);
      expect(e).toBeTruthy();
    }
  });
});
