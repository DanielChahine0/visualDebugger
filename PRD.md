# FlowFixer — Product Requirements Document

> **Project:** FlowFixer — AI Bug Tutor for VS Code
> **Theme:** Education
> **Event:** 24-Hour Hackathon (CHD)
> **Team Size:** 3 Engineers (Full Stack)
> **Last Updated:** 2026-02-13

---

## 1. Problem Statement

When students and junior developers compile or run their code and hit an error, they're met with a wall of cryptic error messages they don't understand. They can't read stack traces. They don't know what "TypeError: Cannot read properties of undefined" actually means. So they copy-paste the error into an AI tool, accept the fix, and move on — without ever understanding what went wrong.

**The result:** Students never learn to read error messages. They never build debugging intuition. They can't distinguish a syntax error from a logic error from a runtime crash. They become dependent on AI to fix problems they should be able to diagnose themselves.

---

## 2. Solution

A VS Code extension with a **two-phase learning loop** that activates when a student hits an error:

### Phase 1 — Error Explanation (before the fix)
When the student compiles/runs code and gets an error:
- **Locates** exactly where the bug is in their code
- **Explains** what the error message means in plain English
- **Teaches** how to fix it and how to prevent it in the future
- **Shows** best practices related to this type of bug

### Phase 2 — AI Fix Review (after the fix)
When the student prompts an AI tool (Copilot, Cursor, ChatGPT) to fix the code:
- **Shows a visual diff** of what the AI changed (green = added, red = removed)
- **Explains** what the AI did and why that fixes the problem
- **Reinforces** the lesson from Phase 1

### Three Bug Categories
| Category | What It Covers | Example |
|----------|---------------|---------|
| **Syntax Error** | Code that can't be parsed — missing brackets, typos, malformed expressions | `SyntaxError: Unexpected token '}'` |
| **Logic Error** | Code that runs but produces wrong results — wrong operators, bad conditions, off-by-one | Counter shows wrong number, condition never triggers |
| **Runtime Error** | Code that crashes during execution — null refs, type errors, missing imports | `TypeError: Cannot read properties of undefined` |

---

## 3. Target Users

| User | Context | Need |
|------|---------|------|
| **CS students** (bootcamp / university) | Learning to code, using AI assistants daily | Understand error messages and bugs, not just fix them |
| **Junior developers** | First job, can't read stack traces | Build debugging intuition, learn to self-diagnose |
| **Self-taught devs** | Learning from YouTube / tutorials + AI | Understand the difference between bug types |

**Scope for hackathon:** Web developers working with HTML/CSS/JavaScript/TypeScript/React.

---

## 4. Features

### P0 — Must Ship (Demo-Critical)

| ID | Feature | Description | Acceptance Criteria |
|----|---------|-------------|-------------------|
| F1 | **Extension Shell** | VS Code extension that activates on web projects, registers commands, and hosts webview panels | Extension installs from VSIX, activates on JS/TS files, opens side panel |
| F2 | **Error Interception** | Detects compiler/runtime errors from the terminal or diagnostics API and captures the error output | Catches errors from terminal output and VS Code diagnostics, extracts error message + file + line |
| F3 | **Error Explanation Panel** | Webview panel that explains the error: where the bug is, what it means, how to fix it, how to prevent it, best practices | Panel shows error location, plain-English explanation, fix suggestion, prevention tips, and best practices — all readable by a beginner |
| F4 | **Bug Classification** | LLM classifies the error into one of 3 categories (Syntax, Logic, Runtime) | Returns JSON with category, explanation, fix guidance, prevention tips, and best practices — under 5 seconds |
| F5 | **Diff Detection** | Detects when a file changes after the user prompts an AI tool to fix the code, captures before/after state | Captures old content vs new content on file save, produces a structured diff |
| F6 | **Visual Diff Panel** | Webview panel showing syntax-highlighted diff of what the AI changed | Diff renders with color-coded additions (green) and deletions (red), syntax highlighted, with explanation of what the AI did |
| F7 | **Demo App** | A small React app with 3 pre-planted bugs (one per category) for the live demo | Each bug is triggerable, produces a clear error, and is fixable by AI with a visible diff |

### P1 — Should Ship (Strengthens Demo)

