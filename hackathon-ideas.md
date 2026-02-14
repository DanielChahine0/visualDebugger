# Hackathon Idea Research — 24-Hour Build

## Team: All Full-Stack Developers

## Themes: Education | Healthcare | Re-engineering

---

# CHOSEN IDEA: FlowFixer — AI Bug Tutor for VS Code

> "Vibe coding makes you fast. FlowFixer makes you fast AND smart."

## The Concept

A VS Code extension for students and developers that turns every AI-assisted bug fix into a learning moment. When a user asks AI to fix code, FlowFixer doesn't just apply the fix — it shows a live visual preview, classifies the bug, explains why it broke, and tracks your personal bug patterns over time.

## The Problem

- "Vibe coding" is the hottest and most controversial trend in dev education — students ship code they don't understand
- AI tools fix bugs silently, creating a dependency loop where developers never learn from their mistakes
- Developers spend ~70% of debugging time reproducing and understanding bugs, not fixing them
- Students accept AI-generated fixes without building mental models of what went wrong

## The Narrative (Pitch Angle)

AI coding tools made students faster but not smarter. Every accepted AI fix is a missed learning opportunity. FlowFixer is the missing feedback loop — every bug you hit becomes a lesson you retain. It's not anti-AI; it's AI that teaches instead of just doing.

**Theme fit: Education** — AI-powered learning tool that turns every bug into a teachable moment.

---

## Core Features (The Full Loop)

| Feature | What It Does | Why It Matters |
|---------|-------------|----------------|
| **AI Fix + Visual Diff** | Shows exactly what changed in the code with highlighted diff | Baseline — user sees the change, not just the result |
| **Live Preview** | Split panel: broken UI on left → fixed UI on right (for web projects) | Makes the fix concrete and visual, not just abstract code |
| **Bug Classification** | Labels the bug type: "CSS Specificity", "Off-by-one", "Null Reference", "Async Race Condition" | Gives students vocabulary for bugs — naming things is half of understanding |
| **"Why It Broke" Explanation** | Plain-English root cause + the underlying concept | e.g., "Array.map returns a new array — you treated it as mutating in place. This is a common mistake with functional array methods." |
| **"Test Yourself" Quiz** | Before revealing the fix, asks "What do you think was wrong?" | Active recall — the most effective learning technique. Turns passive fix-acceptance into engagement |
| **Concept Link** | Connects the bug to a broader concept with a mini-lesson | "Want to learn more? This relates to: Immutability in JavaScript" |
| **Bug Dashboard** | Tracks personal bug patterns over time — heatmap of your weak spots | "You've made 7 CSS layout bugs, 3 async errors, 2 type mismatches this week. Focus area: async/await." |

---

## The Magic Moment (Demo)

