import QRCode from 'qrcode'

/** Server-rendered QR code: one SVG path, no client JavaScript. */
export function QrCode({
  value,
  size = 112,
  label,
}: {
  value: string
  size?: number
  label: string
}) {
  const qr = QRCode.create(value, { errorCorrectionLevel: 'M' })
  const n = qr.modules.size
  let d = ''
  for (let row = 0; row < n; row++) {
    for (let col = 0; col < n; col++) if (qr.modules.get(row, col)) d += `M${col} ${row}h1v1h-1z`
  }
  const pad = 2
  return (
    <svg
      width={size}
      height={size}
      viewBox={`${-pad} ${-pad} ${n + pad * 2} ${n + pad * 2}`}
      role="img"
      aria-label={label}
      shapeRendering="crispEdges"
      className="rounded-control bg-white"
    >
      <path d={d} fill="#13181d" />
    </svg>
  )
}
