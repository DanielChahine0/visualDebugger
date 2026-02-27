# Visual Debugger

**AI-powered bug tutor for VS Code.** Visual Debugger turns every error into a lesson — explaining what went wrong before you fix it, and showing you exactly what changed after.

---

## The Problem

When you hit a runtime crash or a cryptic type error, the default experience is a wall of unreadable stack trace. Most developers — especially beginners — copy-paste the error into ChatGPT, accept the fix, and move on without ever understanding what went wrong. Over time, this builds dependency instead of skill.

Visual Debugger breaks that cycle.

---

## How It Works

Visual Debugger runs a **two-phase learning loop** every time you hit a bug:

**Phase 1 — Before the fix:** The moment an error appears, Visual Debugger explains it in plain English. You see where the bug is, what the error message actually means, how to fix it, and how to prevent it next time.

**Phase 2 — After the fix:** When an AI tool (Copilot, Cursor, ChatGPT) edits your file, Visual Debugger captures the before/after state and shows you a syntax-highlighted red/green diff with an explanation of every change the AI made.

---

## Features

### Error Explanation Panel
Automatically activates when VS Code detects an error in your JavaScript or TypeScript files. Breaks down the error into beginner-friendly sections:

- **TL;DR** — one sentence that tells you the most important thing to know
- **What it means** — plain-English decoding of the error message
- **How to fix it** — step-by-step instructions referencing your actual code
- **How to prevent it** — habits to avoid this bug type in the future
- **Best practices** — industry-standard patterns related to this bug

Each section uses progressive disclosure (collapsed by default) so you only read what you need.

### Visual Diff Review
After an AI tool modifies your file, the Diff Panel opens automatically:

- **Red lines** — code the AI removed
- **Green lines** — code the AI added
- **Explanation card** — what changed, why it fixes the bug, and the key takeaway

### Interactive Quiz
After the error is explained, a multiple-choice question tests whether you actually understood the root cause — not just the fix.

### Bug Dashboard
A full analytics panel that tracks your error history over time. Includes:

- **Summary stats** — total bugs with per-category counts (Syntax, Logic, Runtime) that animate on load
- **Category bar chart** — visual breakdown of your most common bug types
- **Trend line** — bugs over time with 1H / 1D / 7D / 30D range toggle
- **Learning progress ring** — tracks how many AI-fix diffs you've reviewed
- **Activity heatmap** — GitHub-style contribution grid showing your daily bug activity across the last 16 weeks
- **Achievements** — six unlockable badges (First Bug, 5 Bugs, 10 Bugs, All Types, Quick Fix, Power User)
- **Recent bug history** — scrollable log of every recorded error with file name, category badge, and timestamp

### CodeLens Inline Actions
"Explain This Error" and "Fix Error" links appear directly above red squiggles in your editor — no need to open a panel manually.

### Audio Read-Aloud
Powered by ElevenLabs, every explanation card has a read-aloud button. Natural-sounding voice reads the explanation while key terms stay highlighted on screen — useful for auditory learners and accessibility.

---

## Screenshots

![Error Explanation Panel](https://github.com/user-attachments/assets/ed4df175-92df-4ad2-8c3a-06278bfe6276)

![Bug Information View](https://github.com/user-attachments/assets/6b87c9eb-50e4-4a99-8a13-cbcccf6ca364)

![Bug Dashboard](https://github.com/user-attachments/assets/c4a6c667-f5a5-4f1e-9364-a7c3ceb06bec)

---

## Getting Started

### 1. Install the Extension

Search for **"Visual Debugger"** in the VS Code Extensions Marketplace and click Install.

### 2. Set Your Gemini API Key

Visual Debugger uses Google Gemini to generate explanations.

1. Open the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`)
2. Run: `Visual Debugger: Set Gemini API Key`
3. Paste your key from [Google AI Studio](https://aistudio.google.com/) — it's free to get started

### 3. (Optional) Enable Audio Read-Aloud

For voice explanations powered by ElevenLabs:

1. Run: `Visual Debugger: Set ElevenLabs API Key`
2. Paste your key from [ElevenLabs](https://elevenlabs.io/)

### 4. Open a Project and Start Coding

Open any JavaScript or TypeScript project. When an error appears, Visual Debugger activates automatically — or click **"Explain This Error"** above any red squiggle in your editor.

---

## Requirements

| Requirement | Details |
|-------------|---------|
| VS Code | v1.85.0 or later |
| Language | JavaScript, TypeScript, JSX, TSX |
| Gemini API Key | Required — free tier available at [aistudio.google.com](https://aistudio.google.com/) |
| ElevenLabs API Key | Optional — enables audio read-aloud |

---

## Commands

| Command | Description |
|---------|-------------|
| `Visual Debugger: Show Debug Panel` | Open the error explanation panel |
| `Visual Debugger: Show Diff Review` | Open the AI fix diff panel |
| `Visual Debugger: Show Bug Dashboard` | Open the bug history dashboard |
| `Visual Debugger: Analyze Current File` | Manually trigger analysis on the active file |
| `Visual Debugger: Set Gemini API Key` | Store your Gemini API key (encrypted) |
| `Visual Debugger: Set ElevenLabs API Key` | Store your ElevenLabs API key (encrypted) |

---

## Bug Categories

Visual Debugger classifies every error into one of three categories:

| Category | What It Covers | Example |
|----------|---------------|---------|
| **Syntax Error** | Code that can't be parsed — missing brackets, typos, malformed expressions | `SyntaxError: Unexpected token '}'` |
| **Logic Error** | Code that runs but produces wrong results — wrong operators, bad conditions, off-by-one | Counter shows the wrong number |
| **Runtime Error** | Code that crashes during execution — null refs, type errors, missing imports | `TypeError: Cannot read properties of undefined` |

---

## Privacy

API keys are stored using VS Code's encrypted `secrets` API — never in plaintext. No code or error data is stored outside your machine except for the API calls to Gemini and ElevenLabs made on your behalf.

---

## License

MIT — see [LICENSE](LICENSE) for details.
