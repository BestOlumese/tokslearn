'use client'
// Client component: edits the profile through me.update; uploads the photo via presigned R2.

import { useMutation } from '@tanstack/react-query'
import type { MeDto } from '@tokslearn/contract'
import { Avatar } from '@tokslearn/ui/avatar'
import { Button } from '@tokslearn/ui/button'
import { Field } from '@tokslearn/ui/field'
import { Input } from '@tokslearn/ui/input'
import { Select } from '@tokslearn/ui/select'
import { Textarea } from '@tokslearn/ui/textarea'
import { toast } from '@tokslearn/ui/toast'
import { Plus, Trash2 } from 'lucide-react'
import { useRef, useState } from 'react'
import { FormAlert } from '@/components/auth/form-alert'
import { apiErrorCode, apiErrorMessage } from '@/lib/api-error'
import { api, orpc } from '@/lib/orpc'
import { SettingsPanel } from './settings-panel'

type LinkKind = MeDto['links'][number]['kind']
const linkKinds: ReadonlyArray<[LinkKind, string]> = [
  ['website', 'Website'],
  ['linkedin', 'LinkedIn'],
  ['x', 'X'],
  ['youtube', 'YouTube'],
  ['github', 'GitHub'],
  ['other', 'Other'],
]
const MAX_AVATAR_BYTES = 2 * 1024 * 1024

