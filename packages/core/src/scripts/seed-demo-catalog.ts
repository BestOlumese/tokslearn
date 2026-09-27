// Local demo catalog: publishes a handful of courses through the real services (review, reindex,
// counts) so the public pages have something to show. Uses fake storage and video providers, so
// covers render as placeholders and nothing leaves the machine. Refuses production.
//   DATABASE_URL=… pnpm --filter @tokslearn/core seed:demo-catalog
// Needs `pnpm db:seed` first (categories, Tobi Adeleke and Kemi Reviewer).

import { randomUUID } from 'node:crypto'
import type { RichTextDoc } from '@tokslearn/contract'
import { createDb, type Db, schema, seedCategories } from '@tokslearn/db'
import { createFakeBunny, type VideoProvider } from '@tokslearn/integrations/bunny'
import { createFakeStorage } from '@tokslearn/integrations/r2'
import { eq } from 'drizzle-orm'
import {
  addLesson,
  addSection,
  createCourse,
  decideReview,
  getStudioCourse,
  listReviewQueue,
  onVideoAssetChanged,
  reviewChecklistKeys,
  setFeatured,
  startLessonVideoUpload,
  submitForReview,
  updateDetails,
  updateLesson,
  updatePricing,
} from '../courses'
import type { Actor, UserActor } from '../kernel/actor'
import { createCtx } from '../kernel/ctx'
import { completeFileUpload, createFileUpload, refreshVideoAsset } from '../media'

interface DemoCourse {
  title: string
  subtitle: string
  category: string
  level: 'beginner' | 'intermediate' | 'advanced' | 'all'
  priceKobo: bigint
  compareAtKobo?: bigint
  tags: string[]
  outcomes: string[]
  about: string
  instructor: 'tobi' | 'chinedu'
  featured?: boolean
}

