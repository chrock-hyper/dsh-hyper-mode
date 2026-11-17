/**
 * The wiki route table.
 *
 * The prefix is shared by the router, both handlers, and the plugin assembly;
 * the two sets below are what the method check in the router reads.
 *
 * @module @chrock-hyper/dsh-hyper-wiki/api/routes
 */

/** Route prefix; the whole API sits under it. */
export const WIKI_ROUTE_PREFIX = '/wiki'

/** Sub-paths that answer GET (and HEAD). */
export const READ_PATHS = new Set(['/state', '/pages', '/page', '/drafts', '/pending', '/search', '/backlinks'])

/** Sub-paths that answer POST. `/page` is the only one that also reads. */
export const WRITE_PATHS = new Set(['/draft', '/approve', '/reject', '/page', '/delete', '/rename'])
