import { randomInt } from 'node:crypto'
import { uuidv7 } from 'uuidv7'

/** Time-ordered UUIDv7 primary key (docs/05 §1). */
export const newId = (): string => uuidv7()

// Crockford base32 without I, L, O, U: easy to read aloud and type from a receipt.
const PUBLIC_ID_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

/** Short public identifier, e.g. `publicId('TL')` → `TL-7K3M9Q2A`. Never sequential. */
export function publicId(prefix: string, length = 8): string {
  let out = ''
  for (let i = 0; i < length; i++) out += PUBLIC_ID_ALPHABET[randomInt(PUBLIC_ID_ALPHABET.length)]
  return `${prefix}-${out}`
}
