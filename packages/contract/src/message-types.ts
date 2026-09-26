export type ErrorStatus =
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'BAD_REQUEST'
  | 'UNPROCESSABLE_CONTENT'
  | 'TOO_MANY_REQUESTS'
  | 'PRECONDITION_FAILED'
  | 'SERVICE_UNAVAILABLE'
  | 'INTERNAL_SERVER_ERROR'

export interface ErrorEntry {
  status: ErrorStatus
  message: string
}
