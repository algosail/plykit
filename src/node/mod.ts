/**
 * The Node host: a process and a port.
 * The same `Config` as a Worker, without Wrangler and without platform bindings.
 */
export { app, dev, serve } from './host.ts'
export { listen } from './listen.ts'
export type { Listening } from './listen.ts'
