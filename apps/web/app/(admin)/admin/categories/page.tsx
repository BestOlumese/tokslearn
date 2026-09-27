import { type AdminCategory, listAdminCategories } from '@tokslearn/core/catalog'
import { Skeleton } from '@tokslearn/ui/skeleton'
import type { Metadata, Route } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'
import { AdminPageHeader } from '@/components/admin/admin-page-header'
import { CategoryDialog } from '@/components/admin/category-dialog'
import { CategoryRowActions } from '@/components/admin/category-row-actions'
import { staffErrorState } from '@/components/admin/staff-error'
import { requireSignedInCtx } from '@/lib/require-user'

export const metadata: Metadata = { title: 'Categories' }

// docs/20 §6 `/admin/categories` (admin). Two levels, ordered by hand. A category in use can't
// be deleted (CATEGORY_IN_USE); renamed URLs redirect.
export default function AdminCategoriesPage() {
  return (
    <div>
      <AdminPageHeader
        title="Categories"
        description="The categories learners browse and instructors file courses under. The order here is the order on the site."
      />
      <Suspense fallback={<CategoriesSkeleton />}>
        <Categories />
      </Suspense>
    </div>
  )
}

const courses = (n: number) => (n === 1 ? '1 course' : `${n} courses`)

async function Categories() {
  const path = '/admin/categories'
  const ctx = await requireSignedInCtx(path)
  let tree: AdminCategory[]
  try {
    tree = await listAdminCategories(ctx)
  } catch (error) {
    return <div className="mt-6">{staffErrorState(error, path)}</div>
  }

  return (
    <div className="mt-6 flex flex-col gap-5">
      <div>
        <CategoryDialog trigger="New top category" />
      </div>
      <ol className="flex flex-col gap-5">
        {tree.map((top, i) => (
          <li key={top.id} className="rounded-card border border-border bg-surface">
            <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <h2 className="text-h4 text-ink">
                  <Link
                    href={`/categories/${top.slug}` as Route}
                    className="underline-offset-4 hover:underline"
                  >
                    {top.name}
                  </Link>
                </h2>
                <p className="text-body-sm text-ink-2">
                  /categories/{top.slug} · {top.children.length} subcategories
                  {top.courseCount > 0 ? ` · ${courses(top.courseCount)} filed directly` : ''}
                </p>
                {top.description ? (
                  <p className="mt-1 max-w-prose text-body-sm text-ink-2">{top.description}</p>
                ) : null}
              </div>
              <CategoryRowActions
                category={top}
                index={i}
                siblings={tree.length}
                inUse={top.children.length > 0 || top.courseCount > 0}
              />
            </div>
            <ol className="divide-y divide-border border-t border-border">
              {top.children.map((sub, j) => (
                <li
                  key={sub.id}
                  className="flex flex-col gap-2 py-3 pr-4 pl-8 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="text-body font-medium text-ink">{sub.name}</p>
                    <p className="text-body-sm text-ink-2">
                      /categories/{sub.slug} · {courses(sub.courseCount)}
                    </p>
                  </div>
                  <CategoryRowActions
                    category={sub}
                    index={j}
                    siblings={top.children.length}
                    inUse={sub.courseCount > 0}
                  />
                </li>
              ))}
              <li className="py-3 pr-4 pl-8">
                <CategoryDialog
                  trigger="Add subcategory"
                  triggerLabel={`Add a subcategory to ${top.name}`}
                  parent={{ id: top.id, name: top.name }}
                />
              </li>
            </ol>
          </li>
        ))}
      </ol>
    </div>
  )
}

function CategoriesSkeleton() {
  return (
    <div className="mt-6 flex flex-col gap-5" aria-hidden>
      <Skeleton className="h-9 w-44" />
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} className="h-56 w-full rounded-card" />
      ))}
    </div>
  )
}
