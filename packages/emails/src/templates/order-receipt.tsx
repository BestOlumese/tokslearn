import { Column, Row, Section, Text } from '@react-email/components'
import { type EmailData, formatLagos, formatNairaKobo } from '../catalog'
import { Divider, EmailLayout, FallbackLink, Heading, muted, PrimaryButton, text } from '../layout'

export const subject = ({ publicId }: EmailData['order-receipt']) => `Receipt for order ${publicId}`

const cell = { ...text, margin: '0' } as const

export function OrderReceipt(props: EmailData['order-receipt']) {
  const { name, publicId, paidAt, items, subtotalKobo, discountKobo, totalKobo } = props
  const discounted = BigInt(discountKobo) > 0n
  return (
    <EmailLayout
      preview={`You paid ${formatNairaKobo(totalKobo)} for ${items.length === 1 ? items[0]?.title : `${items.length} courses`}.`}
      why="You're getting this because you bought a course on Tokslearn. Keep it for your records."
    >
      <Heading>Thanks for your order, {name}</Heading>
      <Text style={muted}>
        Order {publicId} · {formatLagos(paidAt)}
        {props.paymentMethod ? ` · Paid by ${props.paymentMethod}` : ''}
      </Text>
      <Section>
        {items.map((item) => (
          <Row key={item.title} style={{ paddingTop: '12px' }}>
            <Column>
              <Text style={cell}>{item.title}</Text>
              <Text style={{ ...muted, margin: '2px 0 0' }}>{item.refundLine}</Text>
            </Column>
            <Column align="right" style={{ verticalAlign: 'top', width: '120px' }}>
              <Text style={cell}>{formatNairaKobo(item.netKobo)}</Text>
            </Column>
          </Row>
        ))}
      </Section>
      <Divider />
      {discounted ? (
        <>
          <Row>
            <Column>
              <Text style={cell}>Subtotal</Text>
            </Column>
            <Column align="right">
              <Text style={cell}>{formatNairaKobo(subtotalKobo)}</Text>
            </Column>
          </Row>
          <Row>
            <Column>
              <Text style={cell}>Discount</Text>
            </Column>
            <Column align="right">
              <Text style={cell}>−{formatNairaKobo(discountKobo)}</Text>
            </Column>
          </Row>
        </>
      ) : null}
      <Row>
        <Column>
          <Text style={{ ...cell, fontWeight: 600 }}>Total paid</Text>
        </Column>
        <Column align="right">
          <Text style={{ ...cell, fontWeight: 600 }}>{formatNairaKobo(totalKobo)}</Text>
        </Column>
      </Row>
      <PrimaryButton href={props.learnUrl}>Start learning</PrimaryButton>
      <Text style={muted}>
        To ask for a refund, open the receipt below and choose the course. The rules for each course
        are listed above.
      </Text>
      <FallbackLink href={props.receiptUrl} />
    </EmailLayout>
  )
}
