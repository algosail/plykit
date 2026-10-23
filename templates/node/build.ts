import { build, chunkDir, report } from '@algosail/plykit/build'
import application from './app.ts'

const outDir = await chunkDir (application)
console.log (report (await build ({ ...application, outDir })))
