// Human-readable device and IP hints for the sessions list and security emails.
// Deliberately coarse: no fingerprinting, no geolocation service.

const browsers: ReadonlyArray<[RegExp, string]> = [
  [/Tokslearn\//, 'Tokslearn app'],
  [/Edg\//, 'Edge'],
  [/OPR\/|Opera/, 'Opera'],
  [/SamsungBrowser\//, 'Samsung Internet'],
  [/Firefox\//, 'Firefox'],
  [/Chrome\//, 'Chrome'],
  [/Safari\//, 'Safari'],
]

const systems: ReadonlyArray<[RegExp, string]> = [
  [/Android/, 'Android'],
  [/iPhone|iPad|iPod/, 'iPhone'],
  [/Windows/, 'Windows'],
  [/Mac OS X|Macintosh/, 'Mac'],
  [/CrOS/, 'Chromebook'],
  [/Linux/, 'Linux'],
]

export function describeDevice(userAgent: string | null | undefined): string {
  if (!userAgent) return 'Unknown device'
  const browser = browsers.find(([re]) => re.test(userAgent))?.[1]
  const system = systems.find(([re]) => re.test(userAgent))?.[1]
  if (browser && system) return `${browser} on ${system}`
  return browser ?? system ?? 'Unknown device'
}

/** `102.89.34.7` → `102.89.x.x`; IPv6 keeps the first two groups. */
export function ipHint(ip: string | null | undefined): string | null {
  if (!ip) return null
  if (ip.includes(':')) {
    const groups = ip.split(':').filter(Boolean)
    return groups.length >= 2 ? `${groups[0]}:${groups[1]}:…` : null
  }
  const parts = ip.split('.')
  return parts.length === 4 ? `${parts[0]}.${parts[1]}.x.x` : null
}
