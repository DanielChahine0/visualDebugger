# FlowFixer — Product Requirements Document

> **Project:** FlowFixer — AI Bug Tutor for VS Code
> **Theme:** Education
> **Event:** 24-Hour Hackathon (CHD)
> **Team Size:** 3 Engineers (Full Stack)
> **Last Updated:** 2026-02-13

---

## 1. Problem Statement

"Vibe coding" has created a generation of developers who ship code they don't understand. AI tools like Copilot and Cursor fix bugs silently — the developer clicks "accept" and moves on without learning what went wrong or why. There is no feedback loop between fixing a bug and understanding it.

**The result:** Students and junior devs build speed but not skill. They hit the same bugs repeatedly. They can't debug without AI. They have no vocabulary for the mistakes they make.

---

## 2. Solution

A VS Code extension that intercepts AI-assisted bug fixes and turns each one into a micro-learning moment:
- Shows **what** changed (visual diff)
- Shows **how** it looks (live preview before/after)
- Explains **why** it broke (bug classification + root cause)
- Tests **if you understood** (quiz before revealing the fix)
- Tracks **your patterns** (personal bug dashboard over time)

---

## 3. Target Users

| User | Context | Need |
|------|---------|------|
| **CS students** (bootcamp / university) | Learning to code, using AI assistants daily | Understand bugs, not just fix them |
| **Junior developers** | First job, vibe-coding through tickets | Build debugging intuition, stop repeating mistakes |
| **Self-taught devs** | Learning from YouTube / tutorials + AI | Fill knowledge gaps they don't know they have |

**Scope for hackathon:** Web developers working with HTML/CSS/JavaScript/React.

---

## 4. Features

### P0 — Must Ship (Demo-Critical)

| ID | Feature | Description | Acceptance Criteria |
|----|---------|-------------|-------------------|
| F1 | **Extension Shell** | VS Code extension that activates on web projects, registers commands, and hosts webview panels | Extension installs from VSIX, activates on JS/TS/CSS files, opens side panel |
| F2 | **Diff Detection** | Detects when a file changes (simulating an AI fix) and captures the before/after state | Captures old content vs new content on file save, produces a structured diff |
| F3 | **Visual Diff Panel** | Webview panel showing syntax-highlighted side-by-side or inline diff | Diff renders in a webview with color-coded additions (green) and deletions (red), syntax highlighted |
| F4 | **Bug Classification** | LLM analyzes the diff and classifies into one of 8 bug categories | Returns JSON with category, explanation, concept name, and quiz — under 5 seconds |
| F5 | **"Why It Broke" Explanation** | Plain-English explanation of the root cause displayed in the panel | 2–3 sentence explanation referencing specific lines, readable by a beginner |
| F6 | **Bug Dashboard** | Webview panel showing bug history as charts — category breakdown, trend over time | Heatmap or bar chart of bug categories, line chart of bugs over sessions, "focus area" recommendation |
| F7 | **Demo App** | A small React app with 3–5 pre-planted bugs for the live demo | Each bug is triggerable, fixable, and produces a clear visual change |

### P1 — Should Ship (Strengthens Demo)

| ID | Feature | Description | Acceptance Criteria |
|----|---------|-------------|-------------------|
| F8 | **Live Preview Panel** | Embedded iframe in VS Code showing the running web app — updates on file change | Webview with iframe pointing to localhost:3000 (or similar), auto-refreshes on save |
| F9 | **"Test Yourself" Quiz** | Before showing the explanation, prompts user with a multiple-choice question | Quiz renders in webview, user selects answer, gets feedback (correct/incorrect + why), then explanation reveals |
| F10 | **Concept Tag** | Links each bug to a CS concept (e.g., "CSS Cascade", "Immutability") | Concept name displayed as a badge/tag below the explanation |
| F11 | **Seed Data** | Pre-populated bug history for demo (simulating a week of student coding) | Dashboard shows realistic data: 15–20 bugs across categories with timestamps |

### P2 — Nice to Have (Polish)

| ID | Feature | Description |
|----|---------|-------------|
| F12 | **Animations** | Smooth transitions when diff panel opens, quiz slides in, dashboard updates |
| F13 | **Sound/Haptic** | Subtle sound effect on bug classification (optional, adds demo flair) |
| F14 | **Export Report** | "Download your bug report" as PDF/PNG from the dashboard |
| F15 | **Streaks/Gamification** | "You've gone 3 fixes without a CSS bug!" encouragement messages |

