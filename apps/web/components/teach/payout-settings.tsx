'use client'
// Client component: `/teach/settings` identity and payout account sections (docs/20 §5), reusing
// the application steps. Replacing the account needs a recent 2FA code and starts a 72 h hold.

import type { MyApplicationDto } from '@tokslearn/contract'
import { useState } from 'react'
import { BankStep } from './bank-step'
import { IdentityStep } from './identity-step'

export function PayoutSettings({ initial }: { initial: MyApplicationDto }) {
  const [state, setState] = useState(initial)
  return (
    <div className="flex flex-col gap-6">
      <IdentityStep state={state} onSaved={setState} />
      <BankStep
        state={state}
        onSaved={setState}
        onVerifyIdentity={() => document.getElementById('step-identity-title')?.scrollIntoView()}
        stepUpPath="/teach/settings"
      />
    </div>
  )
}
