import { dev, listen } from '@algosail/plykit/node'
import application from './app.ts'

const running = await listen (await dev (application))
console.log (`http://localhost:${running.port}`)
