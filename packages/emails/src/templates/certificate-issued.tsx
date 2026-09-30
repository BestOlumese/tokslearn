import { Link, Text } from '@react-email/components'
import type { EmailData } from '../catalog'
import { EmailLayout, Heading, PrimaryButton, text } from '../layout'

const clip = (s: string) => (s.length <= 60 ? s : `${s.slice(0, 57).trimEnd()}…`)

export const subject = ({ courseTitle }: EmailData['certificate-issued']) =>
  clip(`Your certificate for ${courseTitle}`)

export function CertificateIssued(props: EmailData['certificate-issued']) {
  const { name, courseTitle, basisText, code, url, verifyUrl, linkedInUrl } = props
  return (
    <EmailLayout
      preview={`${basisText}. Your certificate code is ${code}.`}
      why={`You're getting this because you earned a certificate in ${courseTitle}.`}
    >
      <Heading>Your certificate is ready</Heading>
      <Text style={text}>
        Well done, {name}. {basisText} in {courseTitle}, and your certificate is ready to download.
      </Text>
      <PrimaryButton href={url}>Download the PDF</PrimaryButton>
      <Text style={text}>
        Anyone can check it at <Link href={verifyUrl}>{verifyUrl.replace(/^https?:\/\//, '')}</Link>
        . The code {code} is printed at the bottom of the certificate.
      </Text>
      <Text style={text}>
        To show it on your profile, <Link href={linkedInUrl}>add it to LinkedIn</Link>. The details
        are filled in for you.
      </Text>
    </EmailLayout>
  )
}
