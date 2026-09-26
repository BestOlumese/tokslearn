import type { Route } from 'next'
import { redirect } from 'next/navigation'

export default async function CoursePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  redirect(`/teach/courses/${id}/details` as Route)
}
