import { worker } from '@algosail/plykit/workers'
import application from './app.ts'
import record from './dist/record.json' with { type: 'json' }

export default worker (application, { record })

// When include contains 'live', export the class and add its binding in wrangler.jsonc:
// export { KitLive } from '@algosail/plykit/workers'
