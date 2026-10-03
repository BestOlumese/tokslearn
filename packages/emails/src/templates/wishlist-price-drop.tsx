import { Link, Text } from '@react-email/components'
import { type EmailData, formatLagos, formatNairaKobo } from '../catalog'
import { EmailLayout, FallbackLink, Heading, muted, PrimaryButton, text } from '../layout'

type Data = EmailData['wishlist-price-drop']

const clip = (s: string) => (s.length <= 60 ? s : `${s.slice(0, 57).trimEnd()}…`)

export const subject = ({ courseTitle, newKobo }: Data) =>
  clip(
    BigInt(newKobo) === 0n
      ? `${courseTitle} is free right now`
      : `${courseTitle} is now ${formatNairaKobo(newKobo)}`,
  )

export function WishlistPriceDrop(props: Data) {
  const { name, courseTitle, instructorName, oldKobo, newKobo, couponCode, endsAt, url } = props
  const free = BigInt(newKobo) === 0n
  return (
    <EmailLayout
      preview={`${formatNairaKobo(oldKobo)} → ${free ? 'free' : formatNairaKobo(newKobo)}${couponCode ? ` with ${couponCode}` : ''}.`}
      why="You're getting this because you saved this course to your wishlist and asked to hear when it gets cheaper."
    >
      <Heading>{free ? `${courseTitle} is free` : `${courseTitle} costs less now`}</Heading>
      <Text style={text}>
        Hi {name}, {instructorName}’s course on your wishlist is <s>{formatNairaKobo(oldKobo)}</s>{' '}
        <strong>{free ? 'free' : formatNairaKobo(newKobo)}</strong>
        {couponCode ? (
          <>
            {' '}
            with the code <strong>{couponCode}</strong>
            {endsAt ? ` until ${formatLagos(endsAt)}` : ''}
          </>
        ) : null}
        .
      </Text>
      {couponCode ? <Text style={text}>Enter the code in your cart before you pay.</Text> : null}
      <PrimaryButton href={url}>See the course</PrimaryButton>
      <FallbackLink href={url} />
      <Text style={muted}>
        <Link href={props.unsubscribeUrl}>Stop price emails for my wishlist</Link>
      </Text>
    </EmailLayout>
  )
}
