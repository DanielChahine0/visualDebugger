/**
 * LLM Client — Gemini API integration.
 * Owner: Engineer 3. Engineer 1 provides the interface contract.
 */
import * as vscode from "vscode";
import { CapturedError, ErrorExplanation, CapturedDiff, DiffExplanation } from "./types";

const LOG = "[FlowFixer:LLMClient]";

export class LLMClient {
  private apiKey: string | undefined;

  constructor(private readonly secrets: vscode.SecretStorage) {}

  async initialize(): Promise<void> {
    this.apiKey = await this.secrets.get("flowfixer.geminiKey");
    if (!this.apiKey) {
      console.warn(`${LOG} no Gemini API key set. Use 'FlowFixer: Set Gemini API Key' command.`);
    }
  }

  /** Phase 1: Explain an error for a student */
  async explainError(error: CapturedError): Promise<ErrorExplanation> {
    const prompt = this.buildErrorPrompt(error);

    if (!this.apiKey) {
      console.warn(`${LOG} no API key, returning mock explanation`);
      return this.mockErrorExplanation(error);
    }

    try {
      const { GoogleGenerativeAI } = await import("@google/generative-ai");
      const genAI = new GoogleGenerativeAI(this.apiKey);
      const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

      const result = await model.generateContent(prompt);
      const text = result.response.text();

      // Extract JSON from response
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error("No JSON found in LLM response");
      }
      return JSON.parse(jsonMatch[0]) as ErrorExplanation;
    } catch (err) {
      console.error(`${LOG} Gemini error explanation failed:`, err);
      return this.mockErrorExplanation(error);
    }
  }

  /** Phase 2: Explain a diff (what the AI fix changed) */
  async explainDiff(diff: CapturedDiff, originalError: string): Promise<DiffExplanation> {
    const prompt = this.buildDiffPrompt(diff, originalError);

    if (!this.apiKey) {
      console.warn(`${LOG} no API key, returning mock diff explanation`);
      return this.mockDiffExplanation();
    }

    try {
      const { GoogleGenerativeAI } = await import("@google/generative-ai");
      const genAI = new GoogleGenerativeAI(this.apiKey);
      const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

      const result = await model.generateContent(prompt);
      const text = result.response.text();

      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error("No JSON found in LLM response");
      }
      return JSON.parse(jsonMatch[0]) as DiffExplanation;
    } catch (err) {
      console.error(`${LOG} Gemini diff explanation failed:`, err);
      return this.mockDiffExplanation();
    }
  }

  private buildErrorPrompt(error: CapturedError): string {
    return `You are a coding education assistant. A student just hit an error they don't understand. Your job is to explain it clearly so they can learn from it.

## Input
- Language: ${error.language}
- File: ${error.file}
- Error message: ${error.message}
- Code context (lines around the error):
${error.codeContext}

## Instructions
Analyze this error and respond in JSON only (no markdown fences):

{
  "category": "one of: Syntax Error | Logic Error | Runtime Error",
  "location": "File and line number where the bug is",
  "explanation": "2-3 sentences explaining what this error message MEANS in plain English. Write for a student who has never seen this error before.",
  "howToFix": "Step-by-step instructions for how to fix this specific bug. Reference the actual code.",
  "howToPrevent": "1-2 sentences on how to avoid this type of bug in the future.",
  "bestPractices": "1-2 sentences on the industry best practice related to this bug type.",
  "quiz": {
    "question": "A question testing if the student understands WHY this error occurred",
    "options": ["A) ...", "B) ...", "C) ...", "D) ..."],
    "correct": "A",
    "explanation": "Why the correct answer is right"
  }
}

Rules: Explain for beginners. Reference the actual code. Keep explanation under 60 words.`;
  }

  private buildDiffPrompt(diff: CapturedDiff, originalError: string): string {
    return `You are a coding education assistant. A student had a bug, and an AI tool just fixed it. Your job is to explain what the AI changed and why.

## Input
- Language: ${diff.language}
- File: ${diff.file}
- Original error: ${originalError}
- Diff (before → after):
${diff.unifiedDiff}

## Instructions
Analyze this diff and respond in JSON only (no markdown fences):

{
  "whatChanged": "1-2 sentences describing exactly what the AI modified in the code",
  "whyItFixes": "2-3 sentences explaining WHY these changes fix the original error. Connect it back to the root cause.",
  "keyTakeaway": "One sentence the student should remember from this fix"
}

Rules: Explain for beginners. Reference specific lines from the diff. Keep whatChanged under 30 words.`;
  }

  private mockErrorExplanation(error: CapturedError): ErrorExplanation {
    return {
      category: error.message.toLowerCase().includes("syntax")
        ? "Syntax Error"
        : error.message.toLowerCase().includes("type")
        ? "Runtime Error"
        : "Logic Error",
      location: `${error.file}, line ${error.line}`,
      explanation: `The error "${error.message}" means your code has a problem that prevents it from running correctly. Check the indicated line for issues.`,
      howToFix: "Review the error message and the code at the indicated line. Look for typos, missing brackets, or undefined variables.",
      howToPrevent: "Always check your code for common mistakes before running. Use a linter to catch issues early.",
      bestPractices: "Use TypeScript strict mode and enable ESLint to catch potential errors before they happen.",
    };
  }

  private mockDiffExplanation(): DiffExplanation {
    return {
      whatChanged: "The AI modified the code to fix the reported error.",
      whyItFixes: "The changes address the root cause of the error by correcting the problematic code pattern.",
      keyTakeaway: "Always understand what changed in your code and why before accepting an AI fix.",
    };
  }
}
