import { colors } from '@tokslearn/ui/tokens'
import { Section } from './section'

const groups: ReadonlyArray<{ title: string; keys: ReadonlyArray<keyof typeof colors> }> = [
  { title: 'Neutrals', keys: ['canvas', 'surface', 'surfaceSunken', 'border', 'borderStrong'] },
  { title: 'Text', keys: ['ink', 'ink2', 'ink3', 'inkInverse'] },
  { title: 'Brand', keys: ['brand', 'brandHover', 'brandPress', 'brandSoft', 'brandInk'] },
  { title: 'Accent (max one per screen)', keys: ['accent', 'accentSoft', 'accentInk'] },
  {
    title: 'Status',
    keys: [
      'info',
      'infoSoft',
      'success',
      'successSoft',
      'warning',
      'warningSoft',
      'danger',
      'dangerSoft',
      'focus',
    ],
  },
]

const kebab = (key: string) => key.replace(/([A-Z0-9])/g, '-$1').toLowerCase()

const typeScale = [
  { token: 'display', spec: '44/52 · 700 (mobile 34/42)', cls: 'text-display' },
  { token: 'h1', spec: '34/42 · 700 (mobile 28/36)', cls: 'text-h1' },
  { token: 'h2', spec: '26/34 · 600', cls: 'text-h2' },
  { token: 'h3', spec: '20/28 · 600', cls: 'text-h3' },
  { token: 'h4', spec: '17/24 · 600', cls: 'text-h4' },
  { token: 'body-lg', spec: '18/28 · 400', cls: 'text-body-lg' },
  { token: 'body', spec: '16/24 · 400', cls: 'text-body' },
  { token: 'body-sm', spec: '14/20 · 400/500', cls: 'text-body-sm' },
  { token: 'caption', spec: '12/16 · 500', cls: 'text-caption' },
] as const

const spacing = [4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80]

export function TokensSection() {
  return (
    <>
      <Section
        id="color"
        title="Color"
        note="Brand green is for primary actions, links, progress, the selected nav item and checkmarks. Most of the screen stays neutral."
      >
        <div className="flex flex-col gap-8">
          {groups.map((group) => (
            <div key={group.title}>
              <h3 className="text-h4 text-ink">{group.title}</h3>
              <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                {group.keys.map((key) => (
                  <li
                    key={key}
                    className="overflow-hidden rounded-card border border-border bg-surface"
                  >
                    <div
                      className="h-14 border-b border-border"
                      style={{ backgroundColor: colors[key] }}
                    />
                    <div className="px-3 py-2">
                      <p className="font-mono text-caption text-ink">{kebab(key)}</p>
                      <p className="font-mono text-caption text-ink-3">{colors[key]}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Section>

      <Section
        id="type"
        title="Typography"
        note="Figtree 400/500/600/700. Numbers in prices, stats and tables use tabular figures."
      >
        <ul className="divide-y divide-border rounded-card border border-border bg-surface">
          {typeScale.map((t) => (
            <li
              key={t.token}
              className="grid gap-2 px-5 py-4 md:grid-cols-[10rem_1fr] md:items-baseline"
            >
              <div>
                <p className="font-mono text-caption text-ink">{t.token}</p>
                <p className="text-caption text-ink-3">{t.spec}</p>
              </div>
              <p className={`${t.cls} text-ink`}>Learn Excel for accounting in 12 lessons</p>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-body text-ink-2">
          Tabular figures:{' '}
          <span className="tabular-nums text-ink">₦15,000 · ₦1,250,000 · 3 h 40 min</span>
        </p>
      </Section>

      <Section
        id="space"
        title="Space, radius and elevation"
        note="Prefer 1 px borders to shadows. Shadows are for floating layers only."
      >
        <div className="grid gap-8 lg:grid-cols-2">
          <ul className="flex flex-col gap-2">
            {spacing.map((px) => (
              <li key={px} className="flex items-center gap-3">
                <span className="w-10 text-right font-mono text-caption text-ink-3 tabular-nums">
                  {px}
                </span>
                <span className="h-3 rounded-full bg-brand-soft" style={{ width: px * 3 }} />
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap items-start gap-4">
            <div className="flex size-28 items-end rounded-control border border-border-strong bg-surface p-2 text-caption text-ink-2">
              control · 6
            </div>
            <div className="flex size-28 items-end rounded-card border border-border-strong bg-surface p-2 text-caption text-ink-2">
              card · 10
            </div>
            <div className="flex size-28 items-end rounded-dialog border border-border-strong bg-surface p-2 text-caption text-ink-2">
              dialog · 12
            </div>
            <div className="flex size-28 items-end rounded-card bg-surface p-2 text-caption text-ink-2 shadow-pop">
              shadow-pop
            </div>
          </div>
        </div>
      </Section>
    </>
  )
}
