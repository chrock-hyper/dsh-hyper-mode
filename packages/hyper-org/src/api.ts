/**
 * The order board's HTTP surface.
 *
 * This file is the stable entry point only: the route table lives in
 * `api/routes.ts`, the payload assembly in `api/handlers.ts`, and the transport
 * helpers in `api/http.ts`. Keeping the historical path means the mounting
 * plugin and `test/api.test.js` import the same names they always did.
 *
 * @module @chrock-studio/dsh-hyper-org/api
 */
export { API_PREFIX, createApiHandler } from './api/routes.ts'
export type { ApiHandlerOptions, ResolvedSessionInput } from './api/routes.ts'
