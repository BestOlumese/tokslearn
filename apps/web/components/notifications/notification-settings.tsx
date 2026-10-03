'use client'
// Client component: `/account/settings/notifications` (docs/20): one row per kind of notification
// with an email and an in-app switch. Receipts and decisions are always emailed.

import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { NotificationPreferenceDto } from '@tokslearn/contract'
import { Badge } from '@tokslearn/ui/badge'
import { Skeleton } from '@tokslearn/ui/skeleton'
import { Switch } from '@tokslearn/ui/switch'
import { useState } from 'react'
import { SettingsPanel } from '@/components/account/settings-panel'
import { FormAlert } from '@/components/auth/form-alert'
import { apiErrorMessage } from '@/lib/api-error'
import { api, orpc } from '@/lib/orpc'

const groups = [
  ['learning', 'Learning', 'About the courses you’re taking.'],
  [
    'community',
    'Discussions',
    'Replies, answers, mentions and announcements. Busy hours come as one email.',
  ],
  ['teaching', 'Teaching', 'If you teach on Tokslearn.'],
  ['purchases', 'Purchases', 'Receipts and enrolments.'],
] as const

export function NotificationSettings() {
  const options = orpc.notifications.preferences.get.queryOptions()
  const q = useQuery(options)
  const client = useQueryClient()
  const [error, setError] = useState<string | null>(null)
  if (q.isPending) return <Skeleton className="h-96 w-full rounded-card" />
  if (!q.data) return <FormAlert tone="error">{apiErrorMessage(q.error)}</FormAlert>

  const set = async (
    row: NotificationPreferenceDto,
    channel: 'email' | 'in_app',
    enabled: boolean,
  ) => {
    setError(null)
    try {
      client.setQueryData(
        options.queryKey,
        await api.notifications.preferences.set({ type: row.type, channel, enabled }),
      )
    } catch (e) {
      setError(apiErrorMessage(e))
    }
  }

  return (
    <>
      {error ? <FormAlert tone="error">{error}</FormAlert> : null}
      {groups.map(([group, title, description]) => {
        const rows = q.data.items.filter((r) => r.group === group)
        return (
          <SettingsPanel key={group} id={`notif-${group}`} title={title} description={description}>
            <table className="w-full text-left">
              <thead>
                <tr className="text-body-sm text-ink-2">
                  <th scope="col" className="pb-2 font-normal">
                    <span className="sr-only">Notification</span>
                  </th>
                  <th scope="col" className="w-20 pb-2 text-center font-medium">
                    Email
                  </th>
                  <th scope="col" className="w-20 pb-2 text-center font-medium">
                    In app
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border border-t border-border">
                {rows.map((r) => (
                  <tr key={r.type}>
                    <th scope="row" className="py-3 pr-3 font-normal">
                      <span className="block text-body-sm font-medium text-ink">{r.label}</span>
                      <span className="block text-body-sm text-ink-2">{r.description}</span>
                    </th>
                    <td className="py-3 text-center">
                      {r.emailLocked ? (
                        <Badge>Always</Badge>
                      ) : (
                        <Switch
                          aria-label={`Email: ${r.label}`}
                          checked={r.email}
                          onChange={(e) => set(r, 'email', e.target.checked)}
                        />
                      )}
                    </td>
                    <td className="py-3 text-center">
                      <Switch
                        aria-label={`In app: ${r.label}`}
                        checked={r.inApp}
                        onChange={(e) => set(r, 'in_app', e.target.checked)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </SettingsPanel>
        )
      })}
    </>
  )
}
