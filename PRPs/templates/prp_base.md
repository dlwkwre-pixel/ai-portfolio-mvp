# Base PRP Template v2 - Context-Rich with Validation Loops

## Purpose
Template optimized for AI agents to implement features with sufficient context and self-validation capabilities to achieve working code through iterative refinement.

## Core Principles
1. **Context is King**: Include ALL necessary documentation, examples, and caveats
2. **Validation Loops**: Provide executable tests/lints the AI can run and fix
3. **Information Dense**: Use keywords and patterns from the codebase
4. **Progressive Success**: Start simple, validate, then enhance
5. **Global rules**: Be sure to follow all rules in CLAUDE.md

---

## Goal
[What needs to be built - be specific about the end state and desired outcome]

## Why
- [Business value and user impact]
- [Integration with existing features]
- [Problems this solves and for whom]

## What
[User-visible behavior and technical requirements]

### Success Criteria
- [ ] [Specific measurable outcomes]

## All Needed Context

### Documentation & References (list all context needed to implement the feature)
```yaml
# MUST READ - Include these in your context window
- url: [Official API docs URL]
  why: [Specific sections/methods you'll need]

- file: [path/to/example.ts]
  why: [Pattern to follow, gotchas to avoid]

- doc: [Library documentation URL]
  section: [Specific section about common pitfalls]
  critical: [Key insight that prevents common errors]
```

### Current Codebase tree (relevant directories only)
```bash

```

### Desired Codebase tree with files to be added and their responsibility
```bash

```

### Known Gotchas of our codebase & Library Quirks
```
# CRITICAL: Next.js App Router — server components cannot use hooks or browser APIs
# CRITICAL: Supabase server client must be awaited: const supabase = await createClient()
# CRITICAL: Finnhub calls must go through the rate-limited batch helper in lib/market-data/
# CRITICAL: All AI API calls must be proxied through /api/ routes, never called from client
# CRITICAL: No router.refresh() — use optimistic local state to avoid RSC re-render lag
```

## Implementation Blueprint

### Data models and structure
[Describe any new DB columns, TypeScript types, or API shapes needed]

### List of tasks in order
```yaml
Task 1:
  CREATE/MODIFY [file]:
    - [what to do]

Task 2:
  CREATE/MODIFY [file]:
    - [what to do]
```

### Per-task pseudocode
```typescript
// Task 1 — [description]
// PATTERN: follow existing pattern from [reference file]
// GOTCHA: [any known issue]
```

### Integration Points
```yaml
DATABASE:
  - [any new tables, columns, or indexes needed]

API ROUTES:
  - [new routes to add, following app/api/[feature]/route.ts pattern]

COMPONENTS:
  - [new components and where they slot in]
```

## Validation Loop

### Level 1: Type Check & Lint
```bash
npx tsc --noEmit
npx next lint
```

### Level 2: Build
```bash
npx next build
```

### Level 3: Manual Test
- [ ] [Specific UI flow to verify]
- [ ] [Edge case to check]
- [ ] [Mobile (375px) layout check]

## Final Validation Checklist
- [ ] TypeScript: `npx tsc --noEmit` passes
- [ ] Lint: `npx next lint` passes
- [ ] Build: `npx next build` succeeds
- [ ] Dark theme consistent (no white backgrounds)
- [ ] Mobile layout works at 375px
- [ ] No direct AI API calls from client
- [ ] Finnhub calls use rate-limited batch helper

---

## Anti-Patterns to Avoid
- Don't call `router.refresh()` — use optimistic local state instead
- Don't call AI APIs directly from client components
- Don't introduce new color values outside the design token system
- Don't skip the Finnhub rate-limit batch helper
- Don't use `any` types unless absolutely necessary
- Don't add comments explaining what code does — only add comments for non-obvious WHY
