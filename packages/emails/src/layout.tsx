import {
  Body,
  Button,
  Container,
  Head,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from '@react-email/components'
import { colors } from '@tokslearn/ui/tokens'
import type { ReactNode } from 'react'

// Layout rules from docs/23: white card on canvas, wordmark top-left, one brand-green button,
// footer with address and "Why am I getting this?". System fonts: web fonts are unreliable in mail.

const font =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"

export const text = {
  fontFamily: font,
  fontSize: '16px',
  lineHeight: '24px',
  color: colors.ink,
  margin: '0 0 16px',
} as const

export const muted = { ...text, fontSize: '14px', lineHeight: '20px', color: colors.ink2 } as const

export function EmailLayout({
  preview,
  why,
  children,
}: {
  /** Inbox preview line: say what the email is for. */
  preview: string
  /** One sentence: why this person got this email. */
  why: string
  children: ReactNode
}) {
  return (
    <Html lang="en">
      <Head />
      <Preview>{preview}</Preview>
      <Body style={{ backgroundColor: colors.canvas, margin: 0, padding: '32px 12px' }}>
        <Container style={{ maxWidth: '560px', margin: '0 auto' }}>
          <Text
            style={{
              fontFamily: font,
              fontSize: '22px',
              fontWeight: 700,
              letterSpacing: '-0.02em',
              color: colors.ink,
              margin: '0 0 16px',
            }}
          >
            Tokslearn
          </Text>
          <Section
            style={{
              backgroundColor: colors.surface,
              border: `1px solid ${colors.border}`,
              borderRadius: '10px',
              padding: '32px 28px',
            }}
          >
            {children}
          </Section>
          <Text style={{ ...muted, fontSize: '12px', lineHeight: '18px', margin: '20px 0 4px' }}>
            {why}
          </Text>
          <Text style={{ ...muted, fontSize: '12px', lineHeight: '18px', margin: 0 }}>
            Tokslearn · Lagos, Nigeria ·{' '}
            <Link href="mailto:support@tokslearn.com" style={{ color: colors.ink2 }}>
              support@tokslearn.com
            </Link>
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

export function Heading({ children }: { children: ReactNode }) {
  return (
    <Text
      style={{
        ...text,
        fontSize: '22px',
        lineHeight: '30px',
        fontWeight: 700,
        margin: '0 0 16px',
      }}
    >
      {children}
    </Text>
  )
}

/** The one primary action in an email. */
export function PrimaryButton({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Section style={{ margin: '8px 0 24px' }}>
      <Button
        href={href}
        style={{
          backgroundColor: colors.brand,
          color: colors.inkInverse,
          fontFamily: font,
          fontSize: '16px',
          fontWeight: 600,
          padding: '12px 20px',
          borderRadius: '6px',
          textDecoration: 'none',
        }}
      >
        {children}
      </Button>
    </Section>
  )
}

/** Shows a link's full address under a button, for clients that block buttons. */
export function FallbackLink({ href }: { href: string }) {
  return (
    <Text style={{ ...muted, wordBreak: 'break-all' }}>
      If the button doesn't work, paste this address into your browser:{' '}
      <Link href={href} style={{ color: colors.brand }}>
        {href}
      </Link>
    </Text>
  )
}

export function Divider() {
  return <Hr style={{ borderColor: colors.border, margin: '24px 0' }} />
}
