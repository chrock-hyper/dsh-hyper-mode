/**
 * Model routing for a delegated role.
 *
 * @module @chrock-studio/dsh-hyper-roles/tools/model-options
 */

/**
 * Translate a card's `model` field into the runtime's agent options.
 *
 * `provider/model` names both halves; a bare `model` pins only the model and
 * lets the runtime resolve its provider from the default route.
 * @param ref - the card's model field, possibly absent or empty.
 * @returns agent options, or undefined when the card pins no model.
 */
export function modelOptions(ref) {
  if (typeof ref !== 'string') return undefined
  const text = ref.trim()
  if (text === '') return undefined
  const slash = text.indexOf('/')
  if (slash > 0 && slash < text.length - 1) {
    return { provider: text.slice(0, slash), model: text.slice(slash + 1) }
  }
  return { model: text }
}