| ID | Feature | Description | Acceptance Criteria |
|----|---------|-------------|-------------------|
| F8 | **Bug Dashboard** | Webview panel showing bug history — category breakdown, trend over time | Bar chart of bug categories, line chart of bugs over sessions, "focus area" recommendation |
| F9 | **"Test Yourself" Quiz** | After showing the error explanation, prompts user with a multiple-choice question to test understanding | Quiz renders in webview, user selects answer, gets feedback (correct/incorrect + why) |
| F10 | **TTS Read-Aloud** | ElevenLabs-powered "read aloud" button on explanation cards | Clicking button plays natural TTS of the explanation. Accessible for visual learners |
| F11 | **Seed Data** | Pre-populated bug history for demo (simulating a week of student coding) | Dashboard shows realistic data: 15–20 bugs across categories with timestamps |

### P2 — Nice to Have (Polish)

| ID | Feature | Description |
|----|---------|-------------|
| F12 | **Animations** | Smooth transitions when panels open, explanation cards slide in |
| F13 | **Live Preview Panel** | Embedded iframe showing the running app — updates on file change |
| F14 | **Export Report** | "Download your bug report" as PDF/PNG from the dashboard |
| F15 | **Streaks/Gamification** | "You've gone 5 compiles without a syntax error!" encouragement messages |

---

## 5. User Stories

### Phase 1 — Error Explanation
```
AS A student who just hit a compile/runtime error,
WHEN I see a confusing error message I don't understand,
I WANT FlowFixer to explain where the bug is, what the error means,
  how to fix it, and how to prevent it in the future,
SO THAT I learn to read and understand error messages on my own.
```

### Phase 2 — AI Fix Review
```
AS A student who just asked AI to fix my code,
WHEN the AI changes my file,
I WANT to see exactly what the AI changed (red/green diff)
  and an explanation of what it did and why,
SO THAT I understand the fix instead of blindly accepting it.
```

### Dashboard Flow
```
AS A student reviewing my progress,
WHEN I open the Bug Dashboard,
I WANT to see my bug patterns over time (syntax vs logic vs runtime),
SO THAT I know which type of bugs I struggle with most.
```

---

## 6. Technical Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                     VS Code Extension                         │
│                                                               │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────────────┐ │
│  │   Error      │  │  File        │  │   Webview Host      │ │
│  │   Listener   │  │  Watcher     │  │   (Panels)          │ │
│  └──────┬──────┘  └──────┬───────┘  └─────────────────────┘ │
│         │                │            │      │      │        │
│  Phase 1: Error    Phase 2: Diff     │      │      │        │
│  detected          detected          │      │      │        │
│         │                │           ┌▼──┐ ┌▼───┐ ┌▼──────┐ │
│         ▼                ▼           │Err│ │Diff│ │Dash-  │ │
│  ┌──────────────────────────┐       │or │ │View│ │board  │ │
│  │   Extension Host (TS)    │       │Pan│ │    │ │       │ │
│  │                          │       │el │ │    │ │       │ │
│  │  - listenForErrors()     │       └───┘ └────┘ └───────┘ │
│  │  - captureOldState()     │                               │
│  │  - computeDiff()         │                               │
│  │  - callGemini()          │                               │
│  │  - updateDashboard()     │                               │
│  └───────────┬──────────────┘                               │
│              │                                               │
└──────────────┼───────────────────────────────────────────────┘
               │
               ▼
    ┌─────────────────┐     ┌─────────────────┐
    │   Gemini API    │     │  MongoDB Atlas   │
    │   (Primary LLM) │     │  (Bug History)   │
    │                 │     │                 │
    │  Phase 1:       │     │  - category     │
    │  error → explain│     │  - timestamps   │
    │                 │     │  - explanations │
    │  Phase 2:       │     │  - fix diffs    │
    │  diff → explain │     └─────────────────┘
    └─────────────────┘
                            ┌─────────────────┐
                            │  ElevenLabs     │
                            │  (TTS - P1)     │
                            │  Input: text    │
                            │  Output: audio  │
                            └─────────────────┘
