import messages from './messages'

// Material names: non-empty, at most 20 characters (internal spaces count toward
// the limit; leading/trailing are trimmed), and unique case-insensitively across
// the project library. Returns an error message, or null when valid. Mirrors the
// backend's §7 rules so an invalid rename is blocked before the PATCH.
export const MAX_NAME_LENGTH = 20

export function validateMaterialName(value: string, existingLowercase: Set<string>): string | null {
  const trimmed = value.trim()
  if (trimmed === '') return messages.nameRequired
  if (trimmed.length > MAX_NAME_LENGTH) return messages.nameTooLong
  if (existingLowercase.has(trimmed.toLowerCase())) return messages.nameExists
  return null
}
