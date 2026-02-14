export type BugCategory = "Syntax Error" | "Logic Error" | "Runtime Error";

export interface Quiz {
  question: string;
  options: string[]; // 4 options: "A) ...", "B) ...", "C) ...", "D) ..."
  correct: "A" | "B" | "C" | "D";
  explanation: string;
}

export interface Phase1Response {
  category: BugCategory;
  location: string;
  explanation: string;
  howToFix: string;
  howToPrevent: string;
  bestPractices: string;
  quiz: Quiz;
}

export interface Phase2Response {
  whatChanged: string;
  whyItFixes: string;
  keyTakeaway: string;
}

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
