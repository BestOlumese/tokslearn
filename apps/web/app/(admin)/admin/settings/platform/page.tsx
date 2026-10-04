import type { PlatformSettingDto } from '@tokslearn/contract'
import * as admin from '@tokslearn/core/admin'
import { hasRole } from '@tokslearn/core/kernel'
import { MAX_DURATION_MIN } from '@tokslearn/core/live'
import { VIDEO_MAX_BYTES } from '@tokslearn/core/media'
import { Skeleton } from '@tokslearn/ui/skeleton'
import type { Metadata } from 'next'
import { Suspense } from 'react'
import { AdminPageHeader } from '@/components/admin/admin-page-header'
import { PlatformSettingForm } from '@/components/admin/platform-setting-form'
import { staffErrorState } from '@/components/admin/staff-error'
import { formatDateTime, formatNaira } from '@/lib/format'
import { requireSignedInCtx } from '@/lib/require-user'

export const metadata: Metadata = { title: 'Platform settings' }

const groups: ReadonlyArray<[admin.SettingGroup, string]> = [
  ['refunds', 'Refunds'],
  ['payouts', 'Payouts'],
  ['checkout', 'Checkout'],
  ['reviews', 'Reviews'],
]

// docs/20 §6 `/admin/settings/platform` (super admin edits; finance and admins read). Each change
// needs a fresh 2FA code and is in the audit log (ADR-047).
export default function PlatformSettingsPage() {
  return (
    <div>
      <AdminPageHeader
        title="Platform settings"
        description="Rules the platform runs on. Changes apply from the moment you save, and each one is in the audit log."
      />
      <Suspense fallback={<Skeleton className="h-96 w-full rounded-card" />}>
        <Settings />
      </Suspense>
    </div>
  )
}

async function Settings() {
  const path = '/admin/settings/platform'
  const ctx = await requireSignedInCtx(path)
  let items: admin.PlatformSetting[]
  try {
    items = await admin.listPlatformSettings(ctx)
  } catch (error) {
    return staffErrorState(error, path)
  }
  const canEdit = ctx.actor.kind === 'user' && hasRole(ctx.actor, 'super_admin')
  const dto = (s: admin.PlatformSetting): PlatformSettingDto => ({
    ...s,
    options: s.options ? [...s.options] : undefined,
    updatedAt: s.updatedAt ? s.updatedAt.toISOString() : null,
  })
  return (
    <div className="flex max-w-[860px] flex-col gap-8">
      {canEdit ? null : (
        <p className="rounded-card border border-border bg-surface p-4 text-body-sm text-ink-2">
          Only a super admin can change these. You can see the current values.
        </p>
      )}
      {groups.map(([group, label]) => (
        <section key={group} aria-labelledby={`group-${group}`}>
          <h2 id={`group-${group}`} className="text-h3 text-ink">
            {label}
          </h2>
          <ul className="mt-3 flex flex-col divide-y divide-border rounded-card border border-border bg-surface">
            {items
              .filter((s) => s.group === group)
              .map((s) => (
                <li key={s.key} className="flex flex-col gap-3 p-4">
                  <div>
                    <p className="text-body font-medium text-ink">{s.label}</p>
                    <p className="max-w-prose text-body-sm text-ink-2">{s.description}</p>
                    {s.updatedAt ? (
                      <p className="mt-1 text-caption text-ink-3">
                        Changed {formatDateTime(s.updatedAt)}
                      </p>
                    ) : null}
                  </div>
                  {canEdit ? (
                    <PlatformSettingForm setting={dto(s)} />
                  ) : (
                    <p className="text-body text-ink tabular-nums">{display(s)}</p>
                  )}
                </li>
              ))}
          </ul>
        </section>
      ))}
      <section aria-labelledby="fixed-title">
        <h2 id="fixed-title" className="text-h3 text-ink">
          Fixed in the code for now
        </h2>
        <ul className="mt-3 flex flex-col divide-y divide-border rounded-card border border-border bg-surface text-body">
          <li className="flex justify-between gap-3 p-4">
            <span className="text-ink-2">Largest video upload</span>
            <span className="text-ink tabular-nums">
              {Math.round(VIDEO_MAX_BYTES / 1024 ** 3)} GB
            </span>
          </li>
          <li className="flex justify-between gap-3 p-4">
            <span className="text-ink-2">Longest live class</span>
            <span className="text-ink tabular-nums">{MAX_DURATION_MIN / 60} hours</span>
          </li>
        </ul>
      </section>
    </div>
  )
}

function display(s: admin.PlatformSetting): string {
  if (s.kind === 'kobo') return formatNaira(String(s.value))
  if (s.kind === 'dates')
    return Array.isArray(s.value) && s.value.length > 0 ? s.value.join(', ') : 'None'
  if (s.kind === 'choice')
    return s.options?.find((o) => o.value === s.value)?.label ?? String(s.value)
  return String(s.value)
}
