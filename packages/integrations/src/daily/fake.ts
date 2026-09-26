import type { LiveProvider } from './types'

export function createFakeDaily(): LiveProvider {
  return {
    async createRoom({ name }) {
      return { roomName: name, url: `https://tokslearn.daily.test/${name}` }
    },
    async createMeetingToken({ roomName, userId, isOwner }) {
      return `fake-token:${roomName}:${userId}:${isOwner ? 'owner' : 'guest'}`
    },
  }
}
