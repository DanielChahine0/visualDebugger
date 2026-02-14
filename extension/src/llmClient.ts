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
  (If this is empty or says "No error message", this is likely a logic error where the code runs but produces wrong results.)
- Code context (lines around the error):
{{codeContext}}

## Output Format

Respond with a JSON object containing:

- "category": Classify as exactly one of "Syntax Error", "Logic Error", or "Runtime Error".
  - Syntax Error: Code cannot be parsed. Brackets, parentheses, commas, or keywords are missing/wrong.
  - Logic Error: Code runs without crashing but produces wrong results. Wrong operator, bad condition, off-by-one.
  - Runtime Error: Code parses and starts running but crashes mid-execution. Null references, type errors, missing properties.

- "location": File name and line number(s) where the bug is. Format: "line N, filename.ext"

- "explanation": Decode the error message piece by piece for a beginner. What does each part of the error message mean? If there is no error message (logic error), explain what the code does wrong and what symptoms the student would see. Under 60 words.

- "howToFix": Step-by-step instructions referencing the actual code the student wrote. Tell them exactly what to change, on which line. Under 40 words.

- "howToPrevent": A general principle the student can apply next time to avoid this class of bug. Under 30 words.

- "bestPractices": An industry best practice related to this bug type. Under 30 words.

- "quiz": A multiple-choice question (4 options, one correct) testing whether the student understands WHY the error happened — not just what to do. The wrong options should be plausible but clearly wrong if you understood the explanation. Include a brief explanation of why the correct answer is right.

## Example 1: Syntax Error

Input:
- Language: TypeScript
- File: BrokenSyntax.tsx
- Error message: SyntaxError: Unexpected token, expected ","
- Code context:
  12 |   return (
  13 |     <div>
  14 |       <h1>Welcome</h1>
  15 |       <p>{message}</p>
  16 |     </div>
  17 |   // missing closing parenthesis
  18 |  }

Output:
{
  "category": "Syntax Error",
  "location": "line 17, BrokenSyntax.tsx",
  "explanation": "The error says 'Unexpected token, expected \\",\\"'. This means the parser reached the end of your return statement and found something it didn't expect. It's looking for a closing ')' to match the '(' on line 12, but instead it finds '}'. The return() call was never closed.",
  "howToFix": "Add a closing ')' after the </div> on line 16 so the return statement is properly closed: return ( <div>...</div> )",
  "howToPrevent": "When you type an opening bracket or parenthesis, immediately type the closing one, then fill in the middle.",
  "bestPractices": "Use an editor with bracket matching enabled. Most editors highlight unmatched brackets in red.",
  "quiz": {
    "question": "What is the root cause of this SyntaxError?",
    "options": [
      "A) The <div> tag is not closed",
      "B) The return statement is missing its closing parenthesis",
      "C) The JSX expression {message} is invalid",
      "D) The function is missing a return type"
    ],
    "correct": "B",
    "explanation": "The return( on line 12 opens a parenthesis that is never closed. The parser expected ')' but found '}' instead, which caused the SyntaxError."
  }
}

## Example 2: Logic Error

Input:
- Language: TypeScript
- File: BrokenLogic.tsx
- Error message: No error message — the app renders one extra undefined item in the list
- Code context:
  8  |  const items = ["Apple", "Banana", "Cherry"];
  9  |  const listItems = [];
  10 |  for (let i = 0; i <= items.length; i++) {
  11 |    listItems.push(<li key={i}>{items[i]}</li>);
  12 |  }

Output:
{
  "category": "Logic Error",
  "location": "line 10, BrokenLogic.tsx",
  "explanation": "There is no crash, but the loop runs one time too many. The condition 'i <= items.length' should be 'i < items.length'. Arrays are zero-indexed, so an array of 3 items has indices 0, 1, 2. When i equals 3, items[3] is undefined, so the list renders an extra empty item.",
  "howToFix": "On line 10, change '<=' to '<': for (let i = 0; i < items.length; i++). This stops the loop before going past the last valid index.",
  "howToPrevent": "Remember: array indices go from 0 to length - 1. Always use '< length' (not '<= length') when looping through arrays.",
  "bestPractices": "Prefer .map() or for...of loops over manual index loops. They handle bounds automatically and eliminate off-by-one bugs.",
  "quiz": {
    "question": "Why does the loop render an extra undefined item?",
    "options": [
      "A) The array is empty",
      "B) The loop starts at index 1 instead of 0",
      "C) The condition '<=' runs one iteration past the last valid index",
      "D) The push() method adds an extra element to the array"
    ],
    "correct": "C",
    "explanation": "'<=' means the loop runs when i equals items.length (3), but the last valid index is 2. items[3] is undefined, so an extra empty <li> is rendered."
  }
}

## Example 3: Runtime Error

Input:
- Language: TypeScript
- File: BrokenRuntime.tsx
- Error message: TypeError: Cannot read properties of undefined (reading 'map')
- Code context:
  5  |  const [data, setData] = useState();
  6  |  useEffect(() => {
  7  |    fetch("/api/items").then(res => res.json()).then(setData);
  8  |  }, []);
  9  |  return (
  10 |    <ul>{data.map(item => <li>{item}</li>)}</ul>
  11 |  );

