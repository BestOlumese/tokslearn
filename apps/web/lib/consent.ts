// Analytics consent (NDPA, docs/24 §1). Stored per browser; nothing loads before a "yes".
// The choice is mirrored onto <html data-consent> so CSS can hide the banner before first paint.

export type Consent = 'granted' | 'denied'

const KEY = 'tl_analytics_consent'
export const CONSENT_EVENT = 'tl:consent-change'

/** Runs inline in <head> before paint. Keep it tiny and dependency-free. */
export const consentBootScript = `try{var c=localStorage.getItem('${KEY}');if(c==='granted'||c==='denied')document.documentElement.dataset.consent=c}catch(e){}`

export function readConsent(): Consent | null {
  try {
    const value = window.localStorage.getItem(KEY)
    return value === 'granted' || value === 'denied' ? value : null
  } catch {
    return null
  }
}

export function writeConsent(value: Consent): void {
  try {
    window.localStorage.setItem(KEY, value)
  } catch {
    // Private mode or storage blocked: the choice lasts for this page view only.
  }
  document.documentElement.dataset.consent = value
  window.dispatchEvent(new CustomEvent<Consent>(CONSENT_EVENT, { detail: value }))
}

/** Shows the banner again so the visitor can change their answer. */
export function reopenConsent(): void {
  delete document.documentElement.dataset.consent
}
