import type { Metadata } from 'next'
import { ContentPage } from '@/components/site/content-page'

export const metadata: Metadata = {
  title: 'Content rules',
  description:
    'What instructors and learners can and can’t publish on Tokslearn, the quality bar for courses, and what happens when rules are broken.',
}

// docs/25 part A. Becomes /legal/content-policy after legal review (Phase 11).
export default function ContentPolicyPage() {
  return (
    <ContentPage
      title="Content rules"
      description="What can go on Tokslearn: courses, lessons, files, posts and reviews. Reviewers check every course against these rules before it goes on sale."
      updated="Plain-language draft. The legal version replaces this page before launch."
    >
      <h2>What you can't publish</h2>
      <ol className="mt-4 list-decimal pl-6 [&_li]:mt-2">
        <li>
          Content you don't have the right to use: pirated courses, other people's videos,
          copyrighted books or PDFs, software cracks.
        </li>
        <li>
          Anything illegal, or instructions for it: fraud or “yahoo” schemes, getting into accounts
          you don't own, fake documents, drugs, weapons.
        </li>
        <li>
          Get-rich-quick offers, guaranteed income, ponzi or MLM recruitment, betting “sure odds”,
          or forex and crypto signals sold as guaranteed profit.
        </li>
        <li>
          Medical, legal or financial advice presented as professional advice without the
          qualification and a clear disclaimer; anything that encourages self-harm or dangerous
          practices.
        </li>
        <li>
          Hate, harassment, threats or sexual content. Content that sexualises children is removed
          at once and reported to the authorities.
        </li>
        <li>
          Exam leaks: real questions from WAEC, JAMB, ICAN or other exams presented as leaked or
          current papers. Past questions from legitimately published sources are fine.
        </li>
        <li>
          Misleading certificates: saying a Tokslearn certificate is accredited, licensed or equal
          to a professional qualification, unless we've seen the proof and approved it.
        </li>
        <li>
          Selling outside Tokslearn: bank details, WhatsApp or Telegram links to sell the same
          content elsewhere, or asking learners to pay you directly.
        </li>
        <li>
          Spam: repeated posts, affiliate link dumps, fake reviews, review swaps, or reviewing your
          own course.
        </li>
        <li>
          Other people's personal data: phone numbers, addresses, screenshots of private chats.
        </li>
      </ol>

      <h2>The quality bar for courses</h2>
      <ul>
        <li>Paid courses have at least 30 minutes of video, or 5 substantial lessons.</li>
        <li>
          Audio you can hear without straining, screen recordings at 720p or better, and no long
          silent stretches.
        </li>
        <li>The title, description and outcomes match what the course actually teaches.</li>
        <li>
          Promotion only in the last lesson or your instructor bio, with at most one link to your
          own website.
        </li>
        <li>The course is taught in the language it says it is.</li>
      </ul>

      <h2>What happens when a rule is broken</h2>
      <p>
        Usually in this order: a warning, the content removed, a strike, the course unpublished,
        then the account suspended. Three strikes in 12 months ends teaching on Tokslearn. Serious
        cases (child safety, fraud, large-scale piracy) skip straight to the end. Earnings from
        pirated content are held and refunded to the learners who paid.
      </p>
      <p>
        Every action names the rule that was broken. You can appeal once, and a different member of
        staff looks at the appeal.
      </p>

      <h2>Reporting something</h2>
      <p>
        If you see content that breaks these rules, or your own work copied without permission,
        email <a href="mailto:support@tokslearn.com">support@tokslearn.com</a> with the link and
        what's wrong. We act on copyright complaints within 48 hours.
      </p>
    </ContentPage>
  )
}