---

## 5. User Stories

### Core Flow
```
AS A student using AI to code,
WHEN I accept an AI-suggested fix,
I WANT to see what changed, why it was broken, and what concept I need to learn,
SO THAT I build real debugging skills instead of just accepting fixes blindly.
```

### Quiz Flow
```
AS A student,
WHEN a bug is detected and classified,
I WANT to be quizzed on what I think went wrong BEFORE seeing the answer,
SO THAT I engage in active recall and learn more effectively.
```

### Dashboard Flow
```
AS A student reviewing my progress,
WHEN I open the Bug Dashboard,
I WANT to see my bug patterns over time with a recommended focus area,
SO THAT I know what concepts to study next.
```

---

## 6. Technical Architecture

```
┌─────────────────────────────────────────────────┐
│                  VS Code Extension                │
│                                                   │
│  ┌──────────┐  ┌──────────┐  ┌────────────────┐ │
│  │  File     │  │ Diff     │  │  Webview Host  │ │
│  │  Watcher  │──│ Engine   │──│  (Panels)      │ │
│  └──────────┘  └──────────┘  └────────────────┘ │
│       │              │         │    │    │        │
│       │              │         │    │    │        │
│  ┌────▼──────────────▼─┐  ┌───▼┐ ┌▼──┐ ┌▼─────┐ │
│  │  Extension Host     │  │Diff│ │Quiz│ │Dash- │ │
│  │  (TypeScript)       │  │View│ │View│ │board │ │
│  │                     │  └────┘ └────┘ └──────┘ │
│  │  - onDidSaveText    │                         │
│  │  - captureOldState  │                         │
│  │  - computeDiff      │                         │
│  │  - callLLM          │                         │
│  │  - updateDashboard  │                         │
│  └─────────┬───────────┘                         │
│            │                                      │
└────────────┼──────────────────────────────────────┘
             │
             ▼
    ┌─────────────────┐     ┌─────────────────┐
    │   Gemini API    │     │  MongoDB Atlas   │
    │   (Primary LLM) │     │  (Bug History)   │
    │                 │     │                 │
    │  Input: diff    │     │  - categories   │
    │  Output: JSON   │     │  - timestamps   │
    │  - category     │     │  - explanations │
    │  - explanation  │     │  - quiz results │
    │  - concept      │     └─────────────────┘
    │  - quiz         │
    └─────────────────┘     ┌─────────────────┐
                            │  ElevenLabs     │
                            │  (TTS - P1)     │
                            │  Input: text    │
                            │  Output: audio  │
                            └─────────────────┘
```

### Key Technical Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Extension type | VS Code Webview Extension | Need rich UI panels (diff, quiz, dashboard) — webviews are the only way |
| Bundler | **esbuild** | Industry standard for VS Code extensions. 100x faster than webpack, builds extension host + webview in parallel |
| Diff computation | **`diff`** npm library + **`diff2html`** for rendering | `diff` computes diffs, `diff2html` renders syntax-highlighted side-by-side/inline diffs out of the box |
| LLM provider | **Gemini API** (primary), Claude API (fallback) | Targets MLH "Best Use of Gemini API" prize. Gemini handles structured JSON output well |
| Dashboard rendering | **Chart.js v4** in webview | Canvas-based, no framework dependency, small bundle, proven in VS Code webviews |
| Webview framework | **`@vscode-elements/elements`** (Lit-based) | Replaced deprecated `@vscode/webview-ui-toolkit`. ~5kb, native VS Code look-and-feel, used by GitLens |
| State storage | **MongoDB Atlas** (primary) + VS Code `globalState` (offline fallback) | Targets MLH "Best Use of MongoDB Atlas" prize. Enables cross-device persistence and richer querying |
| Secrets | **`context.secrets`** API | Encrypted storage for API keys (Gemini, MongoDB, ElevenLabs) |
| TTS | **ElevenLabs API** (P1) | "Read aloud" for bug explanations. Targets MLH "Best Use of ElevenLabs" prize. Accessibility angle |
| Demo app hosting | **DigitalOcean App Platform** | Targets MLH "Best Use of DigitalOcean" prize. Shows production-ready deployment |
| Live preview | Iframe to localhost dev server (or DigitalOcean URL) | Simplest approach — embed the running app. Refreshes on postMessage from extension |
| Scaffolding | **`yo code`** (Yeoman) | Still the official standard, no real competitor |

