import * as H from '@algosail/plydom/h'
import { island } from '../src/islands/island.ts'

export const make = (name: string, moduleUrl: string) =>
  island (
    name,
    (_props: Record<string, never>) => (H.div ([name])),
    moduleUrl,
  )
