# 11 — Design System (light only, clean, professional, not generic)

Direction: **calm, trustworthy, content-first.** Think a well-edited textbook crossed with a modern
product: generous whitespace, strong typography, one confident brand color used with restraint,
real course imagery doing the visual work. It must not look like a template or like
"AI-generated SaaS".

These are starting tokens. Phase 0 builds a `/styleguide` page (staff-only) showing every token and
component; adjust tokens there, not ad hoc in components.

## 1. Color tokens (`packages/ui/tokens.css`)

Light theme only. No `dark:` variants anywhere. Do not add a theme toggle.

```css
@theme {
  /* Neutrals — slightly cool, not pure grey */
  --color-canvas:        #F6F7F6;  /* page background */
  --color-surface:       #FFFFFF;  /* cards, panels, inputs */
  --color-surface-sunken:#EEF0EF;  /* wells, table headers, code blocks */
  --color-border:        #E1E5E3;
  --color-border-strong: #C7CDCA;

  --color-ink:           #13181D;  /* primary text */
  --color-ink-2:         #46505A;  /* secondary text */
  --color-ink-3:         #66707A;  /* muted text, meets 4.5:1 on white */
  --color-ink-inverse:   #FFFFFF;

  /* Brand — Tokslearn green */
  --color-brand:         #0E6B4E;  /* primary actions, links, active states */
  --color-brand-hover:   #0B5941;
  --color-brand-press:   #094A36;
  --color-brand-soft:    #E6F2EC;  /* selected rows, subtle highlights */
  --color-brand-ink:     #0A4F3A;  /* text on brand-soft */

  /* Accent — warm amber, used sparingly (streaks, "new", highlights) */
  --color-accent:        #B86E0A;
  --color-accent-soft:   #FCF1DF;
  --color-accent-ink:    #7A4905;  /* text on accent-soft (accent itself is 3.6:1 there, fails AA) */

  /* Status */
  --color-info:          #1D5DA8;  --color-info-soft:    #E7F0FA;
  --color-success:       #0E6B4E;  --color-success-soft: #E6F2EC;
  --color-warning:       #9A5B00;  --color-warning-soft: #FDF3E1;
  --color-danger:        #B42318;  --color-danger-soft:  #FDECEA;

  --color-focus:         #1D5DA8;  /* focus ring, distinct from brand */
}
```

Usage rules:
- Brand green appears on: primary buttons, links, progress bars, selected nav item, checkmarks. That's it. Most of the screen is neutral.
- **One primary button per view.** Other actions are secondary (outlined) or tertiary (text).
- Amber is an accent, never a second primary. Max one amber element per screen.
- No gradients on UI surfaces. The only allowed gradient is a subtle scrim on top of course cover images for text legibility.
- Text on color must pass WCAG AA (4.5:1 body, 3:1 large). Verify with the audit script.

## 2. Typography

- Family: **Figtree** (variable, via `next/font/google`, subsets `latin`, `display: swap`, self-hosted by Next). Weights used: 400, 500, 600, 700.
- Code: **JetBrains Mono** 400/500, loaded only on routes that render code.
- Numbers: `font-variant-numeric: tabular-nums` for prices, stats, timers, tables.

| Token | Size / line-height | Weight | Use |
|-------|-------------------|--------|-----|
| `display` | 44/52 (mobile 34/42) | 700, tracking -0.02em | Home hero only |
| `h1` | 34/42 (mobile 28/36) | 700, -0.015em | Page titles |
| `h2` | 26/34 | 600 | Section titles |
| `h3` | 20/28 | 600 | Card titles, panel titles |
| `h4` | 17/24 | 600 | Small headings |
| `body-lg` | 18/28 | 400 | Course descriptions, articles |
| `body` | 16/24 | 400 | Default |
| `body-sm` | 14/20 | 400/500 | Meta, table cells |
| `caption` | 12/16 | 500 | Labels, badges |

Article/lesson prose: max width 68ch, `body-lg`, paragraph spacing 1em, headings with clear top margins.

## 3. Space, radius, elevation, layout

- Spacing scale (px): 4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80. Vertical rhythm between page sections: 64 desktop / 40 mobile.
- Radius: controls 6px, cards/panels 10px, dialogs 12px, pills/avatars full. Do not round everything to 16–24px.
- Elevation: prefer **1px borders** over shadows. Shadows only for floating layers:
  `--shadow-pop: 0 8px 24px rgb(19 24 29 / 0.10), 0 2px 6px rgb(19 24 29 / 0.06)`.
- Containers: page max-width 1200px (catalog 1280), gutters 16 (mobile) / 24 / 32.
- Grid: 12 columns desktop; course grids 4 → 3 → 2 → 1 columns by breakpoint.
- Breakpoints: 640, 768, 1024, 1280.
- Motion: 120–180 ms, ease-out for enter, ease-in for exit. No bouncy springs, no parallax, no scroll-jacking. Respect `prefers-reduced-motion`.

## 4. Components (restyle shadcn/ui to these specs)