---

## 7. Team Roles & Responsibilities

### Engineer 1: "Extension Lead" — owns the VS Code extension infrastructure

**Focus:** Extension scaffold, file watching, diff engine, webview hosting, inter-panel communication.

| Task | Priority | Hours | Dependencies |
|------|----------|-------|-------------|
| T1: Scaffold extension with `yo code` (TypeScript) | P0 | 0.5h | None |
| T2: Implement `onWillSaveTextDocument` to capture pre-save state | P0 | 1h | T1 |
| T3: Implement `onDidSaveTextDocument` to compute diff (before vs after) | P0 | 1.5h | T2 |
| T4: Create webview panel host infrastructure (register 3 panels: diff, quiz, dashboard) | P0 | 2h | T1 |
| T5: Build message passing between extension host ↔ webviews (postMessage protocol) | P0 | 1.5h | T4 |
| T6: Integrate LLM API call in extension host (send diff → receive classification JSON) | P0 | 1.5h | T3 |
| T7: Wire up full flow: save → diff → LLM → populate diff panel + quiz panel | P0 | 2h | T3, T5, T6 |
| T8: Implement live preview panel (iframe to localhost) with auto-refresh | P1 | 2h | T4 |
| T9: Polish extension activation, commands, status bar indicator | P2 | 1h | T7 |
| **Total** | | **~13h** | |

### Engineer 2: "UI/Webview Lead" — owns all webview panels and visual polish

**Focus:** Diff view, quiz view, dashboard view, all HTML/CSS/JS inside webviews, animations.

| Task | Priority | Hours | Dependencies |
|------|----------|-------|-------------|
| T10: Design and build Diff Panel webview (syntax-highlighted side-by-side diff) | P0 | 3h | T5 (message protocol ready) |
| T11: Build "Why It Broke" explanation card inside diff panel (category badge, explanation text, concept tag) | P0 | 1.5h | T10 |
| T12: Build Quiz Panel webview (question, 4 options, submit, feedback reveal) | P1 | 2.5h | T5 |
| T13: Build Bug Dashboard webview (bar chart of categories, trend line, focus recommendation) | P0 | 3h | T5 |
| T14: Create seed data module (15–20 realistic bug entries for dashboard demo) | P1 | 1h | T13 |
| T15: CSS polish — consistent color scheme, dark theme compatible, smooth transitions | P2 | 2h | T10, T12, T13 |
| T16: Build "reveal" animation — quiz answer → explanation card slides in → diff highlights | P2 | 1.5h | T11, T12 |
| **Total** | | **~14.5h** | |

### Engineer 3: "LLM + Demo Lead" — owns prompt engineering, demo app, and presentation

**Focus:** LLM prompt crafting, bug classification quality, demo React app with planted bugs, demo script, backup recording.

| Task | Priority | Hours | Dependencies |
|------|----------|-------|-------------|
| T17: Set up LLM API integration module (Gemini SDK, request/response types, error handling) | P0 | 1.5h | None |
| T18: Write and test bug classification prompt (few-shot, structured JSON output) | P0 | 3h | T17 |
| T19: Test prompt against 10+ different bug diffs, iterate on quality | P0 | 2h | T18 |
| T20: Build demo React app (simple UI — buttons, forms, cards) | P0 | 2h | None |
| T21: Plant 3–5 bugs in demo app (CSS specificity, null ref, state mutation, off-by-one, async) | P0 | 2h | T20 |
| T22: Test full end-to-end flow with each planted bug | P0 | 2h | T7, T10, T18, T21 |
| T23: Write demo script (minute-by-minute walkthrough for judges) | P0 | 1h | T22 |
| T24: Record backup demo video | P1 | 1h | T22 |
| T25: Prepare pitch deck / talking points (problem, solution, demo, impact) | P0 | 1.5h | T23 |
| T26: Rehearse demo 3+ times with full team | P0 | 1h | T25 |
| **Total** | | **~17h** | |

