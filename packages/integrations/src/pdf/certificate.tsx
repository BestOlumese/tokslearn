import {
  Document,
  Font,
  Page,
  Path,
  renderToBuffer,
  StyleSheet,
  Svg,
  Text,
  View,
} from '@react-pdf/renderer'
import QRCode from 'qrcode'
import { figtreeRegular, figtreeSemiBold } from './fonts'
import type { CertificatePdfData, CertificateRenderer } from './types'

// The certificate PDF (docs/10 §8): A4 landscape, type and white space only. No seals, ribbons or
// ornamental borders; the QR code and the printed code are what make it checkable.

Font.register({
  family: 'Figtree',
  fonts: [
    { src: figtreeRegular, fontWeight: 400 },
    { src: figtreeSemiBold, fontWeight: 600 },
  ],
})
// Names and course titles must never be split with a hyphen.
Font.registerHyphenationCallback((word) => [word])

const ink = '#13181d'
const ink2 = '#46505a'
const ink3 = '#66707a'
const brand = '#0e6b4e'
const brandInk = '#0a4f3a'
const border = '#e1e5e3'

const s = StyleSheet.create({
  page: {
    fontFamily: 'Figtree',
    color: ink,
    backgroundColor: '#ffffff',
    paddingTop: 56,
    paddingBottom: 48,
    paddingHorizontal: 64,
    flexDirection: 'column',
    justifyContent: 'space-between',
  },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  wordmark: { fontSize: 18, fontWeight: 600, color: ink },
  label: { fontSize: 11, color: ink3 },
  body: { maxWidth: 620 },
  rule: { width: 48, height: 3, backgroundColor: brand, marginBottom: 24 },
  lead: { fontSize: 13, color: ink2, marginBottom: 8 },
  name: { fontWeight: 600, color: ink, marginBottom: 20, lineHeight: 1.15 },
  course: { fontWeight: 600, color: brandInk, marginTop: 6, marginBottom: 10, lineHeight: 1.25 },
  by: { fontSize: 13, color: ink2 },
  bottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    borderTopWidth: 1,
    borderTopColor: border,
    paddingTop: 16,
  },
  meta: { fontSize: 10, color: ink2, lineHeight: 1.6 },
  metaStrong: { fontWeight: 600, color: ink },
  sample: { fontSize: 10, color: '#b42318', marginTop: 4 },
})

const lagosDate = (d: Date) =>
  new Intl.DateTimeFormat('en-NG', {
    timeZone: 'Africa/Lagos',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(d)

/** What the learner did, in the words the verify page uses too. */
const basisLine = (d: CertificatePdfData) =>
  d.basis === 'exam'
    ? 'passed the timed final exam of'
    : d.basis === 'external'
      ? `passed an exam run by ${d.providerName ?? 'an outside provider'} for`
      : 'completed every lesson of'

/** One SVG path for the dark modules: small and crisp at any zoom. */
function QrCode({ text, size }: { text: string; size: number }) {
  const qr = QRCode.create(text, { errorCorrectionLevel: 'M' })
  const n = qr.modules.size
  let d = ''
  for (let row = 0; row < n; row++) {
    for (let col = 0; col < n; col++) {
      if (qr.modules.get(row, col)) d += `M${col} ${row}h1v1h-1z`
    }
  }
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${n} ${n}`}>
      <Path d={d} fill={ink} />
    </Svg>
  )
}

export function CertificateDocument({ data }: { data: CertificatePdfData }) {
  const nameSize = data.recipientName.length > 34 ? 30 : 40
  const courseSize = data.courseTitle.length > 60 ? 18 : 24
  return (
    <Document
      title={`${data.recipientName}, ${data.courseTitle}`}
      author="Tokslearn"
      subject={`Certificate ${data.code}`}
      creator="Tokslearn"
      producer="Tokslearn"
    >
      <Page size="A4" orientation="landscape" style={s.page}>
        <View style={s.top}>
          <Text style={s.wordmark}>Tokslearn</Text>
          <Text style={s.label}>Certificate</Text>
        </View>

        <View style={s.body}>
          <View style={s.rule} />
          <Text style={s.lead}>This certifies that</Text>
          <Text style={[s.name, { fontSize: nameSize }]}>{data.recipientName}</Text>
          <Text style={s.lead}>{basisLine(data)}</Text>
          <Text style={[s.course, { fontSize: courseSize }]}>{data.courseTitle}</Text>
          <Text style={s.by}>taught by {data.instructorName} on Tokslearn</Text>
        </View>

        <View style={s.bottom}>
          <View>
            <Text style={s.meta}>
              Issued <Text style={s.metaStrong}>{lagosDate(data.issuedAt)}</Text>
            </Text>
            <Text style={s.meta}>
              Code <Text style={s.metaStrong}>{data.code}</Text>
            </Text>
            <Text style={s.meta}>Check it at {data.verifyUrl.replace(/^https?:\/\//, '')}</Text>
            {data.sample ? (
              <Text style={s.sample}>Sample for the instructor. Not a real certificate.</Text>
            ) : null}
          </View>
          <QrCode text={data.verifyUrl} size={76} />
        </View>
      </Page>
    </Document>
  )
}

/** @react-pdf in Node. Fonts are inlined, so rendering needs no network or file access. */
export function createCertificateRenderer(): CertificateRenderer {
  return {
    async render(data) {
      const buffer = await renderToBuffer(<CertificateDocument data={data} />)
      return new Uint8Array(buffer)
    },
  }
}
