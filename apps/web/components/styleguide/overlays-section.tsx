import { Button } from '@tokslearn/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogTrigger,
} from '@tokslearn/ui/dialog'
import { Popover, PopoverContent, PopoverTrigger } from '@tokslearn/ui/popover'
import { Sheet, SheetContent, SheetTrigger } from '@tokslearn/ui/sheet'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tokslearn/ui/tabs'
import { Tooltip, TooltipProvider } from '@tokslearn/ui/tooltip'
import { Bookmark } from 'lucide-react'
import { Section } from './section'
import { ToastDemo } from './toast-demo'

export function OverlaysSection() {
  return (
    <>
      <Section
        id="overlays"
        title="Dialog, sheet, popover and tooltip"
        note="Floating layers are the only surfaces with a shadow."
      >
        <TooltipProvider>
          <div className="flex flex-wrap items-center gap-3">
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="secondary">Open dialog</Button>
              </DialogTrigger>
              <DialogContent
                title="Start the final exam?"
                description="You'll have 60 minutes. Refunds aren't available after you start the certification exam."
              >
                <DialogFooter>
                  <DialogClose asChild>
                    <Button variant="secondary">Not now</Button>
                  </DialogClose>
                  <DialogClose asChild>
                    <Button>Start exam</Button>
                  </DialogClose>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <Sheet>
              <SheetTrigger asChild>
                <Button variant="secondary">Open sheet</Button>
              </SheetTrigger>
              <SheetContent title="Your cart" description="2 courses">
                <p className="text-body-sm text-ink-2">Cart contents arrive in Phase 4.</p>
              </SheetContent>
            </Sheet>

            <Popover>
              <PopoverTrigger asChild>
                <Button variant="secondary">Open popover</Button>
              </PopoverTrigger>
              <PopoverContent>
                <p className="font-medium text-ink">Refund window: 7 days</p>
                <p className="mt-1 text-ink-2">
                  Ends early if you watch more than 30% of the course.
                </p>
              </PopoverContent>
            </Popover>

            <Tooltip content="Bookmark this lesson">
              <button
                type="button"
                aria-label="Bookmark this lesson"
                className="inline-flex size-10 items-center justify-center rounded-control border border-border-strong bg-surface text-ink-2 hover:text-ink"
              >
                <Bookmark aria-hidden strokeWidth={1.75} className="size-5" />
              </button>
            </Tooltip>
          </div>
        </TooltipProvider>
      </Section>

      <Section id="tabs" title="Tabs">
        <Tabs defaultValue="overview" className="max-w-[640px]">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="curriculum">Curriculum</TabsTrigger>
            <TabsTrigger value="reviews">Reviews</TabsTrigger>
            <TabsTrigger value="faq" disabled>
              FAQ
            </TabsTrigger>
          </TabsList>
          <TabsContent value="overview" className="text-body text-ink-2">
            12 lessons · 3 h 40 min · Certificate after a 60-minute exam.
          </TabsContent>
          <TabsContent value="curriculum" className="text-body text-ink-2">
            Section 1: Formulas you'll use every week.
          </TabsContent>
          <TabsContent value="reviews" className="text-body text-ink-2">
            Ratings show once a course has 3 reviews.
          </TabsContent>
        </Tabs>
      </Section>

      <Section
        id="toast"
        title="Toast"
        note="Bottom right on desktop, bottom centre on phones. Errors say what went wrong and what to do."
      >
        <ToastDemo />
      </Section>
    </>
  )
}