1. Open VS Code with a broken React app (button doesn't work, layout is off)
2. Run the app — show the broken UI in the live preview panel
3. Ask AI to "fix this" — FlowFixer intercepts
4. **Instead of silently applying the fix:**
   - A "Test Yourself" prompt appears: "What do you think is wrong with this code?"
   - Student guesses (or skips)
   - The fix is revealed with a visual diff + the live preview updates in real-time showing the UI go from broken → fixed
   - A bug classification card slides in: "Bug Type: CSS Specificity — your class `.btn` was being overridden by a more specific selector `.container .btn`"
   - A "Why It Broke" explanation appears with the concept
5. Switch to the Bug Dashboard tab — show a week of simulated coding data:
   - Heatmap: "Your top bug categories: Layout (7), State Management (4), Async (3)"
   - Trend line showing bugs decreasing over time (you're learning!)
   - "Recommended focus: Async patterns in JavaScript"

**The "wow":** The bug dashboard. Judges see a student's coding weaknesses visualized — it transforms a code fixer into a personal coding coach.

---

## Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| **Extension** | VS Code Extension API (TypeScript) | Native integration, webview panels for UI |
| **Bundler** | esbuild | Industry standard for VS Code extensions, 100x faster than webpack |
| **Live Preview** | VS Code Webview + embedded iframe (DigitalOcean or localhost) | Shows before/after of web app in real-time |
| **Diff Visualization** | `diff` (compute) + `diff2html` (render) | Syntax-highlighted side-by-side diffs out of the box |
| **LLM Pipeline** | Gemini API | Bug classification, explanations, quiz gen. Targets MLH Gemini prize |
| **TTS** | ElevenLabs API | "Read aloud" for explanations. Targets MLH ElevenLabs prize |
| **Bug Dashboard** | Chart.js v4 in VS Code webview panel | Canvas-based, no framework dependency, small bundle |
| **Webview UI** | `@vscode-elements/elements` (Lit-based) | Replaced deprecated webview-ui-toolkit. Native VS Code look-and-feel |
| **State/Storage** | MongoDB Atlas (primary) + VS Code `globalState` (fallback) | Cross-device persistence. Targets MLH MongoDB prize |
| **Demo Hosting** | DigitalOcean App Platform | Production deployment. Targets MLH DigitalOcean prize |
| **Scaffolding** | Yeoman generator (`yo code`) | Fast VS Code extension bootstrap |

---

## MVP Scope (24 Hours)

### BUILD (must have for demo)
- VS Code extension that detects when AI applies a code fix (intercept diff/file change)
- Visual diff panel showing what changed with syntax highlighting
- Live preview panel showing before/after UI state (scoped to web dev — React/HTML/CSS)
- LLM-powered bug classification (5–8 common categories)
- "Why It Broke" explanation with plain-English root cause
- "Test Yourself" quiz prompt before revealing the fix
- Bug Dashboard with heatmap/chart showing patterns from session data
- Pre-seeded demo data showing a realistic week of a student's coding bugs

### SKIP (not needed for demo)
- Support for non-web projects (Python scripts, backend-only code)
- Real persistent storage across sessions (use in-memory + seed data for demo)
- Integration with specific AI tools (Copilot, Cursor, etc.) — simulate the AI fix trigger
- Concept library / mini-lessons (just show the concept name + one-liner)
- Multi-language support
- Settings/configuration UI
- Marketplace publishing

---

## Risks and Mitigations

| Risk | Severity | Mitigation |
|------|----------|-----------|
| VS Code extension dev is fiddly and slow | High | Use `yo code` generator. One person owns extension scaffold full-time for first 4 hours. Test webview early. |
| LLM explanations are generic/unhelpful | Medium | Few-shot prompt with 5–6 hand-crafted examples of great bug explanations. Test and iterate on prompts in hours 2–6. |
| Live preview is hard to get working reliably | Medium | Scope to web dev only. Use a simple embedded iframe pointing to localhost dev server. Have a fallback: screenshot before/after if iframe is flaky. |
| "Test Yourself" quiz feels gimmicky | Low | Make it optional (skip button). Frame it as "active learning mode" in the pitch. Research backs it up (active recall). |
| Demo breaks live on stage | Medium | Pre-plant 3 specific bugs in the demo app that you've tested the full pipeline with. Never go off-script. Pre-record backup video. |
| Bug dashboard looks empty with one session | Low | Pre-seed with a week of realistic simulated data. This is standard hackathon practice. |

---

## 24-Hour Build Timeline

| Phase | Hours | Activity | Owner Suggestion |
|-------|-------|----------|-----------------|
| 0–2 | 2h | Extension scaffold (`yo code`), project architecture, API keys, divide work | All together |
| 2–6 | 4h | **Track A:** Extension core — file change detection, webview panels, diff rendering | Dev 1 + Dev 2 |
| 2–6 | 4h | **Track B:** LLM pipeline — bug classification, explanation gen, quiz gen (test in isolation with sample diffs) | Dev 3 + Dev 4 |
| 6–10 | 4h | Integration: connect LLM pipeline to extension, wire up diff → classify → explain → quiz flow | All together |
| 10–14 | 4h | Live preview panel (iframe-based), Bug Dashboard (Recharts in webview) | Dev 1+2: preview, Dev 3+4: dashboard |
| 14–18 | 4h | End-to-end demo flow: plant bugs in demo app, test full pipeline, fix edge cases | All together |
| 18–21 | 3h | Polish: animations, loading states, error handling, seed dashboard data | Dev 1+2: polish, Dev 3+4: seed data |
| 21–23 | 2h | Demo prep: script the walkthrough, rehearse 3+ times, pre-record backup video | All together |
| 23–24 | 1h | Buffer for fires, final testing, sleep deprivation management | All together |

---

## Prompt Engineering Notes

### Bug Classification Prompt (example)
```
You are a coding education assistant. Given a code diff (before and after a bug fix), your job is to:

1. **Classify** the bug into exactly one category:
   - CSS Layout / Specificity
   - Null / Undefined Reference
   - Off-by-one Error
   - Async / Race Condition
   - State Management
   - Type Mismatch
   - Logic Error
   - Syntax Error

2. **Explain** why the original code was broken in 2-3 sentences. Write for a student learning to code. Use plain English. Reference the specific lines that changed.

3. **Name the concept** — what CS/programming concept does this bug relate to? (e.g., "Immutability", "Event Loop", "CSS Cascade")

4. **Generate a quiz question** — one multiple-choice question that tests whether the student understands WHY the bug occurred (not just WHAT the fix was).

Respond in JSON format:
{
  "category": "...",
  "explanation": "...",
  "concept": "...",
  "quiz": {
    "question": "...",
    "options": ["A) ...", "B) ...", "C) ...", "D) ..."],
    "correct": "B",
    "explanation": "..."
  }
}
```

---

## Why This Wins

1. **Timely narrative** — "anti-vibe-coding" is the conversation happening RIGHT NOW in tech education. Judges will have opinions on this. Your project takes a clear, positive stance.
2. **It's a real product, not a toy** — VS Code extension with persistent bug tracking feels like something students would actually install and use.
3. **The dashboard is the money shot** — showing a visualization of a student's coding weaknesses over time is the moment judges lean forward. It transforms a bug fixer into a learning analytics platform.
4. **Education theme fit is perfect** — every feature maps to pedagogy: active recall (quiz), spaced awareness (dashboard), concept linking (explanations).
5. **Technical depth is real** — VS Code extension API + LLM pipeline + live preview + data visualization. This is not a ChatGPT wrapper.
6. **The demo is self-contained** — you break something, you fix it, you learn from it. The entire loop happens in 2 minutes on one screen.

---

## Comparison: FlowFixer vs Other Top Picks

| | FlowFixer | FormBreaker | DocTranslate |
|---|---|---|---|
| **Theme** | Education | Re-engineering | Healthcare |
| **Demo Impact** | 5 — live bug fix + dashboard | 5 — side-by-side PDF fill | 4 — before/after translation |
| **Feasibility** | 3–4 — VS Code extension is tricky | 5 — pre-select forms | 5 — clean LLM pipeline |
| **Judge Appeal** | 5 — timely, every dev relates | 5 — universal pain | 5 — health equity |
| **Uniqueness** | 5 — nobody else will build this | 3 — civic tech is known | 3 — translation tools exist |
| **Risk** | Medium — extension dev complexity | Low | Low |
| **Ceiling if it works** | Highest — "I want this" reaction | High | High |

---

## Previous Research: All 9 Ideas (Archived)

<details>
<summary>Click to expand full research on all 9 original ideas</summary>

### Education Ideas

#### E1: GradeGhost (Safe and Polished)
- **One-liner:** AI grading co-pilot that takes a teacher's rubric and a stack of student essays, then produces draft feedback and scores that the teacher reviews and approves in a streamlined UI — cutting grading time by 80%.
- **The Pain:** High school teachers grade 120–180 essays per assignment at 8–12 min each = 16–36 hours per cycle. #1 contributor to burnout (NEA). Students get shallow feedback ("Good job") because teachers are overwhelmed.
- **The Magic Moment:** Split screen. Teacher uploads a rubric photo + 5 essays. System processes in ~30 sec. Grading queue appears — click Student 1, see highlighted passages, rubric criteria with suggested scores (e.g., "Thesis Clarity: 4/5"), and a draft feedback paragraph. Teacher tweaks one score, edits one sentence, hits "Approve." 90 seconds vs 10 minutes. Export to CSV + feedback PDFs.
- **Tech Stack:** Next.js 14 + shadcn/ui + Tailwind, Claude API, GPT-4o Vision, Mammoth.js, pdf.js, Supabase, jsPDF + PapaParse, Vercel

#### E2: RewindEd (Ambitious and Impressive)
- **One-liner:** Records a lecture, then auto-generates a personalized, interactive "replay" for each student — highlighting parts they need to re-hear based on knowledge gaps, with inline micro-quizzes.
- **The Pain:** Lecture recordings are the #1 study resource but the worst format for learning. Passive re-watching is no better than not reviewing at all.
- **Tech Stack:** Next.js 14, Video.js, OpenAI Whisper, Gemini 1.5 Flash, ChromaDB, Supabase, Vercel + Railway

#### E3: SyllabusNegotiator (Creative Wildcard)
- **One-liner:** Students collaboratively negotiate their course syllabus with their professor by proposing, debating, and voting on topics and assessments — AI synthesizes into a class-authored syllabus.
- **The Pain:** Student agency predicts engagement, yet syllabi are unilateral. Negotiated syllabi → 23% higher satisfaction but logistics are nightmarish.
- **Tech Stack:** Next.js 14, Socket.io/Supabase Realtime, Claude API, Recharts, React-PDF, Supabase, Vercel

### Healthcare Ideas

#### H1: DocTranslate (Safe and Polished)
- **One-liner:** Takes medical discharge instructions and re-renders at 5th-grade reading level in patient's preferred language, with visual aids and read-aloud.
- **The Pain:** 88 million US adults have limited health literacy. Poor comprehension → 30% higher readmission.
- **Tech Stack:** Next.js 14, Claude/GPT-4o, RxNorm, openFDA, ElevenLabs, Synthea, Vercel

#### H2: ChartWhisperer (Ambitious and Impressive)
- **One-liner:** Ambient AI scribe that generates SOAP notes in real-time from doctor-patient conversations with inline citations.
- **The Pain:** Physicians spend 1h50m on documentation per 1h of patient care. #1 burnout driver.
- **Tech Stack:** Next.js 14, Vercel AI SDK, Whisper, Claude/GPT-4o, LangChain + Chroma, RxNorm + openFDA, Supabase

#### H3: KinLoop (Creative and High-Impact)
- **One-liner:** Family caregiver coordination: discharge docs → shared task boards, medication cards, AI early warning from daily check-ins.
- **The Pain:** 53 million unpaid family caregivers. Care plans scattered across portals and group texts.
- **Tech Stack:** Next.js 14, @hello-pangea/dnd, Claude API, openFDA + RxNorm, Supabase, Recharts, Resend, Vercel

### Re-engineering Ideas

#### R1: FormBreaker (Safe and Polished)
- **One-liner:** Upload bureaucratic PDF → conversational wizard fills it out with live side-by-side PDF population.
- **The Pain:** 6.5 billion hours/year on federal tax compliance. Forms use jargon and conditional logic.
- **Tech Stack:** Next.js 14, pdf.js, PyMuPDF, Marker, GPT-4o/Claude, pdf-lib, Vercel + Railway

#### R2: DeadCode Detective (Balanced)
- **One-liner:** GitHub URL → interactive codebase autopsy with dead code map, tribal knowledge recovery, modernization roadmap.
- **The Pain:** 42% of dev time on maintenance/tech debt. 25–30% dead code in mature codebases.
- **Tech Stack:** Next.js, React Flow, Tree-sitter, simple-git, Claude/GPT-4o, FastAPI, Recharts, Vercel + Railway

#### R3: Re:Flow (Ambitious)
- **One-liner:** Record a repetitive workflow → AI reverse-engineers into editable, executable automation.
- **The Pain:** 58% of workday on "work about work." RPA tools cost $420+/month, 50% fail in year one.
- **Tech Stack:** Next.js, React Flow, Chrome Extension, GPT-4o/Claude, PyMuPDF, Slack webhook, Vercel

### Original Comparison Table

| Idea | Demo Impact | Feasibility | Judge Appeal | Data Access | Uniqueness | TOTAL |
|------|:----------:|:----------:|:-----------:|:----------:|:----------:|:-----:|
| E1 GradeGhost | 4 | 5 | 4 | 5 | 3 | 21 |
| E2 RewindEd | 5 | 3 | 4 | 4 | 5 | 21 |
| E3 SyllabusNegotiator | 4 | 4 | 4 | 5 | 5 | 22 |
| H1 DocTranslate | 4 | 5 | 5 | 5 | 3 | 22 |
| H2 ChartWhisperer | 5 | 3 | 5 | 4 | 3 | 20 |
| H3 KinLoop | 4 | 3 | 5 | 4 | 4 | 20 |
| R1 FormBreaker | 5 | 5 | 5 | 5 | 3 | 23 |
| R2 DeadCode Detective | 5 | 3 | 4 | 5 | 4 | 21 |
| R3 Re:Flow | 5 | 2 | 5 | 3 | 5 | 20 |

</details>

---

## Key Principles

1. **Demo-driven development** — build the demo flow first. Everything the judge won't see doesn't exist.
2. **Prompt engineering is your ML** — well-crafted prompts with structured output (JSON mode) get you 90% there.
3. **Seed data is not cheating** — pre-populate with realistic data. Every winning team does this.
4. **One "wow" moment** — the Bug Dashboard is yours. Practice hitting it cleanly.
5. **Deploy early** — have the extension installable from VSIX by hour 14. Nothing kills a demo like "it works on my machine."
