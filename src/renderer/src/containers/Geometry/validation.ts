import messages from './messages'

// Tree names: non-empty, at most 20 characters (internal spaces count toward
// the limit; leading/trailing are trimmed), and unique within their own kind
// (case-insensitive). Returns an error message, or null when valid.
export const MAX_NAME_LENGTH = 20

/**
 * @param existingLowercase names already taken IN THIS NODE'S KIND — the caller
 *   picks the group set or the leaf set; the two are separate namespaces.
 * @param isGroup which kind is being renamed. It only changes the WORDING of the
 *   clash: reporting "Geometry name already exists" for a group-to-group clash
 *   points at a geometry that need not exist at all.
 */
export function validateGroupName(
  value: string,
  existingLowercase: Set<string>,
  isGroup = false
): string | null {
  const trimmed = value.trim()
  if (trimmed === '') return messages.nameRequired
  if (trimmed.length > MAX_NAME_LENGTH) return messages.nameTooLong
  if (existingLowercase.has(trimmed.toLowerCase())) {
    return isGroup ? messages.groupNameExists : messages.nameExists
  }
  return null
}
