# Reading Room

An application on `@algosail/plykit` that serves two purposes at once: the
package tests are run against it, and it shows how the framework looks at work.

Four books, one lending desk, and as many notes in the margins as you like. The
plot is small on purpose: every capability here is needed by someone, not set
beside the rest just to be shown.

## How the code is laid out

Six layers, and each knows only those beneath it.

```
app.ts            the assembly: routes, head, config
serve.ts          one line, to bring this up

records/          they store, and know nothing of anyone looking
  kept.ts         the only mutable cell: `look` and `change` are effects
actions.ts        they change things and say so — between records and routes
live.ts           what the reading room says aloud: a function for each
session.ts        who is asking          state.ts   what a request carries
middleware.ts     what every answer passes through
answers.ts        how a read that did not happen becomes an answer

ui/               views that know no route
  theme.ts        one stylesheet for all of them
  text.ts         link, quiet, vacant — a link, gray text, the empty line
  button.ts       the button on the page, posted as a form
  sign.ts         the sign-in field and the sign-out button
  header.ts       the bar: shelf links, and a name or the sign-in field
  listing.ts      rows of titles       notes.ts   rows of notes
  margins.ts      notes, borrow or return, and the field to write

layouts/          room.ts · shelf.ts · error.ts
islands/          desk.ts · mark.ts · reading.ts
routes/           each one: load, head, view, on — and nothing else
```

The rule for putting something in `ui/`: a view that two places draw, or a view
so large that the route can no longer be read. `margins.ts` was put there for
the second reason, and happened to match the first: `part` wraps exactly it.

## What is shown where

| Capability                              | Where                                                                                                 |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| A page with a segment, `head` from data | [`routes/book.ts`](routes/book.ts), [`routes/shelf.ts`](routes/shelf.ts)                              |
| Nested layouts                          | [`layout.ts`](layout.ts) — `shell`, and `onShelf` inside it                                           |
| Its own error view                      | [`layout.ts`](layout.ts) — `error`, the same markup without the menu                                  |
| A form with no line of script           | [`routes/book.ts`](routes/book.ts) — `on.POST` and a redirect back                                    |
| A partial update by that same form      | there too — `part` around the region, `into` on the forms                                             |
| An endpoint and a JSON refusal          | [`routes/api.ts`](routes/api.ts)                                                                      |
| Static pages and files                  | `static: true` in [`routes/about.ts`](routes/about.ts) and `/api/books`                               |
| Feed, sitemap, robots                   | [`app.ts`](app.ts)                                                                                    |
| A session on a signed cookie            | [`session.ts`](session.ts) — `signing`, `F.cache`, `openSigned`                                       |
| A reader's own page                     | [`routes/me.ts`](routes/me.ts) — what signing in gives                                                |
| Request state                           | [`state.ts`](state.ts)                                                                                |
| Middleware: CORS, CSRF, CSP, ETag, slash | [`middleware.ts`](middleware.ts)                                                                     |
| Middleware bound to a route             | there too — `only([deskRoute, meRoute])` guards both of a reader's pages                              |
| Middleware that waits                   | there too — `sliding`, written by hand, because stamping a cookie is work                             |
| Events from the server                  | [`live.ts`](live.ts), declared by [`routes/book.ts`](routes/book.ts) and [`routes/api.ts`](routes/api.ts) |
| Styles bundled with whoever reads them  | [`styles.ts`](styles.ts) — the shell, and `css` inside each island                                    |

## Three ways to write a component

The islands are different on purpose — each shows its own way, and all three are real.

**[`islands/reading.ts`](islands/reading.ts) — a change as a function, and not a
single effect.** Everything that can happen to the list is `State -> State`, so
the fold here is one line: `hold` applies what arrived to what was there. No
tag, no `switch`, no `dispatch` — nothing to take apart, and the changes are
composed in the ordinary way and tested with no machinery around them.

There is no subscription either: `subscribe` is an effect, and here everything
is described. A row returns from `component` not only its view but its changes,
`keyedOn` gives the stream of built rows, and `switchMap` listens to the set
that is there now. The circle — markup gives rise to changes, and is built from
state folded out of those same changes — is not closed here: `S.loop` receives
the state it is about to fold and takes what was built from it, so the body has
no forward reference. There are no casts either: `keyedOn` does not lose the
type of what the row built.

It lives on "my shelf" as the "read later" draft: it is honestly local, in this
tab, and labeled as such — unlike the loans and the notes, which go to the
server.

**[`islands/mark.ts`](islands/mark.ts) — a control as a value.** The buttons
are declared before it is decided what pressing them means: `events` takes a
stream from them, and the two streams merge into one. Along with that, `svgEl`
is a bar whose width follows the same value as the number beside it.

**[`islands/desk.ts`](islands/desk.ts) — a setup that owns something.**
`heard` listens to the server channel, the subscription is given to `scope`,
and it is released together with the island. Both the class and the word follow
one stream — there is no second mechanism.

## Run

```bash
npm run demo
```

Brings the reading room up at <http://localhost:8000> (the port is changed
through `PORT`). This is `dev`, not `serve`: the island chunks are built at
startup, every answer is written to the log, and an open page reloads itself
when `--watch` brings the server up again. The chunks are put in `static/_kit/`
— every run builds them, and they have nothing to do in the repository.

The package tests are run against the same application:

```bash
npm test
```
