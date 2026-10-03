/** @jsxRuntime automatic */
/** @jsxImportSource react */
// Pragmas: compile the same way whichever package or tool builds this file.
import { Document, Font, Page, renderToBuffer, StyleSheet, Text, View } from '@react-pdf/renderer'
import { figtreeRegular, figtreeSemiBold } from './fonts'
import type { StatementPdfData, StatementRenderer } from './types'

// Monthly earnings statement (docs/08 §9): A4 portrait, a summary and a per-course table.
// Plain, like a bank statement: no colour except the brand rule.

Font.register({
  family: 'Figtree',
  fonts: [
    { src: figtreeRegular, fontWeight: 400 },
    { src: figtreeSemiBold, fontWeight: 600 },
  ],
})
Font.registerHyphenationCallback((word) => [word])

/** Figtree has no ₦ glyph, so the PDF writes amounts the way bank statements do: "NGN 15,000". */
const money = (v: string) => v.replace('₦', 'NGN ')

const ink = '#13181d'
const ink2 = '#46505a'
const ink3 = '#66707a'
const brand = '#0e6b4e'
const border = '#e1e5e3'

const s = StyleSheet.create({
  page: { fontFamily: 'Figtree', color: ink, fontSize: 10, padding: 48 },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  wordmark: { fontSize: 16, fontWeight: 600 },
  muted: { color: ink3 },
  rule: { width: 40, height: 3, backgroundColor: brand, marginTop: 28, marginBottom: 14 },
  title: { fontSize: 20, fontWeight: 600, marginBottom: 4 },
  sub: { fontSize: 11, color: ink2, marginBottom: 24 },
  h: { fontSize: 12, fontWeight: 600, marginTop: 20, marginBottom: 8 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 5,
    borderBottomWidth: 1,
    borderBottomColor: border,
  },
  strong: { fontWeight: 600 },
  th: { color: ink3, fontSize: 9 },
  colTitle: { flex: 1, paddingRight: 8 },
  colNum: { width: 50, textAlign: 'right' },
  colMoney: { width: 80, textAlign: 'right' },
  foot: { position: 'absolute', bottom: 32, left: 48, right: 48, fontSize: 8, color: ink3 },
})

export function StatementDocument({ data }: { data: StatementPdfData }) {
  return (
    <Document title={`Tokslearn statement ${data.monthLabel}`} author="Tokslearn">
      <Page size="A4" style={s.page}>
        <View style={s.top}>
          <Text style={s.wordmark}>Tokslearn</Text>
          <Text style={s.muted}>Earnings statement</Text>
        </View>
        <View style={s.rule} />
        <Text style={s.title}>{data.monthLabel}</Text>
        <Text style={s.sub}>
          {data.instructorName} · {data.period}
        </Text>

        <Text style={s.h}>Summary</Text>
        {data.summary.map((r) => (
          <View key={r.label} style={s.row}>
            <Text style={r.strong ? s.strong : {}}>{r.label}</Text>
            <Text style={r.strong ? s.strong : {}}>{money(r.value)}</Text>
          </View>
        ))}

        <Text style={s.h}>By course</Text>
        {data.courses.length === 0 ? (
          <Text style={s.muted}>No sales or refunds this month.</Text>
        ) : (
          <>
            <View style={s.row}>
              <Text style={[s.th, s.colTitle]}>Course</Text>
              <Text style={[s.th, s.colNum]}>Sales</Text>
              <Text style={[s.th, s.colNum]}>Refunds</Text>
              <Text style={[s.th, s.colMoney]}>Paid by learners</Text>
              <Text style={[s.th, s.colMoney]}>Your share</Text>
            </View>
            {data.courses.map((c) => (
              <View key={c.title} style={s.row} wrap={false}>
                <Text style={s.colTitle}>{c.title}</Text>
                <Text style={s.colNum}>{c.sales}</Text>
                <Text style={s.colNum}>{c.refunds}</Text>
                <Text style={s.colMoney}>{money(c.gross)}</Text>
                <Text style={s.colMoney}>{money(c.share)}</Text>
              </View>
            ))}
          </>
        )}

        <Text style={s.foot} fixed>
          Your share is what you keep after Tokslearn's commission and your part of the payment
          fees. Refunds take back the share of a sale. Made{' '}
          {new Intl.DateTimeFormat('en-NG', {
            timeZone: 'Africa/Lagos',
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          }).format(data.generatedAt)}
          . Questions: support@tokslearn.com
        </Text>
      </Page>
    </Document>
  )
}

export function createStatementRenderer(): StatementRenderer {
  return {
    async render(data) {
      const buffer = await renderToBuffer(<StatementDocument data={data} />)
      return new Uint8Array(buffer)
    },
  }
}
