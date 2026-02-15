import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock vscode before imports
vi.mock("vscode", () => ({}), { virtual: true });

// In-memory mock of VS Code's Memento (globalState)
function createMockGlobalState(): Record<string, unknown> & {
  get<T>(key: string, defaultValue: T): T;
  update(key: string, value: unknown): Promise<void>;
} {
  const store = new Map<string, unknown>();
  return {
    get<T>(key: string, defaultValue: T): T {
      return (store.has(key) ? store.get(key) : defaultValue) as T;
    },
    async update(key: string, value: unknown): Promise<void> {
      store.set(key, value);
    },
  } as ReturnType<typeof createMockGlobalState>;
}

// Import after mocks
const { FlowFixerStorage } = await import("../storage");

function makeBugRecord(overrides: Partial<{ id: string; category: string; file: string; errorMessage: string; timestamp: number }> = {}) {
  return {
    id: overrides.id ?? "bug-1",
    category: overrides.category ?? "Runtime Error",
    file: overrides.file ?? "test.ts",
    errorMessage: overrides.errorMessage ?? "TypeError: Cannot read properties of undefined",
    explanation: {
      category: "Runtime Error" as const,
      location: "test.ts:10",
      tldr: "You called a method on undefined.",
      explanation: "The variable is undefined when you try to access it.",
      howToFix: "Add a null check before accessing the property.",
      howToPrevent: "Always initialize variables before use.",
      bestPractices: "Use optional chaining (?.) for safer property access.",
      keyTerms: ["undefined", "TypeError"],
      suggestedPrompt: "How do I fix undefined errors?",
      quiz: {
        question: "What causes a TypeError?",
        options: ["A) Missing variable", "B) Wrong type", "C) Undefined access", "D) Syntax error"],
        correct: "C" as const,
        explanation: "Accessing properties on undefined causes TypeError.",
      },
    },
    timestamp: overrides.timestamp ?? Date.now(),
  };
}

describe("FlowFixerStorage", () => {
  let globalState: ReturnType<typeof createMockGlobalState>;
  let storage: InstanceType<typeof FlowFixerStorage>;

  beforeEach(() => {
    globalState = createMockGlobalState();
    storage = new FlowFixerStorage(globalState as never);
  });

  describe("getAll", () => {
    it("returns empty array when no records exist", async () => {
      const records = await storage.getAll();
      expect(records).toEqual([]);
    });

    it("returns all saved records", async () => {
      const bug1 = makeBugRecord({ id: "bug-1" });
      const bug2 = makeBugRecord({ id: "bug-2" });
      await storage.save(bug1);
      await storage.save(bug2);

      const records = await storage.getAll();
      expect(records).toHaveLength(2);
      expect(records[0].id).toBe("bug-1");
      expect(records[1].id).toBe("bug-2");
    });
  });

  describe("save", () => {
    it("adds a record to storage", async () => {
      const bug = makeBugRecord();
      await storage.save(bug);

      const records = await storage.getAll();
      expect(records).toHaveLength(1);
      expect(records[0].id).toBe("bug-1");
    });

    it("appends to existing records", async () => {
      await storage.save(makeBugRecord({ id: "bug-1" }));
      await storage.save(makeBugRecord({ id: "bug-2" }));
      await storage.save(makeBugRecord({ id: "bug-3" }));

      const records = await storage.getAll();
      expect(records).toHaveLength(3);
    });

    it("preserves record data exactly", async () => {
      const bug = makeBugRecord({ id: "test-id", file: "app.tsx", errorMessage: "custom error" });
      await storage.save(bug);

      const records = await storage.getAll();
      expect(records[0].id).toBe("test-id");
      expect(records[0].file).toBe("app.tsx");
      expect(records[0].errorMessage).toBe("custom error");
    });
  });

  describe("update", () => {
    it("replaces existing record by ID", async () => {
      const original = makeBugRecord({ id: "bug-1", errorMessage: "original error" });
      await storage.save(original);

      const updated = makeBugRecord({ id: "bug-1", errorMessage: "updated error" });
      await storage.update(updated);

      const records = await storage.getAll();
      expect(records).toHaveLength(1);
      expect(records[0].errorMessage).toBe("updated error");
    });

    it("adds record if ID not found (upsert behavior)", async () => {
      await storage.save(makeBugRecord({ id: "bug-1" }));
      await storage.update(makeBugRecord({ id: "bug-2" }));

      const records = await storage.getAll();
      expect(records).toHaveLength(2);
    });

    it("only updates the matching record, leaves others unchanged", async () => {
      await storage.save(makeBugRecord({ id: "bug-1", errorMessage: "first" }));
      await storage.save(makeBugRecord({ id: "bug-2", errorMessage: "second" }));
      await storage.update(makeBugRecord({ id: "bug-1", errorMessage: "first-updated" }));

      const records = await storage.getAll();
      expect(records).toHaveLength(2);
      expect(records[0].errorMessage).toBe("first-updated");
      expect(records[1].errorMessage).toBe("second");
    });
  });

  describe("dispose", () => {
    it("is callable without error", () => {
      expect(() => storage.dispose()).not.toThrow();
    });

    it("is callable multiple times", () => {
      storage.dispose();
      expect(() => storage.dispose()).not.toThrow();
    });
  });

  describe("sequential operations", () => {
    it("handles multiple sequential saves correctly", async () => {
      for (let i = 0; i < 10; i++) {
        await storage.save(makeBugRecord({ id: `bug-${i}` }));
      }

      const records = await storage.getAll();
      expect(records).toHaveLength(10);
    });

    it("handles save followed by update correctly", async () => {
      await storage.save(makeBugRecord({ id: "bug-1", errorMessage: "v1" }));
      await storage.update(makeBugRecord({ id: "bug-1", errorMessage: "v2" }));
      await storage.save(makeBugRecord({ id: "bug-2", errorMessage: "new" }));

      const records = await storage.getAll();
      expect(records).toHaveLength(2);
      expect(records[0].errorMessage).toBe("v2");
      expect(records[1].errorMessage).toBe("new");
    });
  });
});