```

### Key Technical Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Extension type | VS Code Webview Extension | Need rich UI panels (error explanation, diff, dashboard) — webviews are the only way |
| Error detection | VS Code Diagnostics API + Terminal output parsing | Diagnostics API catches linter/compiler errors; terminal parsing catches runtime crashes |
| Bundler | **esbuild** | Industry standard for VS Code extensions. 100x faster than webpack, builds extension host + webview in parallel |
| Diff computation | **`diff`** npm library + **`diff2html`** for rendering | `diff` computes diffs, `diff2html` renders syntax-highlighted side-by-side/inline diffs out of the box |
| LLM provider | **Gemini API** (primary), Claude API (fallback) | Targets MLH "Best Use of Gemini API" prize. Gemini handles structured JSON output well |
| Dashboard rendering | **Chart.js v4** in webview | Canvas-based, no framework dependency, small bundle, proven in VS Code webviews |
| Webview framework | **`@vscode-elements/elements`** (Lit-based) | Replaced deprecated `@vscode/webview-ui-toolkit`. ~5kb, native VS Code look-and-feel, used by GitLens |
| State storage | **MongoDB Atlas** (primary) + VS Code `globalState` (offline fallback) | Targets MLH "Best Use of MongoDB Atlas" prize. Enables cross-device persistence and richer querying |
| Secrets | **`context.secrets`** API | Encrypted storage for API keys (Gemini, MongoDB, ElevenLabs) |
| TTS | **ElevenLabs API** (P1) | "Read aloud" for bug explanations. Targets MLH "Best Use of ElevenLabs" prize. Accessibility angle |
| Demo app hosting | **DigitalOcean App Platform** | Targets MLH "Best Use of DigitalOcean" prize. Shows production-ready deployment |
| Scaffolding | **`yo code`** (Yeoman) | Still the official standard, no real competitor |

---

## 7. Core Flows (Detailed)

### Phase 1: Error → Explanation

```
1. Student runs/compiles code
2. Error occurs (terminal output or VS Code diagnostic)
3. Extension captures:
   - Error message (e.g., "TypeError: Cannot read properties of undefined (reading 'map')")
   - File path + line number
   - Surrounding code context (±10 lines around the error)
4. Extension sends to Gemini API:
   - Error message + code context
   - Prompt: "Classify this bug (syntax/logic/runtime), explain it for a beginner"
5. Gemini returns JSON:
   - category: "Runtime Error"
   - location: "line 15, App.tsx"
   - explanation: "You're trying to call .map() on a variable that is undefined..."
   - howToFix: "Check that 'data' is defined before calling .map() on it..."
   - howToPrevent: "Always initialize state with a default value..."
   - bestPractices: "Use optional chaining (data?.map) or provide a fallback..."
6. Error Explanation Panel opens with all info
```

### Phase 2: AI Fix → Diff Review

```
1. Student prompts AI tool (Copilot/Cursor/ChatGPT) to fix the bug
2. AI modifies the file
3. Extension detects file change (onWillSave captures before, onDidSave captures after)
4. Extension computes diff (before vs after)
5. Extension sends diff to Gemini API:
   - Prompt: "Explain what this AI fix changed and why it fixes the problem"
6. Gemini returns JSON:
   - whatChanged: "Added a null check on line 15 before calling .map()"
   - whyItFixes: "The original code assumed 'data' was always an array, but..."
7. Diff Panel opens:
   - Red highlighted: removed/changed code
   - Green highlighted: new code
   - Explanation card: what the AI did and why
