export function isValidJson(str: string): boolean {
  try {
    JSON.parse(str)
    return true
  } catch {
    return false
  }
}

export function isValidHeadersJson(str: string): boolean {
  try {
    const parsed = JSON.parse(str)
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return false
    return Object.values(parsed).every((v) => typeof v === "string")
  } catch {
    return false
  }
}
