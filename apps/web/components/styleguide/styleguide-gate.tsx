import { canViewStyleguide } from '@tokslearn/core/admin'
import type { ReactNode } from 'react'
import { Forbidden } from '@/components/forbidden'
import { getServerCtx } from '@/lib/server-ctx'
import { Styleguide } from './styleguide'

/** Staff-only outside local/preview (docs/20 §6 `/styleguide`). */
export async function StyleguideGateFor({ children }: { children: ReactNode }) {
  const ctx = await getServerCtx()
  if (!canViewStyleguide(ctx.actor)) {
    return (
      <div className="mx-auto max-w-page px-4 pt-10 sm:px-6 lg:px-8">
        <Forbidden />
      </div>
    )
  }
  return children
}

export async function StyleguideGate() {
  return (
    <StyleguideGateFor>
      <Styleguide />
    </StyleguideGateFor>
  )
}
