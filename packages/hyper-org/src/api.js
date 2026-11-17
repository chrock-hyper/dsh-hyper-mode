/**
 * The order board's HTTP surface.
 *
 * This file is the stable entry point only: the route table lives in
 * `api/routes.js`, the payload assembly in `api/handlers.js`, and the transport
 * helpers in `api/http.js`. Keeping the historical path means the mounting
 * plugin and `test/api.test.js` import the same names they always did.
 *
 * @module @chrock-studio/dsh-hyper-org/api
 */
export { API_PREFIX, createApiHandler } from './api/routes.js'
