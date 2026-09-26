import { Button, buttonClasses } from '@tokslearn/ui/button'
import { Checkbox } from '@tokslearn/ui/checkbox'
import { Field } from '@tokslearn/ui/field'
import { Input } from '@tokslearn/ui/input'
import { Label } from '@tokslearn/ui/label'
import { Radio } from '@tokslearn/ui/radio'
import { Select } from '@tokslearn/ui/select'
import { Switch } from '@tokslearn/ui/switch'
import { Textarea } from '@tokslearn/ui/textarea'
import { Download, Trash2 } from 'lucide-react'
import { Demo } from './demo'
import { Section } from './section'

const icon = (Icon: typeof Download) => <Icon aria-hidden strokeWidth={1.75} />

export function ControlsSection() {
  return (
    <>
      <Section
        id="buttons"
        title="Buttons"
        note="One primary button per view. Labels say what happens when you press them, like “Buy course — ₦15,000”."
      >
        <div className="flex flex-col gap-6">
          <Demo label="Variants (md, 40 px)">
            <Button>Buy course — ₦15,000</Button>
            <Button variant="secondary">Add to wishlist</Button>
            <Button variant="tertiary">View curriculum</Button>
            <Button variant="danger" icon={icon(Trash2)}>
              Delete lesson
            </Button>
          </Demo>
          <Demo label="Sizes: sm 36 · md 40 · lg 48 (checkout only)">
            <Button size="sm">Start lesson</Button>
            <Button size="md">Start lesson</Button>
            <Button size="lg">Pay ₦15,000</Button>
          </Demo>
          <Demo label="With icon · loading (keeps width) · disabled">
            <Button variant="secondary" icon={icon(Download)}>
              Download workbook
            </Button>
            <Button loading>Submit assignment</Button>
            <Button disabled>Submit assignment</Button>
            <Button variant="secondary" disabled>
              Add to wishlist
            </Button>
          </Demo>
          <Demo label="Link styled as a tertiary button (press Tab to see the 2 px focus ring)">
            <a href="#buttons" className={buttonClasses({ variant: 'tertiary' })}>
              Read the refund rules
            </a>
          </Demo>
        </div>
      </Section>

      <Section
        id="inputs"
        title="Text fields"
        note="Label above, helper below, error in red with an icon. Never use the placeholder as the label."
      >
        <div className="grid max-w-form gap-6">
          <Field id="sg-email" label="Email" helper="We send your receipt here.">
            {(p) => (
              <Input
                type="email"
                name="email"
                autoComplete="email"
                spellCheck={false}
                placeholder="ada@example.com"
                {...p}
              />
            )}
          </Field>
          <Field id="sg-coupon" label="Coupon code" error="This coupon has expired.">
            {(p) => (
              <Input
                name="coupon"
                autoComplete="off"
                spellCheck={false}
                defaultValue="LAGOS2025"
                {...p}
              />
            )}
          </Field>
          <Field
            id="sg-disabled"
            label="Order reference"
            helper="Set by Paystack. You can't change it."
          >
            {(p) => <Input disabled defaultValue="TL-7K3M9Q2A" {...p} />}
          </Field>
          <Field
            id="sg-bio"
            label="Short bio"
            required
            helper="Two or three sentences about what you teach."
          >
            {(p) => <Textarea {...p} />}
          </Field>
          <Field id="sg-refund" label="Refund window">
            {(p) => (
              <Select defaultValue="7" {...p}>
                <option value="0">No refunds</option>
                <option value="3">3 days</option>
                <option value="7">7 days</option>
                <option value="14">14 days</option>
              </Select>
            )}
          </Field>
        </div>
      </Section>

      <Section id="choices" title="Checkbox, radio and switch">
        <div className="grid gap-8 md:grid-cols-3">
          <fieldset className="flex flex-col gap-3">
            <legend className="mb-1 text-body-sm font-medium text-ink">Checkbox</legend>
            <div className="flex items-center gap-2">
              <Checkbox id="sg-cb1" defaultChecked />
              <Label htmlFor="sg-cb1" kind="option">
                Email me when a new lesson opens
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox id="sg-cb2" />
              <Label htmlFor="sg-cb2" kind="option">
                Email me about new courses
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox id="sg-cb3" disabled defaultChecked />
              <Label htmlFor="sg-cb3" kind="option">
                Security emails (always on)
              </Label>
            </div>
          </fieldset>
          <fieldset className="flex flex-col gap-3">
            <legend className="mb-1 text-body-sm font-medium text-ink">Radio</legend>
            {['Free', 'Paid', 'Any price'].map((label, i) => (
              <div key={label} className="flex items-center gap-2">
                <Radio id={`sg-r${i}`} name="sg-price" defaultChecked={i === 2} />
                <Label htmlFor={`sg-r${i}`} kind="option">
                  {label}
                </Label>
              </div>
            ))}
            <div className="flex items-center gap-2">
              <Radio id="sg-r-dis" name="sg-price-2" disabled />
              <Label htmlFor="sg-r-dis" kind="option">
                Subscription (later)
              </Label>
            </div>
          </fieldset>
          <fieldset className="flex flex-col gap-3">
            <legend className="mb-1 text-body-sm font-medium text-ink">Switch</legend>
            <div className="flex items-center gap-3">
              <Switch id="sg-sw1" defaultChecked />
              <Label htmlFor="sg-sw1" kind="option">
                Issue a certificate
              </Label>
            </div>
            <div className="flex items-center gap-3">
              <Switch id="sg-sw2" />
              <Label htmlFor="sg-sw2" kind="option">
                Require a final exam
              </Label>
            </div>
            <div className="flex items-center gap-3">
              <Switch id="sg-sw3" disabled />
              <Label htmlFor="sg-sw3" kind="option">
                Subscription pool (Phase 12)
              </Label>
            </div>
          </fieldset>
        </div>
      </Section>
    </>
  )
}
