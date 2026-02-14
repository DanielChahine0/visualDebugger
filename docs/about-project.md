# Visual Debugger

## Inspiration

We built Visual Debugger because we kept seeing the same pattern: students hit an error, copy it into an AI tool, paste the fix, and continue without understanding what actually happened. Debugging became a black box instead of a skill.

The project was especially motivated by accessibility and learning equity. Traditional stack traces are dense, jargon-heavy, and cognitively expensive for many learners, especially neurodivergent students. We wanted to transform that moment of frustration into a structured learning moment.

## What it does

Visual Debugger is a VS Code extension that turns debugging into a two-phase learning loop:

1. **Before the fix:** It detects an error, classifies it (syntax, logic, runtime), and explains what happened in plain language.
2. **After the fix:** It shows a visual red/green diff of what changed and explains why the change resolves the issue.

It also includes a dashboard so learners can see bug patterns over time and focus on the categories they struggle with most.

## How we built it

We built the extension in TypeScript using VS Code APIs for diagnostics, file watching, and webview panels.

- **Error flow:** capture diagnostics/runtime context, then call Gemini for structured explanations.
- **Diff flow:** compare pre/post file states and render a human-readable diff in a webview panel.
- **Dashboard flow:** persist bug events and visualize category trends and focus areas.
- **Accessibility:** add text-to-speech support (ElevenLabs) so explanations can be heard, not just read.

The architecture is modular (error listener, diff engine, LLM client, panel renderers, storage), which made it easier to ship quickly while keeping components replaceable.

## Challenges we ran into

- Capturing errors consistently across terminal output and diagnostics without too much noise.
- Keeping explanations beginner-friendly while still technically accurate.
- Distinguishing meaningful AI-assisted fixes from normal edits.
- Balancing speed (hackathon timeline) with quality (clear UX, stable extension behavior).
- Ensuring the UI remained readable and accessible under dense debugging content.

## Accomplishments that we're proud of

- Delivered a full end-to-end learning loop inside VS Code, not just a single explanation popup.
- Built a clear visual diff experience that helps users understand *why* a fix works.
- Created a realistic demo app with planted syntax, logic, and runtime bugs for reliable demonstrations.
- Integrated AI and accessibility features into one educational workflow.
- Shipped a usable dashboard that gives students reflection and direction, not just raw logs.

## What we learned

- Explanations need instructional design, not just technical correctness.
- Diffs are one of the fastest ways to teach code reasoning.
- Accessibility features (like TTS and chunked content) improve usability for everyone, not only specific groups.
- Structured AI output is critical for predictable UI rendering and better product reliability.

We also framed learning impact with a simple metric mindset:

$$
	ext{LearningGain} = \frac{B_{\text{before}} - B_{\text{after}}}{B_{\text{before}}}
$$

where $B_{\text{before}}$ and $B_{\text{after}}$ are repeated bug counts across time windows.

## What's next for Visual Debugger

- Add deeper personalization based on each learner's recurring bug patterns.
- Expand language/framework coverage beyond the current web-focused scope.
- Add stronger teacher/instructor views for classroom-level insights.
- Improve onboarding and guided tutorials for first-time users.
- Run user studies with students to measure retention, confidence, and debugging independence over time.