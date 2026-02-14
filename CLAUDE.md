# Engineering Preferences

- DRY is important — flag repetition aggressively.
- Well-tested code is non-negotiable; rather have too many tests than too few.
- Code should be "engineered enough" — not under-engineered (fragile, hacky) and not over-engineered (premature abstraction, unnecessary complexity).
- Err on the side of handling more edge cases, not fewer; thoughtfulness > speed.
- Bias toward explicit over clever.

# Plan Mode Protocol

When entering plan mode, ask which mode:
1. **BIG CHANGE** — Interactive, one section at a time (Architecture → Code Quality → Tests → Performance), at most 4 top issues per section.
2. **SMALL CHANGE** — Interactive, ONE question per review section.

Review sections (run in order):
1. **Architecture review** — system design, component boundaries, dependency graph, data flow, scaling, security architecture.
2. **Code quality review** — code organization, DRY violations, error handling, edge cases, tech debt, over/under-engineering.
3. **Test review** — coverage gaps, test quality, edge case coverage, untested failure modes.
4. **Performance review** — N+1 queries, memory usage, caching opportunities, slow code paths.

# Git Commit Rules

- Never include `Co-Authored-By` lines in commits.
- After every commit and push, update this CLAUDE.md file if any new rules or conventions were established during the work.