const courses: DemoCourse[] = [
  {
    title: 'Excel for Accountants',
    subtitle: 'Month-end reporting, reconciliations and pivot tables without the late nights',
    category: 'microsoft-excel',
    level: 'beginner',
    priceKobo: 1_500_000n,
    compareAtKobo: 2_500_000n,
    tags: ['Excel', 'Accounting'],
    outcomes: ['Build XLOOKUP reports', 'Reconcile bank statements faster', 'Present with pivots'],
    about:
      'Built around a real month-end close for a Lagos distribution company. You work through the trial balance, bank reconciliation and management pack in the same workbook an audit senior would hand you.',
    instructor: 'tobi',
    featured: true,
  },
  {
    title: 'Financial Modelling in Excel',
    subtitle: 'Three-statement models that survive a banker reading them',
    category: 'microsoft-excel',
    level: 'advanced',
    priceKobo: 4_500_000n,
    tags: ['Excel', 'Finance', 'Modelling'],
    outcomes: [
      'Link income statement, balance sheet and cash flow',
      'Build scenarios',
      'Stress-test a loan',
    ],
    about:
      'A working model for a mid-sized Nigerian manufacturer with naira devaluation scenarios, working-capital drivers and a debt schedule. Every formula is explained, and the model balances at the end of every lesson.',
    instructor: 'tobi',
  },
  {
    title: 'Bookkeeping for Small Businesses',
    subtitle: 'Keep clean books for your shop or agency and stop guessing your profit',
    category: 'accounting-and-bookkeeping',
    level: 'beginner',
    priceKobo: 0n,
    tags: ['Bookkeeping', 'Small business'],
    outcomes: [
      'Record sales and expenses correctly',
      'Read a profit and loss statement',
      'Prepare for tax',
    ],
    about:
      'For owners who do their own books. We set up a simple cash book, separate personal and business money, and close the month in under an hour. Examples come from a Yaba phone accessories shop.',
    instructor: 'tobi',
  },
  {
    title: 'Personal Income Tax in Nigeria',
    subtitle: 'PAYE, reliefs and filing your annual return with confidence',
    category: 'tax',
    level: 'all',
    priceKobo: 800_000n,
    tags: ['Tax', 'PAYE'],
    outcomes: [
      'Work out PAYE on a payslip',
      'Claim the reliefs you are owed',
      'File your annual return',
    ],
    about:
      'The rules as they apply to salaried workers and freelancers today, with worked examples for Lagos, Abuja and Rivers. You finish with your own tax computation checked line by line.',
    instructor: 'tobi',
  },
  {
    title: 'JavaScript for Beginners',
    subtitle: 'Write your first programs in the browser, one small project at a time',
    category: 'web-development',
    level: 'beginner',
    priceKobo: 1_200_000n,
    tags: ['JavaScript', 'Web'],
    outcomes: ['Write functions and loops', 'Work with the DOM', 'Build a naira budget tracker'],
    about:
      'No experience needed. You write code from the first lesson, and every section ends with a small project you can put on GitHub. We use a laptop and a free code editor, nothing else.',
    instructor: 'chinedu',
    featured: true,
  },
  {
    title: 'React from Zero to Job-Ready',
    subtitle: 'Components, state and data fetching for real product work',
    category: 'web-development',
    level: 'intermediate',
    priceKobo: 3_500_000n,
    tags: ['React', 'JavaScript', 'Frontend'],
    outcomes: ['Build components that scale', 'Manage state and forms', 'Ship a deployed app'],
    about:
      'You build a food ordering app for a Surulere restaurant from an empty folder to a live URL. Along the way we cover the questions interviewers at Lagos startups actually ask.',
    instructor: 'chinedu',
  },
  {
    title: 'SQL for Data Analysis',
    subtitle: 'Answer business questions from a database without waiting for an engineer',
    category: 'sql',
    level: 'beginner',
    priceKobo: 1_800_000n,
    tags: ['SQL', 'Data analysis', 'PostgreSQL'],
    outcomes: [
      'Write SELECT queries with joins',
      'Group and summarise sales data',
      'Use window functions',
    ],
    about:
      'Every query runs against the sales database of a fictional Nigerian retail chain with 40 branches. By the end you can answer the questions a sales manager asks on a Monday morning.',
    instructor: 'chinedu',
  },
  {
    title: 'Python Basics',
    subtitle: 'Automate boring office work with short, readable scripts',
    category: 'programming-languages',
    level: 'beginner',
    priceKobo: 0n,
    tags: ['Python', 'Automation'],
    outcomes: [
      'Write Python scripts',
      'Rename and sort files automatically',
      'Read and write Excel files',
    ],
    about:
      'Short lessons for people who have never programmed. Each script solves a task you would otherwise do by hand, like renaming 300 invoices or merging monthly sales sheets.',
    instructor: 'chinedu',
  },
  {
    title: 'Power BI Dashboards',
    subtitle: 'Turn spreadsheets into reports your manager opens every week',
    category: 'power-bi',
    level: 'intermediate',
    priceKobo: 2_500_000n,
    tags: ['Power BI', 'Dashboards'],
    outcomes: ['Model data with relationships', 'Write basic DAX', 'Publish and share a report'],
    about:
      'We rebuild a telecom sales report that used to take a full day every week. You connect the data once, design the pages and set it to refresh by itself.',
    instructor: 'tobi',
  },
  {
    title: 'Social Media Marketing for Small Brands',
    subtitle: 'Plan, post and measure on Instagram and TikTok with a small budget',
    category: 'social-media-marketing',
    level: 'beginner',
    priceKobo: 1_000_000n,
    tags: ['Instagram', 'TikTok', 'Marketing'],
    outcomes: ['Plan a month of content', 'Run a ₦20,000 ad test', 'Read your insights'],
    about:
      'Built on the numbers from three Nigerian brands: a skincare line, a bakery and a fashion label. You leave with a content calendar and an ad plan sized to your budget.',
    instructor: 'chinedu',
  },
]

