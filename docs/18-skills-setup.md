# 18 — Claude Code Skills Setup

Skills give Claude Code specialist knowledge on demand. Install them **per project**
(`.claude/skills/`, committed) so every session and contributor gets the same behaviour.

Before installing any community skill, open its `SKILL.md` and scripts and read them. Skills can
run code; only install what you have reviewed. Pin to a commit when cloning.

## 1. Install (run once in the repo root)

```bash
# Vercel's official skills (React/Next.js perf, UI review, composition, React Native later)
npx skills add vercel-labs/agent-skills
#   select: react-best-practices, web-design-guidelines, composition-patterns
#   (later, Phase 14: vercel-react-native-skills)
#   scope: Project

# Anthropic's frontend design skill (anti-generic design while building)
# from the anthropics/skills marketplace:
#   /plugin marketplace add anthropics/skills   → install "frontend-design"
# or copy skills/frontend-design into .claude/skills/

# Anti-slop audit for existing UI (scanner + rewrite guidance)
git clone https://github.com/funboy322/avoid-ai-design .claude/skills/avoid-ai-design
```

Optional, review first and pick at most one of these "taste" skills (they overlap):
`h3nryprod01/design-taste` (merges emil-design-eng, impeccable, taste-skill), `mbdev3/taste-skill`,
`Vinayak-Shukla-03/anti-ai-slop`.

Also useful:
- **Neon AI rules** (`neondatabase-labs/ai-rules`) — Drizzle + Neon serverless driver patterns.
- Library `llms.txt` docs: Next.js (`nextjs.org/docs/llms.txt`), Better Auth, oRPC, Drizzle — tell Claude to fetch these instead of guessing APIs.

## 2. When each skill is used

| Situation | Skill | How |
|-----------|-------|-----|
| Building any new page/component | `frontend-design` + this repo's `docs/11-design-system.md` | The design system overrides the skill where they conflict (e.g. we are light-only, brand green, Figtree). Tell Claude: "Follow docs/11 tokens; use frontend-design for craft, not for choosing a new aesthetic." |
| Writing React/Next.js code, data fetching | `react-best-practices` | Especially waterfalls, bundle size, RSC serialization rules |
| Component APIs with many variants | `composition-patterns` | Compound components instead of boolean-prop soup |
| Finishing any UI task | `web-design-guidelines` | "Review changed UI files against web-design-guidelines" |
| Finishing any UI task | `avoid-ai-design` | Run its scanner on changed files; fix P0/P1 |
| Writing copy, emails, docs | Vercel `writing-guidelines` skill (from the same repo) + `docs/11 §7` | Our banned-words list wins |
| Mobile (Phase 14) | `vercel-react-native-skills` | Lists, animations, monorepo |

## 3. Project-specific skills to create (with `skill-creator`) as patterns stabilize

Create these after Phase 2–4 once the patterns exist in code, so they encode real conventions:

1. `tokslearn-new-procedure` — steps to add a feature end to end: contract schema → core service + rules + tests → procedure → client hook → UI → parity check.
2. `tokslearn-ledger-change` — checklist for any money-moving change (balanced entries, idempotency, tests from `08 §12`).
3. `tokslearn-ui-review` — runs design audit steps from `11 §9` in order and reports.
4. `tokslearn-migration` — expand/contract migration workflow with Drizzle and Neon branches.

## 4. Suggested `.claude/settings.json` hooks (optional)

- Post-edit hook on `*.tsx`: run `pnpm biome check --write <file>`.
- Pre-commit (husky/lefthook, not Claude-specific): typecheck affected packages, copy check.
