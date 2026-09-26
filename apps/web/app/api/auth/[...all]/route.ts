import type { NextRequest } from 'next/server'
import { getAuth } from '@/lib/auth'

// Better Auth endpoints: sign-up/in, OTP, 2FA, OAuth callbacks, sessions (docs/07 §2).
const handle = (request: NextRequest) => getAuth().handler(request)

export const GET = handle
export const POST = handle