const doc = (...paragraphs: string[]): RichTextDoc => ({
  type: 'doc',
  content: paragraphs.map((text) => ({ type: 'paragraph', content: [{ type: 'text', text }] })),
})

const ids = {
  tobi: '01920000-0000-7000-8000-000000000201',
  chinedu: '01920000-0000-7000-8000-000000000203',
  reviewer: '01920000-0000-7000-8000-000000000005',
}

const actor = (userId: string, roles: UserActor['roles']): UserActor => ({
  kind: 'user',
  userId,
  sessionId: 'demo-seed',
  roles,
  emailVerified: true,
  twoFactorEnabled: true,
  twoFactorVerifiedAt: new Date(),
})

async function ensureSecondInstructor(db: Db) {
  await db
    .insert(schema.user)
    .values({
      id: ids.chinedu,
      name: 'Chinedu Eze',
      email: 'instructor3@tokslearn.test',
      username: 'chinedu',
      headline: 'Software engineer, 7 years building products in Lagos',
      emailVerified: true,
    })
    .onConflictDoNothing()
  await db
    .insert(schema.userRoles)
    .values([
      { userId: ids.chinedu, role: 'learner' as const },
      { userId: ids.chinedu, role: 'instructor' as const },
    ])
    .onConflictDoNothing()
  await db
    .insert(schema.instructorProfiles)
    .values({
      userId: ids.chinedu,
      slug: 'chinedu-eze',
      displayName: 'Chinedu Eze',
      approvedAt: new Date('2026-09-02T09:00:00Z'),
    })
    .onConflictDoNothing()
}

// Shared fakes across courses and runs: random video ids so reruns never collide.
const storage = createFakeStorage()
const bunny = createFakeBunny()
const durations = new Map<string, number>()
const video: VideoProvider = {
  ...bunny.provider,
  async createVideo() {
    return { videoId: randomUUID() }
  },
  async getVideo(videoId) {
    const durationSec = durations.get(videoId)
    return durationSec === undefined
      ? null
      : { status: 'ready', durationSec, width: 1920, height: 1080, thumbnailUrl: null }
  },
}

