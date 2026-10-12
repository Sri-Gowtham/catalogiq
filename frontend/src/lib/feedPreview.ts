export const MAX_FEED_BYTES = 5 * 1024 * 1024

export interface FeedPreview {
  columns: string[]
  rows: string[][]
  total: number | null
}

/** Splits one CSV line, honouring quoted fields and doubled quotes. */
function splitCsvLine(line: string): string[] {
  const out: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cell += '"'
        i++
      } else if (ch === '"') quoted = false
      else cell += ch
    } else if (ch === '"') quoted = true
    else if (ch === ',') {
      out.push(cell)
      cell = ''
    } else cell += ch
  }
  out.push(cell)
  return out.map((c) => c.trim())
}

/** Returns an error message when the file cannot be a supplier feed, otherwise null. */
export function checkFeedFile(file: File): string | null {
  if (!/\.(csv|json)$/i.test(file.name)) return 'Use a .csv or .json file.'
  if (file.size === 0) return 'This file is empty.'
  if (file.size > MAX_FEED_BYTES) return `This file is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is 5 MB.`
  return null
}

/** Reads just enough of the file to show the header and first rows before anything is sent to the server. */
export async function previewFeed(file: File, limit = 5): Promise<FeedPreview> {
  const text = await file.text()
  if (/\.json$/i.test(file.name)) {
    const data: unknown = JSON.parse(text)
    const list = Array.isArray(data) ? data : data && typeof data === 'object' ? Object.values(data).find(Array.isArray) : null
    if (!Array.isArray(list) || list.length === 0 || typeof list[0] !== 'object' || list[0] === null) throw new Error('Expected a list of product records.')
    const columns = [...new Set(list.slice(0, 50).flatMap((r) => Object.keys(r as object)))]
    return { columns, rows: list.slice(0, limit).map((r) => columns.map((c) => String((r as Record<string, unknown>)[c] ?? ''))), total: list.length }
  }
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '')
  if (lines.length < 2) throw new Error('Expected a header row and at least one product.')
  return { columns: splitCsvLine(lines[0]), rows: lines.slice(1, 1 + limit).map(splitCsvLine), total: lines.length - 1 }
}