```

---

## 8. Team Roles & Responsibilities

### Engineer 1: "Extension Lead" — owns the VS Code extension infrastructure

**Focus:** Extension scaffold, error listening, file watching, diff engine, webview hosting, inter-panel communication.

| Task | Priority | Hours | Dependencies |
|------|----------|-------|-------------|
| T1: Scaffold extension with `yo code` (TypeScript) + esbuild | P0 | 1h | None |
| T2: Implement error listener (Diagnostics API + terminal output parsing) | P0 | 2h | T1 |
| T3: Implement file watcher (onWillSave/onDidSave) for diff detection | P0 | 1.5h | T1 |
| T4: Create webview panel host infrastructure (register panels: error, diff, dashboard) | P0 | 2h | T1 |
| T5: Build message passing between extension host ↔ webviews (postMessage protocol) | P0 | 1.5h | T4 |
| T6: Wire Phase 1 flow: error detected → Gemini → populate error panel | P0 | 2h | T2, T5, T17 |
| T7: Wire Phase 2 flow: file change → diff → Gemini → populate diff panel | P0 | 2h | T3, T5, T17 |
| T8: MongoDB Atlas integration for storing bug history | P1 | 1.5h | T6 |
| T9: Polish extension activation, commands, status bar indicator | P2 | 1h | T7 |
| **Total** | | **~14.5h** | |

### Engineer 2: "UI/Webview Lead" — owns all webview panels and visual polish

**Focus:** Error explanation panel, diff view, dashboard view, all HTML/CSS/JS inside webviews, animations.

| Task | Priority | Hours | Dependencies |
|------|----------|-------|-------------|
| T10: Design and build Error Explanation Panel (location, explanation, fix, prevention, best practices) | P0 | 3h | T5 (message protocol ready) |
| T11: Design and build Diff Panel (diff2html side-by-side + AI explanation card) | P0 | 3h | T5 |
| T12: Build Bug Dashboard webview (bar chart of 3 categories, trend line, focus recommendation) | P1 | 2.5h | T5 |
| T13: Build Quiz component inside Error Explanation Panel | P1 | 2h | T10 |
| T14: ElevenLabs TTS integration — "read aloud" button on explanation cards | P1 | 1.5h | T10 |
| T15: Create seed data module (15–20 realistic bug entries for dashboard demo) | P1 | 1h | T12 |
| T16: CSS polish — consistent color scheme, dark theme compatible, smooth transitions | P2 | 2h | T10, T11, T12 |
| **Total** | | **~15h** | |

### Engineer 3: "LLM + Demo Lead" — owns prompt engineering, demo app, and presentation

**Focus:** LLM prompt crafting, error explanation quality, demo React app with planted bugs, demo script, backup recording.

| Task | Priority | Hours | Dependencies |
|------|----------|-------|-------------|
| T17: Set up Gemini API integration module (SDK, request/response types, error handling, Claude fallback) | P0 | 2h | None |
| T18: Write and test Phase 1 prompt — error explanation (few-shot, structured JSON output) | P0 | 2.5h | T17 |
| T19: Write and test Phase 2 prompt — diff explanation (few-shot, structured JSON output) | P0 | 2h | T17 |
| T20: Build demo React app (simple UI — counter, data loader, form) | P0 | 2h | None |
| T21: Plant 3 bugs in demo app (1 syntax, 1 logic, 1 runtime) that produce clear errors | P0 | 1.5h | T20 |
| T22: Test full end-to-end flow: error → explanation → AI fix → diff review | P0 | 2h | T6, T7, T10, T11, T18, T19, T21 |
| T23: Deploy demo app to DigitalOcean App Platform | P1 | 1h | T20 |
| T24: Write demo script (minute-by-minute walkthrough for judges) | P0 | 1h | T22 |
| T25: Record backup demo video | P1 | 1h | T22 |
| T26: Prepare pitch deck / talking points (problem, solution, demo, impact) | P0 | 1.5h | T24 |
| T27: Rehearse demo 3+ times with full team | P0 | 1h | T26 |
| **Total** | | **~17.5h** | |

---

## 9. Task Dependency Graph

```
Hour 0─2: SETUP (all together)
├── T1:  Scaffold extension + esbuild ─────────────┐
├── T17: Set up Gemini API module                   │
├── T20: Build demo React app                       │
│                                                    │
Hour 2─6: PARALLEL TRACKS                           │
│                                                    │
│  Track A (Eng 1):                                  │
│  T2 (error listener) ────────────┐               │
│  T3 (file watcher) ──────────────┤               │
│                                   │               │
│  Track B (Eng 1 + Eng 2):       │               │
│  T4 → T5 (panels + messaging) ──┤               │
│                                   │               │
│  Track C (Eng 2):               │               │
│  T10 (error explanation panel) ──┤               │
│  T11 (diff panel) ──────────────┤               │
│                                   │               │
│  Track D (Eng 3):               │               │
│  T18 (Phase 1 prompt) ──────────┤               │
│  T19 (Phase 2 prompt) ──────────┤               │
│  T21 (plant bugs) ──────────────┤               │
│                                   │               │
Hour 6─10: INTEGRATION                             │
│  T6:  Wire Phase 1 flow (Eng 1) ◄──┘             │
│  T7:  Wire Phase 2 flow (Eng 1)                   │
│  T12: Dashboard (Eng 2)                           │
│  T13: Quiz component (Eng 2)                      │
│                                                    │
Hour 10─14: FEATURES + TESTING                      │
│  T8:  MongoDB integration (Eng 1)                 │
│  T14: ElevenLabs TTS (Eng 2)                      │
│  T15: Seed data (Eng 2)                            │
│  T22: End-to-end testing (Eng 3)                  │
│  T23: DigitalOcean deploy (Eng 3)                 │
│                                                    │
Hour 14─18: POLISH + DEMO PREP                      │
│  T9:  Extension polish (Eng 1)                    │
│  T16: CSS polish (Eng 2)                           │
│  T24: Demo script (Eng 3)                          │
│  T25: Backup video (Eng 3)                         │
│                                                    │
Hour 18─21: FINAL POLISH                             │
│  Bug fixes, edge cases (All)                       │
│  T26: Pitch prep (Eng 3)                           │
│                                                    │
Hour 21─24: REHEARSE + SUBMIT                        │
│  T27: Rehearse 3x (All)                            │
│  Final testing, submit                             │
```

---

## 10. Demo Script (2 Minutes)

| Time | Action | What Judges See |
|------|--------|----------------|
| 0:00–0:15 | **Pitch the problem** | "Students hit errors they can't read, paste them into AI, accept the fix, and learn nothing. FlowFixer changes that." |
| 0:15–0:30 | **Show the broken app** | React app running. Student clicks a button — app crashes. Terminal shows: `TypeError: Cannot read properties of undefined (reading 'map')` |
| 0:30–0:50 | **Phase 1: FlowFixer explains the error** | Error Explanation Panel opens automatically. Shows: bug location (line 15), category badge [Runtime Error], plain-English explanation, "How to fix it", "How to prevent it", best practices. Student now UNDERSTANDS the bug. |
| 0:50–1:10 | **Student asks AI to fix it** | Student prompts Copilot/Cursor: "fix this error". AI modifies the file. |
| 1:10–1:30 | **Phase 2: FlowFixer shows what AI changed** | Diff Panel opens. Red = removed code, Green = new code. Explanation card: "The AI added a null check before calling .map() and initialized the state with an empty array." Student now understands the fix. |
| 1:30–1:45 | **Show the dashboard** | Bug Dashboard with seeded week of data. Bar chart: Runtime (8), Logic (5), Syntax (3). "Focus area: Runtime errors — practice null checking and defensive programming." |
| 1:45–2:00 | **Close with impact** | "FlowFixer turns every error into a lesson and every AI fix into a teachable moment. Vibe coding makes you fast. FlowFixer makes you fast AND smart." |

---

## 11. Bug Categories (Classification Taxonomy)

| Category | What It Covers | Example Error | Concept Link |
|----------|---------------|---------------|-------------|
| **Syntax Error** | Code that can't be parsed — missing brackets, typos, malformed expressions, invalid JSX | `SyntaxError: Unexpected token '}'` | Syntax fundamentals, language grammar |
| **Logic Error** | Code that runs without crashing but produces wrong results — wrong operators, bad conditions, off-by-one, wrong return values | Button does nothing, counter shows wrong number | Boolean logic, control flow, boundary conditions |
| **Runtime Error** | Code that compiles but crashes during execution — null/undefined references, type errors, missing imports, async issues | `TypeError: Cannot read properties of undefined` | Defensive programming, error handling, type safety |

---

## 12. Planted Demo Bugs

| # | Bug | Category | Error Output | The Fix |
|---|-----|----------|-------------|---------|
| 1 | Missing closing parenthesis in JSX return statement | **Syntax** | `SyntaxError: Unexpected token, expected ","` | Add the missing `)` to close the return statement |
| 2 | `<=` instead of `<` in loop condition, rendering one extra undefined item | **Logic** | No crash — but app renders an extra empty/broken item in the list | Change `<=` to `<` in the loop condition |
| 3 | Calling `.map()` on state that is `undefined` before fetch resolves | **Runtime** | `TypeError: Cannot read properties of undefined (reading 'map')` | Initialize state as `[]` and/or add null check before `.map()` |

---

## 13. Risk Register

| # | Risk | Likelihood | Impact | Mitigation | Owner |
|---|------|-----------|--------|-----------|-------|
| R1 | VS Code webview takes too long to set up | Medium | High | Start with `yo code` template. Eng 1 owns this exclusively for first 4h. Test webview "hello world" in first 30 min. | Eng 1 |
| R2 | LLM returns inconsistent/bad JSON | Medium | High | Use Gemini with structured output mode. Add JSON schema validation. Have 3 fallback hardcoded responses for demo bugs. | Eng 3 |
| R3 | Error interception misses errors or catches noise | Medium | Medium | Use VS Code Diagnostics API as primary source (reliable). Terminal parsing as secondary. Test with planted bugs early. | Eng 1 |
| R4 | Diff detection misses AI changes or fires on manual saves | Medium | Medium | Track "error active" state — only show diff panel if an error was recently explained. Use `onWillSave` + `onDidSave` pair. | Eng 1 |
| R5 | Demo breaks on stage | Medium | Critical | Pre-plant bugs tested 10+ times. Pre-record backup video. Script every click. | Eng 3 |
| R6 | Run out of time on P1 features | Medium | Low | P0 features alone make a complete demo. Dashboard, quiz, and TTS are enhancement, not core. | All |
| R7 | LLM API rate limits or downtime | Low | Critical | Cache Gemini responses for demo bugs locally. If API is down, fall back to Claude API, then serve cached responses. | Eng 3 |
| R8 | Team burnout / coordination breakdown | Medium | Medium | Mandatory break at hour 12 (30 min). Sync standups at hours 6, 10, 14, 18. Clear ownership per task. | All |
| R9 | MongoDB Atlas connection issues during demo | Low | Medium | Fall back to VS Code globalState for offline storage. Seed data works either way. | Eng 1 |
| R10 | ElevenLabs TTS adds latency to demo | Low | Low | TTS is P1 and optional. Pre-cache audio for demo bugs. Skip button always available. | Eng 2 |

---

## 14. Definition of Done

### Minimum Viable Demo (must hit all):
- [ ] Extension installs from VSIX on a clean VS Code instance
- [ ] Running code with a bug triggers the Error Explanation Panel (Phase 1)
- [ ] Error Explanation Panel shows: location, category, explanation, how to fix, how to prevent, best practices
- [ ] After an AI fix, the Diff Panel shows syntax-highlighted red/green diff with explanation (Phase 2)
- [ ] LLM correctly classifies and explains all 3 demo bugs (syntax, logic, runtime)
- [ ] Full two-phase demo flow runs end-to-end without errors 3 consecutive times

### Stretch Goals:
- [ ] Bug Dashboard displays seeded data with category chart + trend line
- [ ] Quiz component tests understanding after error explanation
- [ ] ElevenLabs TTS reads explanation aloud
- [ ] Demo app deployed on DigitalOcean
- [ ] Bug history persisted in MongoDB Atlas

---

## 15. Communication Plan

| When | What | Format |
|------|------|--------|
| Hour 0 | Kick-off: confirm roles, set up repo, API keys | All together, in-person |
| Hour 6 | Standup: Track A/B/C/D status, blockers | 5-min standup |
| Hour 10 | Integration check: can Phase 1 + Phase 2 flows work end-to-end? | All together, pair on issues |
| Hour 14 | Demo dry-run #1: test the full two-phase flow | All together |
| Hour 18 | Demo dry-run #2: time it, polish script | All together |
| Hour 21 | Final rehearsal: full pitch + demo, no stops | All together |
| Ongoing | Blockers | Shout immediately, don't wait for standup |

---

## 16. Repository Structure

```
flowfixer/
├── extension/                    # VS Code extension (TypeScript)
│   ├── src/
│   │   ├── extension.ts          # Entry point, activation, command registration
│   │   ├── errorListener.ts      # Error interception (Diagnostics API + terminal parsing)
│   │   ├── diffEngine.ts         # File watching, before/after capture, diff computation
│   │   ├── llmClient.ts          # Gemini API calls, JSON parsing, caching (Claude fallback)
│   │   ├── ttsClient.ts          # ElevenLabs TTS API integration
│   │   ├── storage.ts            # MongoDB Atlas client + globalState fallback
│   │   ├── panels/
│   │   │   ├── ErrorPanel.ts     # Error Explanation webview panel provider
│   │   │   ├── DiffPanel.ts      # Diff Review webview panel provider
│   │   │   └── DashboardPanel.ts # Dashboard webview panel provider
│   │   ├── webview/
│   │   │   ├── error.html        # Error Explanation panel (Phase 1 UI)
│   │   │   ├── diff.html         # Diff Review panel (Phase 2 UI, diff2html)
│   │   │   ├── dashboard.html    # Dashboard panel (Chart.js v4)
│   │   │   └── styles.css        # Shared webview styles (@vscode-elements)
│   │   ├── seedData.ts           # Pre-loaded demo bug history
│   │   └── types.ts              # Shared TypeScript interfaces
│   ├── esbuild.js                # Build script (extension + webview targets)
│   ├── package.json              # Extension manifest (contributes, activationEvents)
│   └── tsconfig.json
│
├── demo-app/                     # React app with planted bugs
│   ├── src/
│   │   ├── App.tsx
│   │   ├── components/
│   │   │   ├── BrokenSyntax.tsx  # Bug: missing closing parenthesis
│   │   │   ├── BrokenLogic.tsx   # Bug: off-by-one in loop condition
│   │   │   └── BrokenRuntime.tsx # Bug: .map() on undefined state
│   │   └── styles.css
│   ├── package.json
│   └── vite.config.ts
│
├── docs/
│   ├── demo-script.md            # Minute-by-minute demo walkthrough
│   └── pitch-notes.md            # Talking points for presentation
│
└── README.md
```

---

## 17. Target Prizes

### Primary Targets (no extra code needed)
| Prize | Strategy |
|-------|----------|
| **Best Overall Hack** | Build it well — ambitious, technical, great narrative |
| **Best UI & UX Designed Hack** | Polish webview panels, smooth transitions, dark theme compat |
| **Best Community Impact Hack** | Emphasize education narrative — every error becomes a lesson |

### Sponsor Prize Targets (integrated into tech stack)
| Prize | Integration | Effort |
|-------|-------------|--------|
| **MLH Best Use of Gemini API** | Gemini as primary LLM for both Phase 1 + Phase 2 | Core (already in stack) |
| **MLH Best Use of MongoDB Atlas** | Atlas for bug history persistence | ~2h |
| **MLH Best Use of ElevenLabs** | TTS "read aloud" on explanation cards | ~1-2h (P1) |
| **MLH Best Use of DigitalOcean** | Deploy demo app on App Platform | ~1h |

### Not Targeting
| Prize | Reason |
|-------|--------|
| Best Use of Solana | No blockchain angle |
| Best Use of Snowflake API | Data warehouse doesn't fit |
| Most Useless Hack | FlowFixer is useful |

---

## 18. API Keys & Accounts Needed

| Service | What For | Setup Time | Who |
|---------|---------|-----------|-----|
| **Google (Gemini API)** | Primary LLM for error explanation + diff explanation | 5 min | Eng 3 |
| **Anthropic (Claude API)** — fallback | Backup LLM | 5 min | Eng 3 |
| **MongoDB Atlas** | Bug history database (free tier) | 10 min | Eng 1 |
| **ElevenLabs** | TTS for explanation read-aloud | 5 min | Eng 2 |
| **DigitalOcean** | Demo app hosting ($200 free credits) | 10 min | Eng 1 |
| **GitHub** | Repo hosting | Already have | Eng 1 |
| **Node.js 18+** | Extension + demo app runtime | Already installed | All |
| **VS Code** | Development + demo | Already installed | All |

---

## Appendix: Prompt Templates

### Phase 1 — Error Explanation Prompt

```
You are a coding education assistant. A student just hit an error they don't understand. Your job is to explain it clearly so they can learn from it.

