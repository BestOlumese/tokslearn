'use client'
// Client component: a certificate's actions on /account/certificates (docs/20): download the PDF,
// add it to LinkedIn, copy the verify link, and correct the name once.

import type { MyCertificateDto } from '@tokslearn/contract'
import { Button, buttonClasses } from '@tokslearn/ui/button'
import { Dialog, DialogContent, DialogFooter } from '@tokslearn/ui/dialog'
import { Input } from '@tokslearn/ui/input'
import { Label } from '@tokslearn/ui/label'
import { Download } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { FormAlert } from '@/components/auth/form-alert'
import { apiErrorMessage } from '@/lib/api-error'
import { api } from '@/lib/orpc'

type Cert = Pick<
  MyCertificateDto,
  'id' | 'status' | 'recipientName' | 'canCorrectName' | 'verifyUrl' | 'linkedInUrl'
>

export function CertificateActions({ cert }: { cert: Cert }) {
  const router = useRouter()
  const [downloading, setDownloading] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fixing, setFixing] = useState(false)
  const [name, setName] = useState(cert.recipientName)
  const [saving, setSaving] = useState(false)
  const [fixError, setFixError] = useState<string | null>(null)

  if (cert.status === 'revoked') return null

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <Button
          icon={<Download aria-hidden />}
          loading={downloading}
          onClick={async () => {
            setDownloading(true)
            setError(null)
            try {
              const { url } = await api.certificates.download({ certificateId: cert.id })
              window.location.assign(url)
            } catch (e) {
              setError(apiErrorMessage(e))
            } finally {
              setDownloading(false)
            }
          }}
        >
          Download PDF
        </Button>
        <a
          href={cert.linkedInUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={buttonClasses({ variant: 'secondary' })}
        >
          Add to LinkedIn
        </a>
        <Button
          variant="secondary"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(cert.verifyUrl)
              setCopied(true)
              setTimeout(() => setCopied(false), 2500)
            } catch {
              setError('Copy didn’t work here. Open the check page and copy its address instead.')
            }
          }}
        >
          {copied ? 'Link copied' : 'Copy check link'}
        </Button>
        {cert.canCorrectName ? (
          <Button variant="tertiary" onClick={() => setFixing(true)}>
            Correct the name
          </Button>
        ) : null}
      </div>
      <p aria-live="polite" className="sr-only">
        {copied ? 'Link copied' : ''}
      </p>
      {error ? <FormAlert tone="error">{error}</FormAlert> : null}

      <Dialog open={fixing} onOpenChange={setFixing}>
        <DialogContent
          title="Correct the name on your certificate"
          description="You can do this once. The code stays the same and we make a new PDF. Use your name as you want employers to read it."
        >
          <form
            className="flex flex-col gap-4"
            onSubmit={async (e) => {
              e.preventDefault()
              setSaving(true)
              setFixError(null)
              try {
                await api.certificates.requestNameCorrection({ certificateId: cert.id, name })
                setFixing(false)
                router.refresh()
              } catch (err) {
                setFixError(apiErrorMessage(err))
              } finally {
                setSaving(false)
              }
            }}
          >
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`name-${cert.id}`}>Name on the certificate</Label>
              <Input
                id={`name-${cert.id}`}
                value={name}
                minLength={2}
                maxLength={80}
                required
                autoComplete="name"
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            {fixError ? <FormAlert tone="error">{fixError}</FormAlert> : null}
            <DialogFooter>
              <Button type="button" variant="secondary" onClick={() => setFixing(false)}>
                Cancel
              </Button>
              <Button type="submit" loading={saving} disabled={name.trim() === cert.recipientName}>
                Save the name
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
