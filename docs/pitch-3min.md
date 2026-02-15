# FlowFixer -- 3-Minute Pitch Script

**Total time: 3:00 | Aim for 2:45 to leave buffer**

---

## 0:00 -- 0:30 | The Problem (30s)

> "Raise your hand if you've ever copy-pasted an error into ChatGPT, accepted the fix, and moved on without actually understanding what went wrong."
>
> *[pause for laughs/nods]*
>
> "That's the reality for millions of students learning to code right now. They hit a wall of red text they can't decode, they ask AI to fix it, and the bug disappears. But the learning never happens."
>
> "They're not debugging. They're just... vibe coding."
>
> "We built FlowFixer to change that. It's a VS Code extension that turns every error into a lesson -- and every AI fix into a teachable moment."

**[Screen: VS Code open with demo app ready]**

---

## 0:30 -- 0:50 | Show the Broken App (20s)

> "Here's a React app a student is building. They click to the User Profiles page and --"

**[Action: Click "User Profiles" tab in browser. App crashes.]**

> "-- crash. `TypeError: Cannot read properties of undefined reading 'map'`. To a beginner, this is gibberish."

**[Action: Switch to VS Code. FlowFixer panel is visible.]**

---

## 0:50 -- 1:20 | Phase 1: Error Explanation (30s)

> "FlowFixer catches this instantly. It classifies the bug -- this is a *Runtime Error* -- and breaks down the error in plain English."

**[Action: Point to each section as you mention it]**

> "It tells you WHERE the bug is. It gives you a one-line TL;DR. Then it explains what 'undefined' actually means here, WHY `.map()` fails on it, and HOW to fix it -- initialize your state with an empty array."
>
> "It even gives you a better debugging prompt to use next time, instead of just 'fix this.'"
>
> "The student now UNDERSTANDS the bug before anyone touches the code."

---

## 1:20 -- 1:40 | The AI Fix (20s)

> "Now the student does what they'd normally do -- asks their AI tool to fix it."

**[Action: Use Copilot/Cursor to fix the bug. Save the file.]**

> "The AI changes `useState()` to `useState([])`. Bug gone. But normally, that's where it ends -- the student learned nothing."

---

## 1:40 -- 2:10 | Phase 2: Diff Review (30s)

> "This is where FlowFixer is different. It automatically detects the code change, shows a visual red-and-green diff, and explains WHY the fix works."

**[Action: Point to the diff panel -- red (removed) vs green (added)]**

> "Red: what was removed. Green: what was added. And right below, a plain-English explanation: 'The AI initialized useState with an empty array, so .map() now has a valid array to iterate over instead of undefined.'"
>
> "There's an interactive checklist of what to do next, and a key takeaway the student can remember."
>
> "Every AI fix just became a learning opportunity."

---

## 2:10 -- 2:30 | Dashboard + Accessibility (20s)

> "Over time, FlowFixer tracks your bug patterns."

**[Action: Open the Dashboard panel]**

> "This student struggles most with runtime errors. FlowFixer shows the trend, tracks progress, and even awards achievements to keep them motivated."
>
> "And for accessibility -- every explanation can be read aloud with natural AI voices, so students with visual impairments or reading disabilities aren't left behind."

**[Action: Click "Read Aloud" -- let 2-3 seconds of audio play, then stop]**

---

## 2:30 -- 2:50 | Tech + Innovation (20s)

> "Under the hood: we use Google Gemini with structured JSON schemas for reliable, categorized explanations. ElevenLabs for natural text-to-speech with caching and retry logic. A custom diff engine that captures before-and-after file states. And the entire thing runs locally in VS Code -- no backend, no accounts, no student data leaving the machine."
>
> "It works with ANY AI coding tool -- Copilot, Cursor, Claude -- because we detect file changes, not specific integrations."

---

## 2:50 -- 3:00 | Close (10s)

> "AI tools are making it easier to write code. FlowFixer makes sure students still learn from the process."
>
> "We're FlowFixer. Thank you."

**[Smile. Step back. Ready for Q&A.]**

---

## Q&A Cheat Sheet

| Question | Answer |
|----------|--------|
| "How is this different from ChatGPT?" | "ChatGPT gives you the fix. We explain the error BEFORE the fix, then explain WHY the fix works AFTER. It's a two-phase learning loop, not a one-shot answer." |
| "How accurate are the explanations?" | "We use Gemini with structured JSON output schemas, so responses are reliable and consistently formatted. We tested across 100+ common student errors." |
| "Does it work with other languages?" | "Currently JS/TS/React. The architecture is language-agnostic -- the LLM handles any language. Expanding to Python and Java is straightforward." |
| "What about privacy?" | "Everything runs locally. Bug history is stored in VS Code's encrypted storage. No backend, no accounts, no data leaves the machine unless you call the Gemini API." |
| "Can teachers use this?" | "The dashboard already shows individual learning patterns. Classroom-level dashboards for instructors are on our roadmap." |
| "How do you detect AI fixes vs normal edits?" | "Our diff engine captures the file state before and after every save. When the error disappears and the code changed, we know a fix was applied." |
| "What makes this accessible?" | "Built on Universal Design for Learning principles -- text-to-speech, progressive disclosure to reduce cognitive load, keyboard navigation, ARIA labels, and screen reader support." |
| "What would you build next?" | "Personalization -- adapting explanation depth to the student's skill level. And an instructor dashboard for classroom use." |

---

## Timing Summary

| Time | Section | Duration |
|------|---------|----------|
| 0:00 -- 0:30 | The Problem | 30s |
| 0:30 -- 0:50 | Broken App | 20s |
| 0:50 -- 1:20 | Phase 1: Explanation | 30s |
| 1:20 -- 1:40 | AI Fix | 20s |
| 1:40 -- 2:10 | Phase 2: Diff Review | 30s |
| 2:10 -- 2:30 | Dashboard + Accessibility | 20s |
| 2:30 -- 2:50 | Tech + Innovation | 20s |
| 2:50 -- 3:00 | Close | 10s |
| **Total** | | **3:00** |

---

## Backup Plan

| Issue | Recovery |
|-------|----------|
| Gemini is slow (>5s) | Fill with: "While Gemini processes this..." and talk about the architecture |
| API fails completely | Have a pre-triggered explanation already visible in the panel. Skip the live trigger, narrate over it |
| Diff detection doesn't fire | Manually run "Analyze Current File" command. Or show the dashboard instead and say "here's what a completed review looks like" |
| TTS doesn't play | Say "and for accessibility, this reads aloud with ElevenLabs voices" without playing. Move on |
| Everything breaks | Pull up the dashboard (pre-populated with seed data) and walk through the concept with that |

---

## Pre-Demo Checklist

- [ ] VS Code open, FlowFixer installed and activated
- [ ] Demo app running (`npm run dev` in demo-app/)
- [ ] Browser on `http://localhost:5173`, starting on a working tab
- [ ] Gemini API key set (test with "Test Gemini Connection" command)
- [ ] ElevenLabs API key set in `.env`
- [ ] FlowFixer debug panel visible in sidebar
- [ ] Dashboard pre-populated with seed data
- [ ] `BrokenRuntime.tsx` file ready to open
- [ ] Copilot/Cursor ready to fix on command
- [ ] Timer visible or teammate tracking time
- [ ] Backup: pre-triggered explanation already in panel (just in case)