---

## 8. Task Dependency Graph

```
Hour 0─2: SETUP (all together)
├── T1:  Scaffold extension ──────────────────────┐
├── T17: Set up LLM module                        │
├── T20: Build demo React app                     │
│                                                  │
Hour 2─6: PARALLEL TRACKS                         │
│                                                  │
│  Track A (Eng 1):                                │
│  T2 → T3 → T6 ─────────────────┐               │
│                                  │               │
│  Track B (Eng 1 + Eng 2):       │               │
│  T4 → T5 ───────────────────────┤               │
│                                  │               │
│  Track C (Eng 2):               │               │
│  T10 (diff panel) ──────────────┤               │
│                                  │               │
│  Track D (Eng 3):               │               │
│  T18 → T19 (prompts) ──────────┤               │
│  T21 (plant bugs) ──────────────┤               │
│                                  │               │
Hour 6─10: INTEGRATION                            │
│  T7:  Wire full flow (Eng 1) ◄──┘               │
│  T11: Explanation card (Eng 2)                   │
│  T12: Quiz panel (Eng 2)                         │
│  T13: Dashboard (Eng 2)                          │
│                                                  │
Hour 10─14: FEATURES + PREVIEW                    │
│  T8:  Live preview panel (Eng 1)                │
│  T14: Seed data (Eng 2)                          │
│  T22: End-to-end testing (Eng 3)                │
│                                                  │
Hour 14─18: POLISH + DEMO PREP                    │
│  T9:  Extension polish (Eng 1)                  │
│  T15: CSS polish (Eng 2)                         │
│  T16: Animations (Eng 2)                         │
│  T23: Demo script (Eng 3)                        │
│  T24: Backup video (Eng 3)                       │
│                                                  │
Hour 18─21: FINAL POLISH                           │
│  Bug fixes, edge cases (All)                     │
│  T25: Pitch prep (Eng 3)                         │
│                                                  │
Hour 21─24: REHEARSE + SUBMIT                      │
│  T26: Rehearse 3x (All)                          │
│  Final testing, submit                           │
```

---

## 9. Demo Script (2 Minutes)

