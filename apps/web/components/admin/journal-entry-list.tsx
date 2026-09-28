import type * as ledger from '@tokslearn/core/ledger'
import { formatDateTime, formatNaira } from '@/lib/format'

/** Journal entries with their lines, debits and credits side by side (read-only). */
export function JournalEntryList({ entries }: { entries: ReadonlyArray<ledger.JournalEntryView> }) {
  if (entries.length === 0) {
    return <p className="text-body-sm text-ink-2">No ledger entries.</p>
  }
  return (
    <ul className="flex flex-col gap-4">
      {entries.map((e) => (
        <li key={e.id} className="rounded-card border border-border bg-surface">
          <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border px-4 py-3">
            <p className="text-body-sm font-medium text-ink">
              <span className="capitalize">{e.kind.replace('_', ' ')}</span>{' '}
              <span className="font-mono text-ink-2">{e.publicId}</span>
            </p>
            <p className="text-body-sm text-ink-2">
              {e.description ? `${e.description} · ` : ''}
              {formatDateTime(e.postedAt)}
            </p>
          </div>
          <table className="w-full text-body-sm">
            <caption className="sr-only">Lines of entry {e.publicId}</caption>
            <thead>
              <tr className="text-left text-ink-2">
                <th scope="col" className="px-4 py-2 font-medium">
                  Account
                </th>
                <th scope="col" className="px-4 py-2 text-right font-medium">
                  Debit
                </th>
                <th scope="col" className="px-4 py-2 text-right font-medium">
                  Credit
                </th>
              </tr>
            </thead>
            <tbody>
              {e.lines.map((l) => (
                <tr key={l.id} className="border-t border-border">
                  <td className="px-4 py-2 font-mono text-ink">{l.account}</td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {l.direction === 'debit' ? formatNaira(l.amountKobo) : ''}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {l.direction === 'credit' ? formatNaira(l.amountKobo) : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </li>
      ))}
    </ul>
  )
}
