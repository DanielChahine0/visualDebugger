export type BugCategory = "Syntax Error" | "Logic Error" | "Runtime Error";

export interface Quiz {
  question: string;
  options: string[]; // 4 options: "A) ...", "B) ...", "C) ...", "D) ..."
  correct: "A" | "B" | "C" | "D";
  explanation: string;
}

/** Captured error from diagnostics or terminal */
export interface CapturedError {
  message: string;
  file: string;
  line: number;
  language: string;
  codeContext: string; // ±10 lines around the error
  severity: "error" | "warning";
  source: "diagnostics" | "terminal";
  timestamp: number;
}

/** Phase 1: LLM error explanation response */
export interface ErrorExplanation {
  category: BugCategory;
  location: string;
  tldr: string;
  explanation: string;
  howToFix: string;
  howToPrevent: string;
  bestPractices: string;
  keyTerms: string[];
  quiz?: Quiz;
}

/** Alias used by tests and external consumers */
export type Phase1Response = Required<ErrorExplanation>;

/** Captured diff between before/after save */
export interface CapturedDiff {
  file: string;
  language: string;
  beforeContent: string;
  afterContent: string;
  unifiedDiff: string;
  timestamp: number;
}

/** Phase 2: LLM diff explanation response */
export interface DiffExplanation {
  whatChanged: string;
  whyItFixes: string;
  keyTakeaway: string;
}

/** Alias used by tests and external consumers */
export type Phase2Response = DiffExplanation;

/** Request types for the LLM client */
export interface ErrorAnalysisRequest {
  language: string;
  filename: string;
  errorMessage: string;
  codeContext: string;
}

export interface DiffAnalysisRequest {
  language: string;
  filename: string;
  originalError: string;
  diff: string;
}

/** Stored bug record for dashboard */
export interface BugRecord {
  id: string;
  category: BugCategory;
  file: string;
  errorMessage: string;
  explanation: ErrorExplanation;
  diffExplanation?: DiffExplanation;
  timestamp: number;
}

/** Messages from extension host -> webview */
export type ExtToWebviewMessage =
  | { type: "showError"; data: ErrorExplanation & { raw: CapturedError } }
  | { type: "showDiff"; data: DiffExplanation & { diff: CapturedDiff } }
  | { type: "showDashboard"; data: { bugs: BugRecord[] } }
  | { type: "playAudio"; data: { base64Audio: string; mimeType: string } }
  | { type: "ttsError"; data: { message: string } }
  | { type: "clear" };

/** Messages from webview -> extension host */
export type WebviewToExtMessage =
  | { type: "quizAnswer"; answer: string }
  | { type: "requestTts"; text: string }
  | { type: "ready" };
