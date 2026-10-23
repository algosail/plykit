import { listen, serve } from '@algosail/plykit/node'
import application from './app.ts'

const running = await listen (await serve (application))
console.log (`http://localhost:${running.port}`)
