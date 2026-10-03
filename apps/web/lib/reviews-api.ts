// The learner's review form calls. Plain fetch against /api/v1 like the rest of the player.
// (The public reviews page has its own dependency-free calls: components/reviews/review-actions.)

import type { MyReviewDto } from '@tokslearn/contract'
import { shopApi } from './shop'

export const saveReview = (courseId: string, rating: number, body: string | null) =>
  shopApi<MyReviewDto>(`/courses/${courseId}/review`, {
    method: 'POST',
    body: { courseId, rating, body },
  })

export const deleteReview = (courseId: string) =>
  shopApi<{ ok: true }>(`/courses/${courseId}/review/delete`, {
    method: 'POST',
    body: { courseId },
  })
