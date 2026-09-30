// Community calls for the learner side (player tabs, community and cohort pages). Plain fetch
// against /api/v1 like the rest of the player (lib/learn-api.ts), no oRPC client.

import type {
  RichTextDoc,
  ScopeType,
  ThreadDto,
  ThreadFilter,
  ThreadKind,
  ThreadSummaryDto,
} from '@tokslearn/contract'
import { shopApi } from './shop'

export type { ThreadDto, ThreadSummaryDto }

export interface ThreadPage {
  items: ThreadSummaryDto[]
  hasMore: boolean
  canAnnounce: boolean
}

export function listThreads(
  courseId: string,
  opts: {
    scope?: { type: ScopeType; id: string } | undefined
    filter?: ThreadFilter | undefined
    page?: number | undefined
  } = {},
) {
  const q = new URLSearchParams()
  if (opts.scope) {
    q.set('scopeType', opts.scope.type)
    q.set('scopeId', opts.scope.id)
  }
  if (opts.filter && opts.filter !== 'all') q.set('filter', opts.filter)
  if (opts.page) q.set('page', String(opts.page))
  const qs = q.toString()
  return shopApi<ThreadPage>(`/courses/${courseId}/threads${qs ? `?${qs}` : ''}`)
}

export const getThread = (threadId: string) => shopApi<ThreadDto>(`/threads/${threadId}`)

export const createThread = (input: {
  scopeType: ScopeType
  scopeId: string
  kind: ThreadKind
  title: string
  body: RichTextDoc
}) => shopApi<ThreadDto>('/threads', { method: 'POST', body: input })

export const replyTo = (threadId: string, body: RichTextDoc, parentId: string | null = null) =>
  shopApi<ThreadDto>(`/threads/${threadId}/replies`, {
    method: 'POST',
    body: { threadId, body, parentId },
  })

export const likePost = (postId: string, on: boolean) =>
  shopApi<{ likes: number; likedByMe: boolean }>(`/posts/${postId}/like`, {
    method: 'POST',
    body: { postId, on },
  })

export const acceptAnswer = (threadId: string, postId: string | null) =>
  shopApi<ThreadDto>(`/threads/${threadId}/accept`, {
    method: 'POST',
    body: { threadId, postId },
  })

type Target = { targetType: 'thread' | 'post'; targetId: string }

export const reportPost = (target: Target, reason: string) =>
  shopApi('/community/report', { method: 'POST', body: { ...target, reason } })

export const moderatePost = (
  target: Target,
  action: 'hide' | 'unhide' | 'lock' | 'unlock' | 'pin' | 'unpin',
) => shopApi('/community/moderate', { method: 'POST', body: { ...target, action } })

export const deleteOwnPost = (target: Target) =>
  shopApi('/community/delete', { method: 'POST', body: target })