| Time | Action | What Judges See |
|------|--------|----------------|
| 0:00–0:20 | **Pitch the problem** | "AI tools fix bugs for you. But fixing isn't learning. Meet FlowFixer." |
| 0:20–0:40 | **Show the broken app** | React app running with a broken button (doesn't respond to clicks). Live preview panel shows the bug. |
| 0:40–1:00 | **Trigger the fix** | "Fix this onClick handler" → file changes → FlowFixer intercepts |
| 1:00–1:10 | **Quiz pops up** | "What do you think went wrong?" — 4 options appear |
| 1:10–1:20 | **Answer the quiz** | Select answer → feedback: "Correct! The handler was bound to the wrong element." |
| 1:20–1:40 | **Explanation reveals** | Visual diff highlights the change. "Why It Broke" card: "Bug Type: Event Binding. Your onClick was on the wrapper div, not the button itself." Concept: "Event Delegation in JavaScript." Live preview updates — button now works. |
| 1:40–2:00 | **Show the dashboard** | Switch to Bug Dashboard. Heatmap shows a week of data. "This student struggles most with State Management and CSS Layout. Recommended focus: React useState." Close with tagline: "Vibe coding makes you fast. FlowFixer makes you fast AND smart." |

---

## 10. Bug Categories (Classification Taxonomy)

| Category | Example Bug | Concept Link |
|----------|------------|-------------|
| CSS Layout / Specificity | `.btn` overridden by `.container .btn` | CSS Cascade & Specificity |
| Null / Undefined Reference | `Cannot read property 'x' of undefined` | Defensive Programming, Optional Chaining |
| Off-by-one Error | `for (i = 0; i <= arr.length)` | Array Indexing, Boundary Conditions |
| Async / Race Condition | State read before `await` resolves | Event Loop, Promises, async/await |
| State Management | Direct mutation of React state | Immutability, React re-rendering |
| Type Mismatch | String concatenation instead of addition | Type Coercion, TypeScript |
| Logic Error | Wrong conditional operator (`&&` vs `\|\|`) | Boolean Logic, De Morgan's Laws |
| Syntax Error | Missing closing bracket, typo in variable name | Syntax Fundamentals |

---

## 11. Planted Demo Bugs

| # | Bug | Category | Visual Effect | The Fix |
|---|-----|----------|--------------|---------|
| 1 | `onClick` on wrapper `<div>` instead of `<button>` | Event Binding | Button doesn't respond to clicks | Move `onClick` to the `<button>` element |
| 2 | `.btn` styles overridden by `.card .btn` in another stylesheet | CSS Specificity | Button appears unstyled / wrong color | Increase specificity or fix selector |
| 3 | `setCount(count + 1)` inside a closure that captures stale `count` | State Management | Counter increments erratically | Use `setCount(prev => prev + 1)` |
| 4 | `fetch` result used before `await` | Async | Data shows as "undefined" on screen | Add `await` before `fetch` call |
| 5 | `array.length` in condition uses `<=` instead of `<` | Off-by-one | App crashes on last item render | Change `<=` to `<` |

---

## 12. Risk Register

| # | Risk | Likelihood | Impact | Mitigation | Owner |
|---|------|-----------|--------|-----------|-------|
| R1 | VS Code webview takes too long to set up | Medium | High | Start with `yo code` template. Eng 1 owns this exclusively for first 4h. Test webview "hello world" in first 30 min. | Eng 1 |
| R2 | LLM returns inconsistent/bad JSON | Medium | High | Use Gemini with structured output mode. Add JSON schema validation. Have 3 fallback hardcoded responses for demo bugs. | Eng 3 |
| R3 | Diff detection misses changes or fires incorrectly | Medium | Medium | Use `onWillSaveTextDocument` (captures before) + `onDidSaveTextDocument` (captures after). Test early with manual saves. | Eng 1 |
| R4 | Live preview iframe doesn't refresh reliably | Low | Medium | Fallback: remove live preview from demo, show diff + explanation only. Or use screenshots. | Eng 1 |
| R5 | Demo breaks on stage | Medium | Critical | Pre-plant bugs tested 10+ times. Pre-record backup video. Script every click. | Eng 3 |
| R6 | Run out of time on P1 features | Medium | Low | P0 features alone make a complete demo. Quiz and live preview are enhancement, not core. | All |
| R7 | LLM API rate limits or downtime | Low | Critical | Cache Gemini responses for demo bugs locally. If API is down, fall back to Claude API, then serve cached responses. | Eng 3 |
| R9 | MongoDB Atlas connection issues during demo | Low | Medium | Fall back to VS Code globalState for offline storage. Seed data works either way. | Eng 1 |
| R10 | ElevenLabs TTS adds latency to demo | Low | Low | TTS is P1 and optional. Pre-cache audio for demo bugs. Skip button always available. | Eng 2 |
| R8 | Team burnout / coordination breakdown | Medium | Medium | Mandatory break at hour 12 (30 min). Sync standups at hours 6, 10, 14, 18. Clear ownership per task. | All |

---

## 13. Definition of Done

### Minimum Viable Demo (must hit all):
- [ ] Extension installs from VSIX on a clean VS Code instance
- [ ] Saving a file with a "fix" triggers the diff panel
- [ ] Diff panel shows syntax-highlighted before/after
- [ ] LLM classification returns category + explanation for at least 3 demo bugs
- [ ] Bug Dashboard displays seeded data with category chart + trend line
- [ ] Full demo flow runs end-to-end without errors 3 consecutive times

### Stretch Goals:
- [ ] Quiz panel works with multiple-choice + feedback
- [ ] Live preview panel shows before/after of running app
- [ ] Animations / transitions between panels
- [ ] Export bug report

---

## 14. Communication Plan

| When | What | Format |
|------|------|--------|
| Hour 0 | Kick-off: confirm roles, set up repo, API keys | All together, in-person |
| Hour 6 | Standup: Track A/B/C/D status, blockers | 5-min standup |
| Hour 10 | Integration check: can all pieces talk to each other? | All together, pair on issues |
| Hour 14 | Demo dry-run #1: test the full flow | All together |
| Hour 18 | Demo dry-run #2: time it, polish script | All together |
| Hour 21 | Final rehearsal: full pitch + demo, no stops | All together |
| Ongoing | Blockers | Shout immediately, don't wait for standup |

---

## 15. Repository Structure

```
flowfixer/
├── extension/                    # VS Code extension (TypeScript)
│   ├── src/
│   │   ├── extension.ts          # Entry point, activation, command registration
│   │   ├── diffEngine.ts         # File watching, before/after capture, diff computation
│   │   ├── llmClient.ts          # Gemini API calls, JSON parsing, caching (Claude fallback)
│   │   ├── ttsClient.ts          # ElevenLabs TTS API integration
│   │   ├── storage.ts            # MongoDB Atlas client + globalState fallback
│   │   ├── panels/
│   │   │   ├── DiffPanel.ts      # Diff webview panel provider
│   │   │   ├── QuizPanel.ts      # Quiz webview panel provider
│   │   │   └── DashboardPanel.ts # Dashboard webview panel provider
│   │   ├── webview/
│   │   │   ├── diff.html         # Diff panel (diff2html + @vscode-elements)
│   │   │   ├── quiz.html         # Quiz panel (@vscode-elements)
│   │   │   ├── dashboard.html    # Dashboard panel (Chart.js v4)
│   │   │   └── styles.css        # Shared webview styles
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
│   │   │   ├── Counter.tsx       # Bug: stale closure in setState
│   │   │   ├── Button.tsx        # Bug: onClick on wrong element
│   │   │   ├── DataLoader.tsx    # Bug: missing await
│   │   │   ├── ItemList.tsx      # Bug: off-by-one in loop
│   │   │   └── Card.tsx          # Bug: CSS specificity issue
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

## 16. Target Prizes

### Primary Targets (no extra code needed)
| Prize | Strategy |
|-------|----------|
| **Best Overall Hack** | Build it well — ambitious, technical, great narrative |
| **Best UI & UX Designed Hack** | Polish webview panels, smooth transitions, dark theme compat |
| **Best Community Impact Hack** | Emphasize "anti-vibe-coding" education narrative in pitch |

### Sponsor Prize Targets (integrated into tech stack)
| Prize | Integration | Effort |
|-------|-------------|--------|
| **MLH Best Use of Gemini API** | Gemini as primary LLM for bug classification | Core (already in stack) |
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

## 17. API Keys & Accounts Needed

| Service | What For | Setup Time | Who |
|---------|---------|-----------|-----|
| **Google (Gemini API)** | Primary LLM for bug classification | 5 min | Eng 3 |
| **Anthropic (Claude API)** — fallback | Backup LLM | 5 min | Eng 3 |
| **MongoDB Atlas** | Bug history database (free tier) | 10 min | Eng 1 |
| **ElevenLabs** | TTS for explanation read-aloud | 5 min | Eng 2 |
| **DigitalOcean** | Demo app hosting ($200 free credits) | 10 min | Eng 1 |
| **GitHub** | Repo hosting | Already have | Eng 1 |
| **Node.js 18+** | Extension + demo app runtime | Already installed | All |
| **VS Code** | Development + demo | Already installed | All |

---

## Appendix: Prompt Template

```
You are a coding education assistant analyzing a bug fix. You will receive a diff showing the before (buggy) and after (fixed) code.

## Input
- Language: {{language}}
- File: {{filename}}
- Diff:
{{diff}}

## Instructions
Analyze this diff and respond in JSON:

{
  "category": "one of: CSS Layout / Specificity | Null / Undefined Reference | Off-by-one Error | Async / Race Condition | State Management | Type Mismatch | Logic Error | Syntax Error",
  "explanation": "2-3 sentences explaining WHY the original code was broken. Write for a student. Use plain English. Reference specific lines.",
  "concept": "The CS/programming concept this relates to (e.g., 'Immutability', 'Event Loop')",
  "fix_summary": "One sentence describing what the fix did",
  "quiz": {
    "question": "A question testing if the student understands WHY the bug occurred",
    "options": ["A) ...", "B) ...", "C) ...", "D) ..."],
    "correct": "B",
    "explanation": "Why the correct answer is right and a common wrong answer is wrong"
  }
}

## Rules
- Explain for beginners, not experts
- Reference the actual code in the diff, not abstract concepts
- The quiz should test understanding of the ROOT CAUSE, not just recognition of the fix
- Keep explanation under 50 words
- Keep quiz question under 30 words
```
