import { createORPCClient } from '@orpc/client'
import { RPCLink } from '@orpc/client/fetch'
import type { ContractRouterClient } from '@orpc/contract'
import { createTanstackQueryUtils } from '@orpc/tanstack-query'
import { CLIENT_HEADER, type Contract } from '@tokslearn/contract'

// Browser-side API client (docs/06 §6). Server Components call core directly instead.
const link = new RPCLink({
  url: () => `${window.location.origin}/api/rpc`,
  headers: { [CLIENT_HEADER]: 'web' },
  fetch: (request, init) => fetch(request, { ...init, credentials: 'include' }),
})

export const api: ContractRouterClient<Contract> = createORPCClient(link)
export const orpc = createTanstackQueryUtils(api)
