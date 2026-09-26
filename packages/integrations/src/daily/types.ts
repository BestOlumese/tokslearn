/** Live classes boundary (Daily, ADR-008). Implemented in Phase 8. */
export interface LiveProvider {
  createRoom(input: {
    name: string
    startsAt: Date
    endsAt: Date
    maxParticipants: number
  }): Promise<{ roomName: string; url: string }>
  createMeetingToken(input: {
    roomName: string
    userId: string
    isOwner: boolean
    expiresAt: Date
  }): Promise<string>
}
