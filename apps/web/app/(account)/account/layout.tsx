import type { ReactNode } from 'react'
import { QueryProvider } from '@/components/query-provider'

export default function AccountLayout({ children }: { children: ReactNode }) {
  return <QueryProvider>{children}</QueryProvider>
}
