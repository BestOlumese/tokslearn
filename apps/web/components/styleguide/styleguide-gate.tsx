import { canViewStyleguide } from '@tokslearn/core/admin'
import { Forbidden } from '@/components/forbidden'
import { getServerCtx } from '@/lib/server-ctx'
import { Styleguide } from './styleguide'

export async function StyleguideGate() {
  const ctx = await getServerCtx()
  if (!canViewStyleguide(ctx.actor)) {
    return (
      <div className="mx-auto max-w-page px-4 pt-10 sm:px-6 lg:px-8">
        <Forbidden />
      </div>
    )
  }
  return <Styleguide />
}