Output:
{
  "category": "Runtime Error",
  "location": "line 10, BrokenRuntime.tsx",
  "explanation": "The error says 'Cannot read properties of undefined (reading \\"map\\")'. This means you called .map() on something that is undefined. On line 5, useState() is called without a default value, so 'data' starts as undefined. On line 10, the component tries to call data.map() before the fetch on line 7 has finished, and undefined has no .map() method.",
  "howToFix": "Initialize state with an empty array: useState([]). This way data is always an array, even before the fetch completes. You can also add a guard: data?.map() or (data ?? []).map().",
  "howToPrevent": "Always give useState a default value that matches how you use the variable. If you call .map(), initialize with [].",
  "bestPractices": "Use optional chaining (data?.map()) or nullish coalescing ((data ?? []).map()) to guard against undefined values in async data flows.",
  "quiz": {
    "question": "Why does calling .map() on 'data' throw a TypeError?",
    "options": [
      "A) .map() only works on strings, not arrays",
      "B) 'data' is undefined because useState() was called without a default value",
      "C) The fetch failed and returned an error",
      "D) .map() is not a valid JavaScript method"
    ],
    "correct": "B",
    "explanation": "useState() without an argument initializes 'data' as undefined. The component renders before the fetch resolves, and undefined does not have a .map() method, causing the TypeError."
  }
}

## Rules
- Explain for beginners, not experts. Assume the student has never seen this error before.
- Reference the actual code the student wrote, not abstract concepts.
- The error explanation should decode the error message word by word — what does each part mean?
- For logic errors with no error message: describe what the code does wrong and what visible symptom the student would see (e.g., "renders an extra item", "counter shows wrong number").
- Keep explanation under 60 words.
- Keep howToFix actionable and specific — tell the student exactly which line to change and what to change it to.
- Keep howToPrevent and bestPractices each under 30 words.
- Quiz question should test understanding of WHY the error happened, not just what to do about it.
- Quiz distractors should be plausible but clearly wrong to someone who read the explanation.`;

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
  const errorMsg = req.errorMessage.trim() || "No error message — the code runs but produces incorrect results";
  return PHASE1_PROMPT.replace("{{language}}", req.language)
    .replace("{{filename}}", req.filename)
    .replace("{{errorMessage}}", errorMsg)
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

## Examples

### Example 1: Syntax Fix
Input:
- Language: TypeScript
- File: BrokenSyntax.tsx
- Original error: SyntaxError: Unexpected token, expected ","
- Diff:
  - <p>Hello, {name}</p>
  + <p>Hello, {name}</p>)
    </div>
  -
  +  );

Output:
{
  "whatChanged": "Added the missing closing parenthesis \`) \` after the JSX \`<div>\` block to properly close the \`return(\` statement.",
  "whyItFixes": "JavaScript saw \`return(\` but never found the matching \`)\`. Without it, the parser couldn't tell where the return value ended, so it threw a syntax error. Adding \`)\` closes the expression.",
  "keyTakeaway": "Every opening parenthesis \`(\` needs a matching closing \`)\` — especially in JSX return statements where the parentheses span multiple lines."
}

### Example 2: Logic Fix
Input:
- Language: TypeScript
- File: BrokenLogic.tsx
- Original error: List renders an extra empty item at the end
- Diff:
  - for (let i = 0; i <= items.length; i++) {
  + for (let i = 0; i < items.length; i++) {

Output:
{
  "whatChanged": "Changed the loop condition from \`<=\` (less-than-or-equal) to \`<\` (less-than) on the for-loop iterating over \`items\`.",
  "whyItFixes": "Arrays are zero-indexed, so an array with 3 items has indices 0, 1, 2. Using \`<= items.length\` made the loop run with i=3, accessing \`items[3]\` which is undefined. \`< items.length\` stops at the last valid index.",
  "keyTakeaway": "When looping over arrays, use \`i < array.length\`, not \`i <= array.length\` — this is called an off-by-one error."
}

### Example 3: Runtime Fix
Input:
- Language: TypeScript
- File: BrokenRuntime.tsx
- Original error: TypeError: Cannot read properties of undefined (reading 'map')
- Diff:
  - const [data, setData] = useState();
  + const [data, setData] = useState<string[]>([]);
  ...
  - <ul>{data.map(item => <li>{item}</li>)}</ul>
  + <ul>{data?.map(item => <li key={item}>{item}</li>)}</ul>

Output:
{
  "whatChanged": "Initialized \`useState\` with an empty array \`[]\` instead of no value, and added optional chaining \`?.\` before \`.map()\`.",
  "whyItFixes": "Without a default value, \`data\` starts as \`undefined\`. The component renders before \`fetch\` completes, so \`data.map()\` crashes. Initializing with \`[]\` means \`.map()\` runs on an empty array (safe), and \`?.\` adds a safety net.",
  "keyTakeaway": "Always initialize React state with a value that matches how you use it — if you call \`.map()\`, start with \`[]\`, not \`undefined\`."
}

## Input
- Language: {{language}}
- File: {{filename}}
- Original error: {{originalError}}
- Diff (before -> after):
{{diff}}

## Instructions
Analyze this diff and respond in JSON with the fields: whatChanged, whyItFixes, keyTakeaway.

## Rules
- Explain for beginners, not experts
- Reference specific lines from the diff
- Connect the fix back to the original error
- Keep whatChanged under 30 words
- Keep whyItFixes under 50 words
- keyTakeaway should be a single memorable sentence the student will remember`;

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
