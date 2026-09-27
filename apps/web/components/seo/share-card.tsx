import { ImageResponse } from 'next/og'

// Share images (docs/12 §5): 1200×630, drawn by Satori at request time and cached with the page
// data. Plain type on the brand colours; no photos, so a missing cover never breaks a share.

export const shareSize = { width: 1200, height: 630 }

export function shareCard({
  eyebrow,
  title,
  lines,
}: {
  eyebrow: string
  title: string
  lines: ReadonlyArray<string>
}) {
  const clipped = title.length > 90 ? `${title.slice(0, 89).trimEnd()}…` : title
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '72px 80px',
        background: '#f6f7f6',
        borderTop: '16px solid #0e6b4e',
        color: '#13181d',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <div style={{ fontSize: 30, color: '#0e6b4e', fontWeight: 600 }}>{eyebrow}</div>
        <div
          style={{
            marginTop: 20,
            fontSize: clipped.length > 50 ? 60 : 72,
            fontWeight: 700,
            lineHeight: 1.1,
            letterSpacing: '-0.02em',
          }}
        >
          {clipped}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', flexDirection: 'column', fontSize: 30, color: '#46505a' }}>
          {lines.map((line) => (
            <div key={line} style={{ marginTop: 6 }}>
              {line}
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', fontSize: 36, fontWeight: 700 }}>
          <div
            style={{
              width: 52,
              height: 52,
              borderRadius: 12,
              background: '#0e6b4e',
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginRight: 14,
              fontSize: 34,
            }}
          >
            T
          </div>
          Tokslearn
        </div>
      </div>
    </div>,
    shareSize,
  )
}
