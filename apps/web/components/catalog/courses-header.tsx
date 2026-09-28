import { HeaderSearch } from '@/components/site/header-search'
import { PageHeader } from '@/components/site/page-header'

export function CoursesHeader() {
  return (
    <PageHeader
      title="All courses"
      description="Prices in naira, refund windows shown before you pay."
      width="catalog"
    >
      <HeaderSearch className="mt-6 max-w-[560px]" />
    </PageHeader>
  )
}
