/**
 * The `/wiki` HTTP routes the Web panel talks to.
 *
 * The panel has no session, so every request names a scope (`global` or
 * `project`) and, for a project scope, a directory: either an explicit `cwd`
 * query parameter or the most recent project the agent tools recorded.
 *
 * Authorization comes from the composition's `connection` service — its
 * Host/Origin fence and browser authentication — and falls back to loopback
 * only when that service is absent.
 *
 * This module is the facade: transport lives in `api/http.js`, the route table
 * in `api/routes.js`, the handlers in `api/reads.js` and `api/writes.js`, and
 * dispatch in `api/router.js`.
 *
 * @module @chrock-hyper/dsh-hyper-wiki/api
 */
export { isLoopbackAddress, MAX_BODY_BYTES, statusFor } from './api/http.ts'
export { createWikiApi } from './api/router.ts'
export { WIKI_ROUTE_PREFIX } from './api/routes.ts'
