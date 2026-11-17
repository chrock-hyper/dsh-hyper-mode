/**
 * Page identity: the sha1 of a body.
 *
 * A draft records the sha1 of the page body it was written against, so
 * "is this draft stale?" is one string comparison. The digest is also the
 * `base` a draft carries through approval.
 *
 * @module @chrock-hyper/dsh-hyper-wiki/page/hash
 */
import { createHash } from 'node:crypto'

/**
 * sha1 of a string, hex encoded.
 * @param text - bytes to hash, treated as UTF-8.
 * @returns the 40-character lowercase hex digest.
 */
export function sha1Hex(text: string): string {
  return createHash('sha1').update(text, 'utf8').digest('hex')
}