async function publish(db: Db, spec: DemoCourse, index: number) {
  const ctx = (a: Actor) =>
    createCtx({
      db,
      actor: a,
      requestId: 'demo-seed',
      providers: {
        storage,
        video,
        sessions: { revokeSession: async () => {}, revokeAllSessions: async () => {} },
        urls: { app: 'http://localhost:3000', cdn: null },
      },
    })
  const owner = actor(ids[spec.instructor], ['learner', 'instructor'])
  const reviewer = actor(ids.reviewer, ['learner', 'reviewer'])
  const c = ctx(owner)
  const category = seedCategories.flatMap((t) => t.children).find((x) => x.slug === spec.category)
  if (!category) throw new Error(`No category ${spec.category}`)

  let s = await createCourse(c, { title: spec.title, categoryId: category.id })
  const up = await createFileUpload(c, {
    purpose: 'cover',
    filename: 'cover.png',
    mime: 'image/png',
    sizeBytes: 2048,
  })
  const [file] = await db.select().from(schema.files).where(eq(schema.files.id, up.fileId))
  storage.putObject(file?.bucket ?? 'public', file?.key ?? '', 2048, 'image/png')
  await completeFileUpload(c, up.fileId)

  s = await updateDetails(c, {
    courseId: s.id,
    version: s.version,
    title: spec.title,
    subtitle: spec.subtitle,
    description: doc(
      spec.about,
      'Lessons are short and practical. Watch on your phone during the commute, then practise on a laptop with the files attached to each section.',
      'You can ask the instructor questions under any lesson. Most get an answer within two working days.',
    ),
    outcomes: spec.outcomes,
    requirements: ['A laptop or desktop computer', 'About three hours a week'],
    level: spec.level,
    language: 'en',
    categoryId: category.id,
    coverFileId: up.fileId,
    tags: spec.tags,
  })

  const outline: Array<[string, Array<[string, 'video' | 'article', number]>]> = [
    [
      'Getting started',
      [
        ['Welcome and what you will build', 'video', 240 + index * 30],
        ['Setting up', 'article', 0],
      ],
    ],
    [
      'Core skills',
      [
        ['The first technique', 'video', 780],
        ['Working through an example', 'video', 1260],
      ],
    ],
    ['Putting it together', [['Final project walkthrough', 'video', 1500 + index * 60]]],
  ]
  for (const [title] of outline) {
    s = await addSection(c, { courseId: s.id, version: s.version, title })
  }
  for (const [i, [, lessons]] of outline.entries()) {
    for (const [title, type] of lessons) {
      s = await addLesson(c, {
        courseId: s.id,
        version: s.version,
        sectionId: s.sections[i]?.id ?? '',
        type,
        title,
      })
    }
  }
  for (const [i, [, lessons]] of outline.entries()) {
    for (const [j, [title, type, durationSec]] of lessons.entries()) {
      const lessonId = s.sections[i]?.lessons[j]?.id ?? ''
      if (type === 'article') {
        s = await updateLesson(c, {
          courseId: s.id,
          version: s.version,
          lessonId,
          article: doc(
            'Install the tools listed below before the next lesson. Each takes less than ten minutes on a normal connection.',
            'If anything fails, post the exact error message under this lesson and the instructor will help.',
          ),
        })
        continue
      }
      const started = await startLessonVideoUpload(c, {
        courseId: s.id,
        version: s.version,
        lessonId,
        filename: `${title}.mp4`,
        sizeBytes: 50_000_000,
        mime: 'video/mp4',
      })
      const [asset] = await db
        .select()
        .from(schema.videoAssets)
        .where(eq(schema.videoAssets.id, started.videoAssetId))
      durations.set(asset?.providerVideoId ?? '', durationSec)
      await refreshVideoAsset(c, started.videoAssetId)
      await onVideoAssetChanged(c, started.videoAssetId)
      s = await getStudioCourse(c, s.id)
      if (i === 0 && j === 0) {
        s = await updateLesson(c, { courseId: s.id, version: s.version, lessonId, isPreview: true })
      }
    }
  }
  s = await updatePricing(c, {
    courseId: s.id,
    version: s.version,
    priceKobo: spec.priceKobo,
    compareAtKobo: spec.compareAtKobo ?? null,
    refundPolicyDays: 7,
  })
  await submitForReview(c, { courseId: s.id, version: s.version })
  const [item] = (await listReviewQueue(ctx(reviewer))).filter((q) => q.courseId === s.id)
  await decideReview(ctx(reviewer), {
    revisionId: item?.revisionId ?? '',
    decision: 'approve',
    notes: 'Demo course.',
    checklist: Object.fromEntries(reviewChecklistKeys.map((k) => [k, true])),
  })
  if (spec.featured) {
    await setFeatured(ctx(reviewer), { courseId: s.id, featured: true, reason: 'Demo pick.' })
  }
  return s.slug
}

const url = process.env.DATABASE_URL
if (!url) throw new Error('Set DATABASE_URL')
if (process.env.NEXT_PUBLIC_APP_ENV === 'production') {
  throw new Error('The demo catalog is for local and preview databases only.')
}
const { db, close } = createDb(url, { max: 1, tcp: true })
try {
  await ensureSecondInstructor(db)
  const existing = new Set(
    (await db.select({ title: schema.courseRevisions.title }).from(schema.courseRevisions)).map(
      (r) => r.title,
    ),
  )
  for (const [i, spec] of courses.entries()) {
    if (existing.has(spec.title)) {
      console.info(`skip  ${spec.title} (already there)`)
      continue
    }
    console.info(`added /courses/${await publish(db, spec, i)}`)
  }
} finally {
  await close()
}
