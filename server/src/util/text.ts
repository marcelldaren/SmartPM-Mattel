/**
 * Local models occasionally emit HTML fragments (e.g. `<br>`) instead of plain text
 * even when told not to. Since this text is rendered as plain text client-side, strip
 * tags and convert common line-break markup to real newlines as a safety net.
 */
export function stripHtml(text: string): string {
  return text
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