export function ProfileForm({ me: initial }: { me: MeDto }) {
  const [me, setMe] = useState(initial)
  // Each row gets a stable key so removing one doesn't reuse another row's inputs.
  const withKeys = (ls: MeDto['links']) => ls.map((l) => ({ ...l, key: crypto.randomUUID() }))
  const [links, setLinks] = useState(() => withKeys(initial.links))
  const [error, setError] = useState<string | null>(null)
  const [usernameError, setUsernameError] = useState<string | null>(null)
  const [avatarError, setAvatarError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  const save = useMutation(
    orpc.me.update.mutationOptions({
      onSuccess: (next) => {
        setMe(next)
        setLinks(withKeys(next.links))
        setError(null)
        setUsernameError(null)
        toast.success('Profile saved')
      },
      onError: (e) => {
        if (apiErrorCode(e) === 'USERNAME_TAKEN') setUsernameError(apiErrorMessage(e))
        else setError(apiErrorMessage(e))
      },
    }),
  )

  const uploadAvatar = async (file: File) => {
    setAvatarError(null)
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setAvatarError('Use a JPG, PNG or WebP image.')
      return
    }
    if (file.size > MAX_AVATAR_BYTES) {
      setAvatarError('Photos must be under 2 MB.')
      return
    }
    setUploading(true)
    try {
      const upload = await api.media.createFileUpload({
        purpose: 'avatar',
        filename: file.name,
        mime: file.type,
        sizeBytes: file.size,
      })
      const put = await fetch(upload.uploadUrl, {
        method: 'PUT',
        headers: upload.headers,
        body: file,
      })
      if (!put.ok) throw new Error(`upload failed (${put.status})`)
      await api.media.completeFileUpload({ fileId: upload.fileId })
      setMe(await api.me.update({ avatarFileId: upload.fileId }))
      toast.success('Photo updated')
    } catch (e) {
      setAvatarError(
        e instanceof Error && e.message.startsWith('upload failed')
          ? 'The upload didn’t finish. Try again.'
          : apiErrorMessage(e),
      )
    } finally {
      setUploading(false)
    }
  }

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const username = String(form.get('username') ?? '').trim()
    save.mutate({
      name: String(form.get('name') ?? '').trim(),
      ...(username ? { username } : {}),
      headline: String(form.get('headline') ?? '').trim() || null,
      bio: String(form.get('bio') ?? '').trim() || null,
      links: links.filter((l) => l.url.trim() !== '').map(({ kind, url }) => ({ kind, url })),
    })
  }

  return (
    <div className="flex flex-col gap-6">
      <SettingsPanel
        id="photo"
        title="Photo"
        description="Shown next to your reviews, questions and posts. JPG, PNG or WebP, under 2 MB."
      >
        <div className="flex items-center gap-5">
          <Avatar name={me.name} src={me.avatarUrl} size="lg" />
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap gap-2">
              <input
                ref={fileInput}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="sr-only"
                aria-label="Choose a photo"
                onChange={(e) => {
                  const file = e.currentTarget.files?.[0]
                  if (file) void uploadAvatar(file)
                  e.currentTarget.value = ''
                }}
              />
              <Button
                variant="secondary"
                size="sm"
                loading={uploading}
                onClick={() => fileInput.current?.click()}
              >
                {me.avatarUrl ? 'Change photo' : 'Add a photo'}
              </Button>
              {me.avatarUrl ? (
                <Button
                  variant="tertiary"
                  size="sm"
                  disabled={uploading}
                  onClick={async () => setMe(await api.me.update({ avatarFileId: null }))}
                >
                  Remove
                </Button>
              ) : null}
            </div>
            {avatarError ? (
              <p role="alert" className="text-body-sm text-danger">
                {avatarError}
              </p>
            ) : null}
          </div>
        </div>
      </SettingsPanel>

      <form onSubmit={submit}>
        <SettingsPanel
          id="profile"
          title="Public profile"
          description="What other learners and instructors see. Your email is never shown."
          footer={
            <Button type="submit" loading={save.isPending}>
              Save profile
            </Button>
          }
        >
          <div className="flex flex-col gap-5">
            {error ? <FormAlert tone="error">{error}</FormAlert> : null}
            <div className="grid gap-5 sm:grid-cols-2">
              <Field id="name" label="Full name" helper="Shown on your certificates.">
                {(p) => (
                  <Input
                    name="name"
                    autoComplete="name"
                    required
                    maxLength={80}
                    defaultValue={me.name}
                    {...p}
                  />
                )}
              </Field>
              <Field
                id="username"
                label="Username"
                helper="Letters, numbers and underscores. Used in your public profile address."
                error={usernameError}
              >
                {(p) => (
                  <Input
                    name="username"
                    autoComplete="username"
                    spellCheck={false}
                    autoCapitalize="none"
                    minLength={3}
                    maxLength={30}
                    pattern="[A-Za-z0-9_]+"
                    defaultValue={me.username ?? ''}
                    {...p}
                  />
                )}
              </Field>
            </div>
            <Field
              id="headline"
              label="Headline"
              helper="One line, e.g. “Chartered accountant in Lagos”."
            >
              {(p) => (
                <Input name="headline" maxLength={120} defaultValue={me.headline ?? ''} {...p} />
              )}
            </Field>
            <Field id="bio" label="About you" helper="Up to 1,000 characters.">
              {(p) => (
                <Textarea name="bio" rows={5} maxLength={1000} defaultValue={me.bio ?? ''} {...p} />
              )}
            </Field>

            <fieldset className="flex flex-col gap-3">
              <legend className="text-body-sm font-medium text-ink">Links</legend>
              {links.map((link, i) => (
                <div
                  key={link.key}
                  className="grid grid-cols-[1fr_auto] items-start gap-2 sm:grid-cols-[130px_1fr_auto]"
                >
                  <Select
                    className="col-span-2 sm:col-span-1"
                    aria-label={`Link ${i + 1} type`}
                    value={link.kind}
                    onChange={(e) => {
                      const kind = e.currentTarget.value as LinkKind
                      setLinks((ls) => ls.map((l, j) => (j === i ? { ...l, kind } : l)))
                    }}
                  >
                    {linkKinds.map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </Select>
                  <Input
                    aria-label={`Link ${i + 1} address`}
                    type="url"
                    inputMode="url"
                    placeholder="https://…"
                    value={link.url}
                    onChange={(e) => {
                      const url = e.currentTarget.value
                      setLinks((ls) => ls.map((l, j) => (j === i ? { ...l, url } : l)))
                    }}
                  />
                  <Button
                    variant="tertiary"
                    aria-label={`Remove link ${i + 1}`}
                    icon={<Trash2 aria-hidden strokeWidth={1.75} />}
                    onClick={() => setLinks((ls) => ls.filter((_, j) => j !== i))}
                  >
                    Remove
                  </Button>
                </div>
              ))}
              {links.length < 5 ? (
                <Button
                  variant="secondary"
                  size="sm"
                  className="self-start"
                  icon={<Plus aria-hidden strokeWidth={1.75} />}
                  onClick={() =>
                    setLinks((ls) => [
                      ...ls,
                      { kind: 'website', url: '', key: crypto.randomUUID() },
                    ])
                  }
                >
                  Add a link
                </Button>
              ) : (
                <p className="text-body-sm text-ink-3">You can add up to 5 links.</p>
              )}
            </fieldset>
          </div>
        </SettingsPanel>
      </form>
    </div>
  )
}
