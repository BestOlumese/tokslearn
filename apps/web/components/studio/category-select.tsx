import type { CategoryDto } from '@tokslearn/contract'
import { Select } from '@tokslearn/ui/select'
import type { ComponentProps } from 'react'

/** Subcategories grouped under their top category (docs/05 categories, two levels). */
export function CategorySelect({
  categories,
  ...props
}: { categories: ReadonlyArray<CategoryDto> } & ComponentProps<'select'>) {
  return (
    <Select {...props}>
      <option value="">Choose a category</option>
      {categories.map((top) => (
        <optgroup key={top.id} label={top.name}>
          {top.children.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </optgroup>
      ))}
    </Select>
  )
}