## Input
- Language: {{language}}
- File: {{filename}}
- Error message: {{errorMessage}}
- Code context (lines around the error):
{{codeContext}}

## Instructions
Analyze this error and respond in JSON:

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
    "correct": "B",
    "explanation": "Why the correct answer is right"
  }
}

## Rules
- Explain for beginners, not experts
- Reference the actual code, not abstract concepts
- The error explanation should decode the error message — what does each part mean?
- Keep explanation under 60 words
- Keep howToFix actionable and specific
```

### Phase 2 — AI Fix Explanation Prompt

```
You are a coding education assistant. A student had a bug, and an AI tool just fixed it. Your job is to explain what the AI changed and why.

## Input
- Language: {{language}}
- File: {{filename}}
- Original error: {{originalError}}
- Diff (before → after):
{{diff}}

## Instructions
Analyze this diff and respond in JSON:

{
  "whatChanged": "1-2 sentences describing exactly what the AI modified in the code",
  "whyItFixes": "2-3 sentences explaining WHY these changes fix the original error. Connect it back to the root cause.",
  "keyTakeaway": "One sentence the student should remember from this fix"
}

## Rules
- Explain for beginners, not experts
- Reference specific lines from the diff
- Connect the fix back to the original error
- Keep whatChanged under 30 words
- Keep whyItFixes under 50 words
```
