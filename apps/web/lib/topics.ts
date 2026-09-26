// Starter topics for the pre-launch home page. Phase 3 replaces this list with the real category
// tree from `catalog.categories` (docs/20 §1, /categories). Until then each topic runs a search.

export interface Topic {
  name: string
  examples: string
  query: string
}

export const topics: ReadonlyArray<Topic> = [
  { name: 'Excel and data', examples: 'Excel, Power BI, SQL', query: 'excel' },
  { name: 'Programming', examples: 'Python, JavaScript', query: 'programming' },
  { name: 'Design', examples: 'Figma, UI/UX, graphics', query: 'design' },
  { name: 'Marketing', examples: 'Social media, ads', query: 'marketing' },
  { name: 'Accounting', examples: 'Bookkeeping, tax', query: 'accounting' },
  { name: 'Business', examples: 'Sales, small business', query: 'business' },
  { name: 'Photo and video', examples: 'Filming, editing', query: 'video' },
  { name: 'IT and cloud', examples: 'Cloud, cybersecurity', query: 'cloud' },
]

export const exampleSearches = ['Excel', 'Python', 'Figma', 'Digital marketing'] as const
