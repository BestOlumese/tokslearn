import type { ReactNode } from 'react'
import { cohortsOn } from '@/lib/catalog-data'
import type { RawParams } from '@/lib/catalog-params'
import { languageLabel, levelLabel } from '@/lib/format'

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? ''

function Group({ legend, children }: { legend: string; children: ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-2 border-b border-border pb-5 last:border-0">
      <legend className="mb-2 text-body-sm font-semibold text-ink">{legend}</legend>
      {children}
    </fieldset>
  )
}

function Choice({
  name,
  value,
  label,
  checked,
}: {
  name: string
  value: string
  label: string
  checked: boolean
}) {
  const id = `f-${name}-${value || 'any'}`
  return (
    <label
      htmlFor={id}
      className="flex min-h-9 cursor-pointer items-center gap-2.5 text-body-sm text-ink"
    >
      <input
        id={id}
        type="radio"
        name={name}
        value={value}
        defaultChecked={checked}
        className="size-4 accent-[var(--color-brand)]"
      />
      {label}
    </label>
  )
}

/**
 * Filters as a plain GET form (no client JS on public pages, docs/12 §1): the URL holds the state.
 * Hidden fields keep the search query or category the filters apply to.
 */
export async function CourseFilters({
  params,
  action,
  keep = [],
}: {
  params: RawParams
  action: string
  keep?: ReadonlyArray<string>
}) {
  const cohorts = await cohortsOn()
  const price = one(params.price) || 'any'
  const level = one(params.level)
  const duration = one(params.duration)
  const language = one(params.language)
  const form = (
    <form action={action} className="flex flex-col gap-5">
      {keep.map((k) =>
        one(params[k]) ? <input key={k} type="hidden" name={k} value={one(params[k])} /> : null,
      )}
      {one(params.sort) ? <input type="hidden" name="sort" value={one(params.sort)} /> : null}
      <Group legend="Price">
        <Choice name="price" value="any" label="Any price" checked={price === 'any'} />
        <Choice name="price" value="free" label="Free" checked={price === 'free'} />
        <Choice name="price" value="paid" label="Paid" checked={price === 'paid'} />
      </Group>
      <Group legend="Level">
        <Choice name="level" value="" label="Any level" checked={!level} />
        {Object.entries(levelLabel).map(([v, l]) => (
          <Choice key={v} name="level" value={v} label={l} checked={level === v} />
        ))}
      </Group>
      <Group legend="Length">
        <Choice name="duration" value="" label="Any length" checked={!duration} />
        <Choice
          name="duration"
          value="short"
          label="Under 2 hours"
          checked={duration === 'short'}
        />
        <Choice
          name="duration"
          value="medium"
          label="2 to 6 hours"
          checked={duration === 'medium'}
        />
        <Choice name="duration" value="long" label="Over 6 hours" checked={duration === 'long'} />
      </Group>
      <Group legend="Language">
        <label htmlFor="f-language" className="sr-only">
          Language
        </label>
        <select
          id="f-language"
          name="language"
          defaultValue={language}
          className="h-10 rounded-control border border-border-strong bg-surface px-3 text-body-sm text-ink"
        >
          <option value="">Any language</option>
          {Object.entries(languageLabel).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      </Group>
      <Group legend="Certificate">
        <label
          htmlFor="f-certificate"
          className="flex min-h-9 cursor-pointer items-center gap-2.5 text-body-sm text-ink"
        >
          <input
            id="f-certificate"
            type="checkbox"
            name="certificate"
            value="true"
            defaultChecked={one(params.certificate) === 'true'}
            className="size-4 accent-[var(--color-brand)]"
          />
          Includes a certificate
        </label>
      </Group>
      {cohorts ? (
        <Group legend="Format">
          <label
            htmlFor="f-cohort"
            className="flex min-h-9 cursor-pointer items-center gap-2.5 text-body-sm text-ink"
          >
            <input
              id="f-cohort"
              type="checkbox"
              name="cohort"
              value="true"
              defaultChecked={one(params.cohort) === 'true'}
              className="size-4 accent-[var(--color-brand)]"
            />
            Runs in a cohort, with a start date
          </label>
        </Group>
      ) : null}
      <div className="flex gap-3">
        <button
          type="submit"
          className="inline-flex h-10 items-center rounded-control bg-brand px-4 text-body-sm font-medium text-ink-inverse hover:bg-brand-hover"
        >
          Apply filters
        </button>
        <a
          href={`${action}${
            keep.some((k) => one(params[k]))
              ? `?${keep
                  .map((k) => (one(params[k]) ? `${k}=${encodeURIComponent(one(params[k]))}` : ''))
                  .filter(Boolean)
                  .join('&')}`
              : ''
          }`}
          className="inline-flex h-10 items-center px-2 text-body-sm font-medium text-brand-ink underline-offset-4 hover:underline"
        >
          Clear
        </a>
      </div>
    </form>
  )
  return (
    <>
      <details className="rounded-card border border-border bg-surface lg:hidden">
        <summary className="flex min-h-11 cursor-pointer items-center px-4 text-body font-medium text-ink">
          Filters
        </summary>
        <div className="border-t border-border p-4">{form}</div>
      </details>
      <aside aria-label="Filters" className="hidden lg:block">
        {form}
      </aside>
    </>
  )
}
