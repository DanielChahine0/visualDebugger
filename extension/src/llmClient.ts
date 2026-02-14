import { GoogleGenAI, Type } from "@google/genai";
import type {
  ErrorAnalysisRequest,
  DiffAnalysisRequest,
  Phase1Response,
  Phase2Response,
} from "./types.js";

const MODEL = "gemini-2.0-flash";
const SECRET_KEY = "flowfixer.geminiApiKey";

export class FlowFixerError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = "FlowFixerError";
  }
}

// Module-level client — set by initialize()
let genai: GoogleGenAI | null = null;

/**
 * Initialize the LLM client by reading the API key from VS Code SecretStorage.
 * Must be called before analyzeError() or analyzeDiff().
 */
export async function initialize(
  secrets: { get(key: string): Thenable<string | undefined> },
): Promise<void> {
  const apiKey = await secrets.get(SECRET_KEY);
  if (!apiKey) {
    throw new FlowFixerError(
      `Gemini API key not found. Please set it using the "FlowFixer: Set API Key" command.`,
    );
  }
  genai = new GoogleGenAI({ apiKey });
}

function getClient(): GoogleGenAI {
  if (!genai) {
    throw new FlowFixerError(
      "LLM client not initialized. Call initialize() with SecretStorage first.",
    );
  }
  return genai;
}

// --- Phase 1: Error Explanation ---

const PHASE1_PROMPT = `You are a coding education assistant. A student just hit an error they don't understand. Your job is to explain it clearly so they can learn from it.

## Input
- Language: {{language}}
- File: {{filename}}
- Error message: {{errorMessage}}
- Code context (lines around the error):
{{codeContext}}

## Instructions
Analyze this error and respond in JSON.

## Rules
- Explain for beginners, not experts
- Reference the actual code, not abstract concepts
- The error explanation should decode the error message — what does each part mean?
- Keep explanation under 60 words
- Keep howToFix actionable and specific`;

const PHASE1_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    category: {
      type: Type.STRING,
      enum: ["Syntax Error", "Logic Error", "Runtime Error"],
    },
    location: { type: Type.STRING },
    explanation: { type: Type.STRING },
    howToFix: { type: Type.STRING },
    howToPrevent: { type: Type.STRING },
    bestPractices: { type: Type.STRING },
    quiz: {
      type: Type.OBJECT,
      properties: {
        question: { type: Type.STRING },
        options: { type: Type.ARRAY, items: { type: Type.STRING } },
        correct: { type: Type.STRING, enum: ["A", "B", "C", "D"] },
        explanation: { type: Type.STRING },
      },
      required: ["question", "options", "correct", "explanation"],
    },
  },
  required: [
    "category",
    "location",
    "explanation",
    "howToFix",
    "howToPrevent",
    "bestPractices",
    "quiz",
  ],
} as const;

function buildPhase1Prompt(req: ErrorAnalysisRequest): string {
  return PHASE1_PROMPT.replace("{{language}}", req.language)
    .replace("{{filename}}", req.filename)
    .replace("{{errorMessage}}", req.errorMessage)
    .replace("{{codeContext}}", req.codeContext);
}

export async function analyzeError(
  req: ErrorAnalysisRequest,
): Promise<Phase1Response> {
  const client = getClient();
  const prompt = buildPhase1Prompt(req);

  try {
    const response = await client.models.generateContent({
      model: MODEL,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: PHASE1_SCHEMA,
      },
    });

    const text = response.text;
    if (!text) {
      throw new FlowFixerError("Gemini returned an empty response.");
    }

    return JSON.parse(text) as Phase1Response;
  } catch (error) {
    if (error instanceof FlowFixerError) throw error;
    throw new FlowFixerError(
      `Failed to analyze error: ${error instanceof Error ? error.message : String(error)}`,
      error,
    );
  }
}

// --- Phase 2: Diff Explanation ---

const PHASE2_PROMPT = `You are a coding education assistant. A student had a bug, and an AI tool just fixed it. Your job is to explain what the AI changed and why.

## Input
- Language: {{language}}
- File: {{filename}}
- Original error: {{originalError}}
- Diff (before → after):
{{diff}}

## Instructions
Analyze this diff and respond in JSON.

## Rules
- Explain for beginners, not experts
- Reference specific lines from the diff
- Connect the fix back to the original error
- Keep whatChanged under 30 words
- Keep whyItFixes under 50 words`;

const PHASE2_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    whatChanged: { type: Type.STRING },
    whyItFixes: { type: Type.STRING },
    keyTakeaway: { type: Type.STRING },
  },
  required: ["whatChanged", "whyItFixes", "keyTakeaway"],
} as const;

function buildPhase2Prompt(req: DiffAnalysisRequest): string {
  return PHASE2_PROMPT.replace("{{language}}", req.language)
    .replace("{{filename}}", req.filename)
    .replace("{{originalError}}", req.originalError)
    .replace("{{diff}}", req.diff);
}

export async function analyzeDiff(
  req: DiffAnalysisRequest,
): Promise<Phase2Response> {
  const client = getClient();
  const prompt = buildPhase2Prompt(req);

  try {
    const response = await client.models.generateContent({
      model: MODEL,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: PHASE2_SCHEMA,
      },
    });

    const text = response.text;
    if (!text) {
      throw new FlowFixerError("Gemini returned an empty response.");
    }

    return JSON.parse(text) as Phase2Response;
  } catch (error) {
    if (error instanceof FlowFixerError) throw error;
    throw new FlowFixerError(
      `Failed to analyze diff: ${error instanceof Error ? error.message : String(error)}`,
      error,
    );
  }
}
