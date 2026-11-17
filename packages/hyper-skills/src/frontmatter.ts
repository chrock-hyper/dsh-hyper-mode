/**
 * Skill 文件的 frontmatter 读取。
 *
 * Frontmatter 本来是 YAML 文档，但命令只需要 `name` 与 `description` 两个标量，
 * 所以这里只接受 skill 实际会用的形状（裸值、引号、折叠块），两个字段缺一个就
 * 丢弃——与 provider 一致：坏掉的 skill 是跳过，不是让整个编目失败。
 *
 * @module @chrock-hyper/dsh-hyper-skills/frontmatter
 */
import { readFileSync } from 'node:fs'

/** The two frontmatter fields the command needs. */
export interface SkillFrontmatter {
  name: string
  description: string
}

/**
 * Read the `name` and `description` fields from one skill file.
 *
 * Frontmatter is a YAML document, but the command only needs two scalar fields,
 * so this accepts the shapes skills actually use (plain, quoted, folded block)
 * and drops anything without both fields — mirroring the provider, which also
 * skips a malformed skill instead of failing the catalog.
 * @param file - absolute path to a `SKILL.md` or flat `<name>.md`.
 * @returns the parsed fields, or undefined for an unreadable or invalid file.
 */
export function parseSkillFile(file: string): SkillFrontmatter | undefined {
  let text: string
  try {
    text = readFileSync(file, 'utf8')
  } catch {
    return undefined
  }
  const block = /^\uFEFF?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text)
  if (!block) return undefined
  const fields = parseFields(block[1] ?? '')
  const name = fields.name
  const description = fields.description
  if (typeof name !== 'string' || name === '') return undefined
  if (typeof description !== 'string' || description === '') return undefined
  return { name, description }
}

/**
 * Parse the two frontmatter fields this command reads.
 * @param block - frontmatter lines between the `---` fences.
 * @returns the name and description found, possibly empty.
 */
function parseFields(block: string): Record<string, string> {
  const fields: Record<string, string> = {}
  const lines = block.split(/\r?\n/)
  for (let index = 0; index < lines.length; index += 1) {
    const match = /^([A-Za-z0-9_-]+):[ \t]*(.*)$/.exec(lines[index] ?? '')
    if (!match) continue
    const key = match[1] ?? ''
    const raw = match[2] ?? ''
    if (key !== 'name' && key !== 'description') continue
    let value = raw.trim()
    if (/^[>|][-+]?$/.test(value)) {
      const collected: string[] = []
      while (index + 1 < lines.length) {
        const next = lines[index + 1] ?? ''
        if (next.trim() === '') {
          index += 1
          continue
        }
        if (!/^[ \t]+\S/.test(next)) break
        collected.push(next.trim())
        index += 1
      }
      value = collected.join(' ').trim()
    }
    fields[key] = unquote(value)
  }
  return fields
}

/**
 * Strip one pair of matching YAML quotes.
 * @param value - raw scalar text.
 * @returns the unquoted scalar.
 */
function unquote(value: string): string {
  if (value.length < 2) return value
  const first = value[0]
  const last = value[value.length - 1]
  if ((first === '"' && last === '"') || (first === "'" && last === "'")) return value.slice(1, -1)
  return value
}
