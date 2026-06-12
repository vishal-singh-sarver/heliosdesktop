import messages from './messages'

// Group names: non-empty, at most 20 characters (internal spaces count toward
// the limit; leading/trailing are trimmed), and unique across groups
// (case-insensitive). Returns an error message, or null when valid.
export const MAX_NAME_LENGTH = 20

export function validateGroupName(value: string, existingLowercase: Set<string>): string | null {
  const trimmed = value.trim()
  if (trimmed === '') return messages.nameRequired
  if (trimmed.length > MAX_NAME_LENGTH) return messages.nameTooLong
  if (existingLowercase.has(trimmed.toLowerCase())) return messages.nameExists
  return null
}
