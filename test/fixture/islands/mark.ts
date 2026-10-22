import * as P from '@algosail/ply'
import * as D from '@algosail/plydom'
import * as H from '@algosail/plydom/h'
import * as S from '@algosail/plystream'
import { css, island } from '../../../src/mod.ts'

/** How long the book is, and where the reader left off. */
export type Props = {
  readonly pages: number
  readonly at: number
}

type Events = {
  readonly back: S.Stream<Event>
  readonly forward: S.Stream<Event>
}

type Step = (n: number) => number

/** Its own styles, so they are bundled with it and with nothing else. */
export const style = css`
  .mark {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-variant-numeric: tabular-nums;
  }
  .mark button {
    width: 2rem;
    border: 1px solid #ded6c6;
    border-radius: 0.25rem;
    background: #fffdf8;
    cursor: pointer;
  }
  .mark output {
    min-width: 4rem;
    text-align: right;
  }
  .done {
    color: #4f7a34;
  }
`
const STEP = 10
const WIDTH = 160
const HEIGHT = 6

const clamp = (pages: number) => (page: number): number =>
  P.clamp (0, pages) (page)

const addPages = P.add (STEP)
const subPages = P.sub (STEP)

export const mark = island ('mark', ({ pages, at }: Props, on: Events) => {
  const steps = S.mergeArray ([
    P.map (P.K (addPages)) (on.forward),
    P.map (P.K (subPages)) (on.back),
  ])

  const applyStep = (at: number, apply: Step) => clamp (pages) (apply (at))

  const page = S.hold (applyStep, at) (steps)
  const share = P.map (P.div (pages)) (page)
  const done = P.map (P.gte (pages)) (page)

    return H.p ({ class: style.mark }, [
      D.use ({ back: 'click' }) (H.button ({ type: 'button' }, ['−'])),

      H.output ([page, ` of ${pages}`]),

      D.use ({ forward: 'click' }) (H.button ({ type: 'button' }, ['+'])),

      D.svgEl ('svg', { width: String (WIDTH), height: String (HEIGHT) }, [
        D.svgEl ('rect', {
          width: String (WIDTH),
          height: String (HEIGHT),
          fill: '#efe9dc',
        }),
        D.svgEl ('rect', {
          width: P.map ((s: number) => String (Math.round (s * WIDTH))) (share),
          height: String (HEIGHT),
          fill: '#7a4b1e',
        }),
      ]),

      D.when (() => H.small ({ class: style.done }, ['finished'])) (done),
    ])
  },
  import.meta.url,
)
