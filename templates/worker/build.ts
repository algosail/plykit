import { workerBuild } from '@algosail/plykit/build'
import application from './app.ts'

// The directory is copied here, in Node. The worker bundle has no usable
// import.meta.url, so this URL must not live on the application module.
await workerBuild ({
  ...application,
  assets: { dir: new URL ('./static/', import.meta.url) },
})