- **Button**: heights 36 (sm) / 40 (md) / 48 (lg, checkout only). Primary = brand bg, white text; Secondary = white bg, border-strong, ink text; Tertiary = text only, brand ink; Danger = danger bg. States: hover, active, focus-visible (2px focus ring, 2px offset), disabled (40% opacity, no pointer), loading (spinner replaces icon, keeps width).
- **Input/Select/Textarea**: 40px height, 1px border, 6px radius, label above (never placeholder-as-label), helper text below, error text in danger with icon. Focus: border brand + focus ring.
- **Course card**: cover image 16:9 (real image, never an icon on a gradient), title (2 lines max, h4), instructor name, rating (only with ≥ 3 reviews: "4.7 (128)"), duration + lesson count, price (tabular, strikethrough compare-at in ink-3), badges max 1 ("Certificate", "Cohort starts 3 Nov", "Free"). Hover: border-strong + cover scale 1.02 (image only). Whole card is one link.
- **Progress**: 6px bar, brand fill on sunken track; percentage text next to it.
- **Tabs, Dialog, Sheet, Popover, Toast, Tooltip, Table, Badge, Avatar, Skeleton, Empty state** — each with defined states in `/styleguide`.
- **Empty states**: one sentence stating what goes here + one action. No illustrations of floating people.
- **Skeletons**: match final layout exactly (prevents CLS). Use for streamed Suspense content.
- **Icons**: Lucide, stroke 1.75, 16/20/24. Icons accompany labels; icon-only buttons need `aria-label` + tooltip. **No emoji as icons.**

## 5. Page patterns

- **Home**: left-aligned hero with a concrete promise and a search field (not a centered headline + two buttons + pill badge). Below: categories as a simple list/grid of text links with counts, then course rows ("Popular in Data", "Starting soon: cohorts", "Free to start"), then instructor call-to-action, then real numbers (courses, learners — only once they are real).
- **Course landing**: two-column desktop (content left, sticky purchase panel right with price, refund policy in plain words, what's included, certificate type). Mobile: purchase bar fixed at bottom. Sections: what you'll learn, curriculum (collapsible sections, preview lessons marked), instructor, reviews, FAQ (refund rules, certificate, access duration).
- **Dashboards (learner/instructor/admin)**: left nav (collapsible), dense but calm tables, filters in a single row, page title + one primary action top-right.
- **Forms**: single column, max 560px, grouped with section headings, sticky save bar for long forms (studio).

## 6. Anti-generic rules (the "AI slop" ban list)

Do not produce:
1. Purple/indigo/violet gradients, or any gradient backgrounds on sections/buttons/text.
2. Gradient-filled or clipped text headlines.
3. Centered hero with pill badge ("✨ New") + headline + two buttons + screenshot mockup.
4. Three-column "feature" grids with an icon in a rounded square above a bolded two-word title.
5. Glassmorphism, blurred blobs, glowing orbs, noise textures, floating 3D shapes.
6. Every element in a rounded card with a drop shadow; cards inside cards.
7. Emoji in UI copy or as icons.
8. Fake social proof, logo walls of companies we don't work with, invented testimonials or stats.
9. Stock illustrations of generic people; abstract "learning" illustrations. Use real course covers and real instructor photos.
10. Uniform section rhythm (hero → features → testimonials → CTA → footer) with identical padding.
11. Tailwind defaults left untouched (indigo-500, gray-*, `rounded-2xl shadow-xl`).
12. The "tasteful AI" fallback: cream paper background + serif display + terracotta accent. We are neither.

Do instead: strong typographic hierarchy, alignment to a grid, real content density, asymmetric
layouts where they help scanning, color reserved for meaning.

## 7. Voice and copy

Plain, specific, respectful. Nigerian English readers; avoid Americanisms that confuse, avoid slang.
Write the way a good teacher speaks.

- Say what happens: "You'll get a certificate after you pass a 60-minute exam" not "Earn a credential that showcases your skills".
- Use numbers: "12 lessons · 3 h 40 min", "Refunds within 7 days if you've watched less than 30%".
- Buttons are verbs describing the result: "Buy course — ₦15,000", "Start lesson", "Submit assignment". Not "Get started", "Learn more", "Unlock".
- Errors say what went wrong and what to do: "Your card was declined. Try another card or pay by bank transfer."
- Sentence case everywhere (not Title Case).

**Banned words/phrases** (lint with a copy check script over `*.tsx` string literals and MDX):
unlock, unleash, elevate, empower, supercharge, seamless(ly), effortless(ly), cutting-edge,
game-changer, revolutionize, transform your, journey (as metaphor), dive in / deep dive, delve,
embark, navigate the (landscape/world), in today's fast-paced world, whether you're X or Y,
look no further, take your X to the next level, world-class, best-in-class, leverage (as verb),
synergy, robust (in marketing copy), holistic, tailored, curated (unless literally curated),
"Ready to…?" CTAs, excessive em dashes (max one per paragraph), exclamation marks (max one per page).

## 8. Accessibility (non-negotiable)

- WCAG 2.2 AA. Keyboard-complete (player, exam, studio drag-and-drop has keyboard alternative).
- Visible focus everywhere (`:focus-visible` ring).
- Semantic HTML first; ARIA only when needed. Form labels, error association (`aria-describedby`).
- Captions for video when available; transcripts later.
- Touch targets ≥ 44×44 on mobile.
- Color is never the only signal (icons/text for status).

## 9. Design audit before closing any UI task

1. Run the `web-design-guidelines` skill review on changed files (see `18`).
2. Run the anti-slop audit skill (`avoid-ai-design` or equivalent) on changed files; fix all P0/P1.
3. Run `pnpm copy:check` (banned words).
4. Check the page at 360px, 768px, 1280px widths.
5. Lighthouse (mobile) ≥ 95 for public pages, accessibility = 100.
