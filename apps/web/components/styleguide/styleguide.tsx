import { ControlsSection } from './controls-section'
import { DisplaySection } from './display-section'
import { OverlaysSection } from './overlays-section'
import { TokensSection } from './tokens-section'

const contents = [
  ['color', 'Color'],
  ['type', 'Typography'],
  ['space', 'Space'],
  ['buttons', 'Buttons'],
  ['inputs', 'Text fields'],
  ['choices', 'Choices'],
  ['overlays', 'Overlays'],
  ['tabs', 'Tabs'],
  ['toast', 'Toast'],
  ['badges', 'Badges'],
  ['progress', 'Progress'],
  ['table', 'Table'],
  ['empty', 'Empty state'],
] as const

/** Every token and component state (docs/11). Adjust tokens here, not ad hoc in components. */
export function Styleguide() {
  return (
    <div className="mx-auto max-w-page px-4 pt-10 sm:px-6 lg:px-8">
      <h1 className="text-h1-sm text-ink sm:text-h1">Styleguide</h1>
      <p className="mt-2 max-w-prose text-body text-ink-2">
        Tokens and components from docs/11-design-system.md. Light theme only.
      </p>
      <nav aria-label="Styleguide sections" className="mt-6">
        <ul className="flex flex-wrap gap-x-4 gap-y-1">
          {contents.map(([id, label]) => (
            <li key={id}>
              <a
                href={`#${id}`}
                className="inline-flex min-h-11 items-center text-body-sm text-brand underline-offset-4 hover:underline"
              >
                {label}
              </a>
            </li>
          ))}
        </ul>
      </nav>
      <div className="mt-6">
        <TokensSection />
        <ControlsSection />
        <OverlaysSection />
        <DisplaySection />
      </div>
    </div>
  )
}
