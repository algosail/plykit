# plykit

A framework for pages the server draws in full. The browser gets a script
only for an island: a piece of the page that itself said it needs a client.

A route is a value in the `routes` list, not a file in a directory. An island
is a named component. [plydom](https://github.com/algosail/plydom) builds the
markup: an element is a value, an event is a stream, state is a fold of a
stream. Next to it stand `@algosail/ply`, `@algosail/plyfuture`, and
`@algosail/plystream`.

Production is a Cloudflare Worker. Deno Deploy, which the framework was
written for earlier, is shutting down. Local Cloudflare is `wrangler dev`,
which runs the application's build. That script calls `workerBuild`.

```
page   = the server drew the markup, zero scripts
island = a piece of that markup the browser brings up again
```

## Contents

- [Entry points](#entry-points)
- [Application](#application)
- [Routes](#routes)
- [Load and reply](#load-and-reply)
- [Reading the request](#reading-the-request)
- [Handler](#handler)
- [Middleware](#middleware)
- [Cookies, signing, form protection](#cookies-signing-form-protection)
- [Islands](#islands)
- [Styles](#styles)
- [Navigation, page parts, live updates](#navigation-page-parts-live-updates)
- [Document and markup](#document-and-markup)
- [Data read at build](#data-read-at-build)
- [Feeds, sitemap, robots](#feeds-sitemap-robots)
- [Build](#build)
- [Deploy to Cloudflare Workers](#deploy-to-cloudflare-workers)
- [Platform: bindings and data](docs/cloudflare.md)
- [Node](#node)
- [Static site](#static-site)

## Entry points

The package is built: what it gives out is JavaScript and `.d.ts`. The
application stays source. Node 22.7 or newer.

| import | what you take from here |
| --- | --- |
| `@algosail/plykit` | runtime: routes, replies, islands, the `handler` |
| `@algosail/plykit/build` | `workerBuild`, the island compiler, `stage`, a static site |
| `@algosail/plykit/workers` | `worker` and the Durable Object `KitLive` |
| `@algosail/plykit/node` | `dev`, `serve`, and `listen`: the same app on a Node port |

The worker imports `@algosail/plykit/workers` and the application config. The
config imports the runtime. Do not import `@algosail/plykit/build` or
`@algosail/plykit/node` from the worker graph: that is disk, esbuild, and
`node:http`.

Day to day you run Wrangler, and Wrangler runs `npm run build`. That script
calls `workerBuild` from `@algosail/plykit/build`. The files under `templates/worker/`
are a starting `wrangler.jsonc`, `worker.ts`, `build.ts`, `app.ts`, and
`package.json`.

```sh
wrangler dev
wrangler deploy
```

`templates/node/` is the other host, on a Node port. It is described in [Node](#node).

The application is `app.ts` in the current directory. The default export is a
`Config`.

```ts
import type { Config } from '@algosail/plykit'
import { home } from './routes/home.ts'

const application: Config = { routes: [home] }
export default application
```

`workerBuild(application, { dev: true })` is the unminified build that
`wrangler dev` asks for. Pass Wrangler flags to `wrangler` itself.

## Application

`Config` is the application. `worker`, `workerBuild`, `build`, `dev`, and
`serve` take it. The `routes` field is required. The rest is filled in when
it is needed.

| field | what for |
| --- | --- |
| `routes` | pages, endpoints, nested lists after `layout` |
| `state` | `(request) => Future<S>`. Required when the config has a state type |
| `through` | middleware from the outside in: the first wraps the rest |
| `ahead` | replies that one `Request` is enough for. The first to say a reply wins |
| `lang` | the document language, a string or a function of the context |
| `dir` | `ltr`, `rtl`, `auto`, or a function that may return `undefined` |
| `head` | the default document head. A layout or a page replaces any field it sets |
| `error` | failure markup. The status and the message by default |
| `onHazard` | `(hazards, url) => void`. Markup the parser will rewrite, an island with no chunk, an action into an empty region |
| `styles` | `(markup) => string`, ready `<style>` tags |
| `always` | addresses of module scripts that are on every page |
| `outDir` | the directory of island chunks |
| `base` | the prefix of those chunks. `/_kit/` by default |
| `assets` | a directory of your own files: images, fonts |
| `include` | islands of kit itself: `'navigation'`, `'live'`, `'reload'` |
| `build` | build islands when a host starts. `workerBuild` always builds |
| `minify` | compress chunks. `wrangler dev` leaves them readable |
| `prebuilt` | answer a static page from `kit-data.json`. The worker reads `record.json`, and `wrangler dev` leaves that data empty |

`head` is the default document head. A layout replaces any field it sets, for the routes it wraps. A page replaces any field it sets, after the layouts. A field that is omitted stays, so the innermost value wins. `title` is a `P.Maybe<string>`. `P.nothing()` and an empty `meta` or `link` list are values, and they replace what is outside. Kit's own stylesheet is added after this, so a page that replaces `link` still gets it.

```ts
head: {
  title: P.just('Room'),
  link: [{ rel: 'stylesheet', href: '/static/styles.css' }],
}
```

`assets`:

| field | what for |
| --- | --- |
| `dir` | a directory, a `URL`, or a path |
| `base` | the prefix. `/static/` by default |
| `cache` | `(name) => cache-control` |
| `serves` | `(name) => boolean`, which names this directory serves |

Where chunks are put if the directory is not named:

1. `outDir`, if it is set.
2. Otherwise `.kit` at the application root, the current directory. This folder is kit's own, the way `.next` is Next's. It is not written inside `assets`.

The browser still asks for those files at `/_kit/` (or `base`). `assets` stays the application's own files, at `/static/` unless `assets.base` says otherwise.

`assets` is set on the application when the host that reads `assets.dir` is Node. `workerBuild` copies `assets.dir` and does not look for a `static/` directory on its own. `assets.dir` is a build setting. The worker does not read it: it serves the prefix recorded in `record.json`, which is `assets.base`, or `/static/` when `base` is omitted. A relative string for `dir` is resolved from the filesystem root, the same way as `stage`'s `to`. A URL next to the module stays next to the module.

On the Node host, `import.meta.url` is a file URL, so the directory can sit on the application:

```ts
assets: { dir: new URL('./static/', import.meta.url) }
```

A Worker bundles `app.ts`. `import.meta.url` inside that bundle is not a valid URL, and `new URL` throws while the isolate starts. Put the directory on the object passed to `workerBuild`, in `build.ts`, which Node runs:

```ts
await workerBuild({
  ...application,
  assets: { dir: new URL('./static/', import.meta.url) },
})
```

A relative `outDir` is resolved from the current directory. The `to` field of
`stage` does not work that way: a relative string there is resolved from the
filesystem root. `workerBuild` passes an absolute `dist`. From your own
script, pass `resolve('dist')` or a `file:` URL.

## Routes

A pattern is a path of pieces joined by `/`, written the way a server route is.

| pattern | what it takes |
| --- | --- |
| `/about` | this path |
| `/blog/:slug` | one segment, into `params.slug` |
| `/files/:path{.+}` | the whole tail, into `params.path` |
| `/files/*` | the same tail, into `params['*']` |

A tail, `:name{.+}` or `*`, stands only last. `{.+}` is how a named tail is
written, not a regexp, and another expression in the braces is refused.
There is no optional segment: `:name?` is two routes. `[[lang]]` is not a
kit pattern. It is the i18n package's marker, and `translated` takes it out
before a route is built. A capture name is letters, digits and underscores.
A capture is decoded. The table is sorted so that a more exact pattern stands
earlier: `/blog/new` wins over `/blog/:slug`.

The route identifier is its pattern. It lands in `ctx.routeId`.

```ts
import * as P from '@algosail/ply'
import * as F from '@algosail/plyfuture'
import * as H from '@algosail/plydom/h'
import { data, endpoint, json, layout, page } from '@algosail/plykit'

export const home = page({
  pattern: '/',
  view: () => H.section([H.h1(['Hello'])]),
})

export const book = page({
  pattern: '/book/:slug',
  load: (ctx) => F.resolve(data({ slug: ctx.params.slug })),
  head: (ctx) => ({ title: P.just(ctx.data.slug) }),
  view: (ctx) => H.article([H.h1([ctx.data.slug])]),
})

export const create = endpoint({
  pattern: '/book',
  on: {
    POST: () => F.resolve(json({ ok: true })),
  },
})

export const frame = layout({
  view: (ctx) => H.body([H.main([ctx.slot])]),
})

export const routes = [...frame([home, book]), create]
```

A page title is a `P.Maybe<string>` from `@algosail/ply`. An empty title is
`P.nothing()`, and that empty title replaces the one outside it. `meta` and
`link` are lists of attributes of the matching tags. Setting a list replaces
the list outside it. Omitting the field keeps it.

`page(spec)` builds a page.

| field | what for |
| --- | --- |
| `pattern` | the pattern |
| `view` | `(ctx) => View`. The context already has `data` |
| `load` | `(ctx) => Future<Loaded>`. No function means data `{}` and status 200 |
| `head` | `(ctx) => { title?, meta?, link? }`. A field it sets replaces the layout's, then the application's |
| `on` | handlers for methods that do not draw the page |
| `static` | the page can be written as a file |
| `paths` | `() => Future<Params[]>`, addresses for a pattern with captures |

`GET` and `HEAD` of a page draw it: first `load` on the layouts, then the
page `load`, then `view`. Your own `on.GET` or `on.HEAD` stands in place of
drawing. `HEAD` without its own handler looks at `on.GET`, then draws the
page. Other methods are looked up in `on`. No method means a 405 reply and an
`allow` header.

A page handler may return `data(...)`. The page is then drawn with that data,
and the layouts still read their own. `redirect` and `failed` from `load` or
from a handler go out on the wire as they are, without `view`.

`endpoint(spec)` is a path with no markup. It needs a `pattern` and `on`. The
handler reply is `json`, `text`, `html`, `noContent`, `redirect`, `failed`, or
your own `Sent`. `data(...)` from an endpoint is a 500: there is nothing to
draw.

`layout(spec)` returns a function. It takes routes and wraps pages. A layout
does not touch an endpoint. A layout `view` has `ctx.slot` — the page already
drawn — and `ctx.data` of what the layout `load` read. A layout `head` sees
that same data and replaces fields for the routes it wraps. An inner layout
replaces an outer one, and a page replaces both. Nesting is read from the
outside in:

```ts
const site = layout({ view: (ctx) => H.div([nav, H.main([ctx.slot])]) })
const docs = layout({ view: (ctx) => H.div([side, ctx.slot]) })

site([home, ...docs([intro, guide])])
```

`home` sits in `site`. `intro` sits in `site`, and inside that in `docs`.

`flat` unfolds that nesting into one list. `routeTable` builds the lookup
table. `lookupRoute(table)(path)` returns a `P.Maybe` of the route and
`params`. A path that is not there is `P.nothing()`.

`href(pattern)(params)` builds a path from the same pattern. A capture that is
missing or empty is `P.nothing()`. Values are encoded.

`parsePattern` parses a pattern into segments. `matchPattern(parsed)(path)`
matches a pattern that is already parsed. `comparePatterns` compares two
parsed patterns: that is how the table puts an exact path first. `localPath`
keeps only a path of this site: `/blog` passes, `//evil.test` and an absolute
foreign address do not.

`static: true` promises that one reply is good for everyone. `staticSite` and
the data prebuild take such routes on their own. A pattern with a capture
needs `paths`, or there is nothing to take addresses from.

```ts
export const book = page({
  pattern: '/book/:slug',
  static: true,
  paths: () => F.resolve([{ slug: 'hobbit' }, { slug: 'solaris' }]),
  load: (ctx) => F.resolve(data({ slug: ctx.params.slug })),
  view: (ctx) => H.article([ctx.data.slug]),
})
```

`aim(table)(state)(request, arrival?)` builds the context and says which
route claims the path. `arrival` carries the connection address and, when the
host passed them, `env` and `live`. Without `live`, the channel of this
process is used. `resolveRoute(route)(ctx)` runs that route: either the page
is not drawn yet (`tag: 'resolved'`), or the reply is already ready
(`tag: 'replied'`). No route means 404.

## Load and reply

One context for every function of the route.

| field | what is in it |
| --- | --- |
| `url` | the request `URL` |
| `params` | the pattern captures |
| `request` | the `Request` itself |
| `routeId` | the route pattern, or an empty string |
| `state` | what `state` returned. The function itself sees only the `Request` |
| `env` | platform bindings. The worker passes what Wrangler bound |
| `live` | the free channel of this request. `stale` and `announce` write here |
| `client` | `P.Maybe<string>`, the connection address, when there is one |

The address is taken from the connection, not from forwarding headers. The
worker puts `cf-connecting-ip` here.

`load` returns a `Future` of one of three:

| value | tag | when |
| --- | --- | --- |
| `data(value, status?)` | `data` | the page has something to show. Status 200 by default |
| `redirect(location, status?)` | `redirect` | send the client away. Status 303 by default. 301, 302, 303, 307, 308 are allowed |
| `failed(status)(message)` | `failure` | refuse. Inside, an `HttpError` with a status and text |

A reply on the wire is also three variants. `data` is not among them: by then
the page has already become markup.

| constructor | what you get |
| --- | --- |
| `json(value)` | a `Sent`. The body is `JSON.stringify`, the type is `application/json; charset=utf-8` |
| `text(content)` | text, `text/plain; charset=utf-8` |
| `html(markup)` | markup, `text/html; charset=utf-8` |
| `body(type)(content)` | your own body and your own `content-type`. `content` is a `BodyInit`, a stream included |
| `noContent()` | 204, no body |
| `redirect(location, status?)` | `location` goes through `encodeURI` |
| `failed(status)(message)` | a failure. On the wire this is JSON `{ error }` and the error status |

The reply is adjusted after that. All of these functions return the same
reply.

| function | what it changes |
| --- | --- |
| `withStatus(code)` | the status. On a failure, the error status changes. On a redirect, the code is accepted only if it is a redirect code |
| `withHeader(name)(value)` | one header. The new value wins |
| `withCookie(cookie)` | one more cookie. A cookie is not put on `data(...)`: that is not a reply yet |
| `vary(name)` | appends the name to `vary`, without wiping names already there |

`reply({ sent, redirect, failure })` takes the reply apart by tag, with no
branch left out. `statusOf` gets the status. `toResponse` makes a `Response`
from a reply: cookies become several `set-cookie` headers, a redirect gets
`location`.

`HttpError` is an ordinary error with a `status` field. It is thrown from
`load` and from a handler. Any other exception becomes a 500 failure.

## Reading the request

The names below are the ones the package exports the functions under. Inside
the modules they are shorter. Outside, they are told apart from replies of
the same name.

| function | what it returns |
| --- | --- |
| `readQuery(url)` | the query string, one value per name |
| `readQueryAll(url)` | the same, but an array of values per name |
| `readFields(request)` | a `Future` of form fields, one value per name |
| `readFieldsAll(request)` | the same, as an array |
| `readJson(request)` | a `Future` of the body as JSON |
| `readText(request)` | a `Future` of the body as a string |
| `readHeader(name)(request)` | a `P.Maybe` of one header |
| `readCookies(request)` | request cookies by name, already decoded |

```ts
import { endpoint, json, readFields } from '@algosail/plykit'
import * as P from '@algosail/ply'

export const save = endpoint({
  pattern: '/note',
  on: {
    POST: (ctx) => P.map((fields) => json({ text: fields.text }))(readFields(ctx.request)),
  },
})
```

## Handler

`handler(options)` is a function `(request, arrival?) => Promise<Response>`.
It does not build islands and does not read the disk. Pass the chunk manifest
in `chunks` if pages include them. This is the handler for a test and for
your own server that has already done the build itself.

`answer(options)` is the same thing, but a `Future` of the reply, not yet a
`Response`.

`renderToString(resolved)` draws one page that is already resolved: the body,
the status, and the `hazards` list. `renderDocument` assembles the document
around it.

On Workers, `worker(application, { record })` is that handler. The record
carries the chunk manifest. `handler` itself is what a test calls.

The order of one request:

1. `ahead`. Whoever returned a reply is the one that answered.
2. `state(request)`. There is no route context yet, so bindings and the channel do not come in here. The context is then built from `state` and `arrival`.
3. `through`, from the outside in.
4. The route. No route means 404. No method means 405.
5. Drawing the page, or the endpoint reply.

A page failure and a "no route" failure are drawn through `error` and become
a document. The failure's cookies and headers are kept. An endpoint failure
stays `failed`: on the wire that is JSON `{ error }`. An exception in `state`
gives a 500 document with the error text, without your `error`.

## Middleware

Middleware is a function that receives the next handler and returns its own.
In `through` the first element is the outer one.

| function | when to put it on |
| --- | --- |
| `stack([a, b])` | several layers as one. The first in the list is the outer one |
| `whenRequest(pred)(mw)` | the layer only for requests where the predicate is true |
| `only(routes)(mw)` | the layer only for these routes, not a second pattern |
| `before(ctx => ctx)` | change the context before the route |
| `after(reply => reply)` | change the reply |
| `around(ctx => reply => reply)` | change the reply while looking at the request |
| `watch(ctx => reply => void)` | look, and change nothing |
| `instead(ctx => reply)` | answer here. Nothing inside is called |

Ready-made layers:

| function | what it does |
| --- | --- |
| `cors(options?)` | `access-control-*` and the reply to `OPTIONS`. `origin` is `*` by default, methods are `GET, POST` plus `OPTIONS`, the header is `content-type`. `credentials` and `maxAge` are optional. A foreign origin, other than `*`, adds `vary: origin` |
| `csp(options?)` | a policy: `default-src 'self'`, `base-uri 'self'`, `frame-ancestors 'none'`, `object-src 'none'`. `directives` adds to it. `reportOnly: true` sets the report header |
| `etag()` | for `GET` and `HEAD` with status 200 and a string body, computes an `etag`. A matching `if-none-match` answers 304 with no body. A request with a cookie gets `vary: cookie` |
| `trailingSlash({ trailing? })` | one shape of the path. No trailing `/` by default, redirect 308. The root is left alone |
| `guard(options?)` | see [form protection](#cookies-signing-form-protection) |

`dashboard` in the example is a route already built. `auth` is your layer.

```ts
import { cors, csp, etag, guard, only, trailingSlash, whenRequest } from '@algosail/plykit'

const application = {
  routes,
  through: [
    trailingSlash({ trailing: false }),
    csp(),
    etag(),
    guard(),
    whenRequest((ctx) => ctx.url.pathname.startsWith('/api/'))(cors()),
    only([dashboard])(auth),
  ],
}
```

## Cookies, signing, form protection

`cookie(name)(value)` is a session cookie: path `/`, `httpOnly`, `secure`,
`sameSite: 'lax'`, no expiry. You then adjust it and put it on the reply.

| function | what it changes |
| --- | --- |
| `during(seconds)` | the expiry, in seconds |
| `at(path)` | the path |
| `readable` | takes `httpOnly` off |
| `insecure` | allows plain HTTP |
| `expire(name)` | a cookie of the same name with expiry 0, so the browser forgets it |
| `serializeCookie` | a `set-cookie` string |
| `parseCookies` | parses the `cookie` header |

```ts
import * as F from '@algosail/plyfuture'
import { cookie, during, redirect, withCookie } from '@algosail/plykit'

const visitor = during(60 * 60 * 24 * 7)(cookie('visitor')('7'))

endpoint({
  pattern: '/enter',
  on: {
    POST: () => F.resolve(withCookie(visitor)(redirect('/'))),
  },
})
```

A signature is HMAC-SHA-256. The value and the signature sit in one string,
separated by a dot.

`signing(secret)` returns a `Future` of the pair `{ sign, open }`. `seal(keys)`
signs a cookie value. `signedCookie(keys)(name)(value)` makes a session cookie
and signs it at once. `openSigned(keys)(name)(request)` checks the request
cookie and returns `Future<Maybe<string>>`. A signature that is not ours, or
a broken one, is empty. `base64Url` encodes bytes into the same form the
signatures are stored in.

`guard()` refuses an unsafe request that has not proved it came from this
site, and hands a token to the rest.

| | |
| --- | --- |
| cookie | `kit-csrf`. A script reads it. HTTPS only by default |
| form field | `_csrf` |
| header | `kit-csrf` |
| safe methods | `GET`, `HEAD`, and `OPTIONS` pass, and get the cookie if it is not there yet |
| the rest | the cookie and the field, or the header, must match. Otherwise a failure |

`origin` in the options is on by default: a foreign `Origin` is a failure
too. `secure: false` allows the cookie over HTTP. `csrfToken(request)` is
this request's token. `csrfProps(request)` is the props of the hidden field.

```ts
import * as H from '@algosail/plydom/h'
import { csrfProps } from '@algosail/plykit'

H.form({ method: 'post', action: '/note' }, [
  H.input(csrfProps(ctx.request)),
  H.input({ name: 'text' }),
  H.button(['write']),
])
```

The token appears after the request has gone through `guard`. A form on a
page that `guard` has not seen yet gets an empty value.

## Islands

`island(name, setup, import.meta.url)` declares an island and returns a
function of the props. You put it in the markup as an ordinary child. `setup`
is the same as `component` in plydom: `(props, on, start) => view`. The third
argument is the module the island was declared in: the build imports that
one. An event that feeds a fold is named with `.use({ name: 'click' })` and
read from `on`. An `on:click` listener is for an effect, not for state.

Props are JSON. An island name is unique in the application.

```ts
import * as S from '@algosail/plystream'
import * as H from '@algosail/plydom/h'
import { island } from '@algosail/plykit'

type Props = { readonly from: number }

export const counter = island(
  'counter',
  (props: Props, on: { bumped: S.Stream<Event> }) => {
    const count = S.hold((n: number) => n + 1, props.from)(on.bumped)
    return H.p([
      H.button(['+']).use({ bumped: 'click' }),
      H.output([count]),
    ])
  },
  import.meta.url,
)
```

```ts
import { counter } from '../islands/counter.ts'

export const home = page({
  pattern: '/',
  view: () => H.section([H.h1(['Hello']), counter({ from: 0 })]),
})
```

The build finds the island by the `import.meta.url` it was given, builds a
separate chunk, and includes that chunk only on the page where the island
stands. A page with no islands gets no script. Code shared by several islands
is pulled out into `chunk-<hash>.js`.

`hydrateIslands(root)` brings islands up inside a tree that already exists.
The chunk calls this itself. `usedIslands(markup)` lists the island names in
a finished string. `resetIslands` and `resetIslandsIn(root)` drop the
registration: the first globally, the second inside a node. Tests that build
the page more than once need this.

In the config `include` you name kit's islands, not your own:

| name | what it does on the page |
| --- | --- |
| `navigation` | follows links and submits forms without a full reload |
| `live` | one WebSocket on the page: `stale` and `announce` arrive through it |
| `reload` | reloads the open page when the server process starts again |

## Styles

A component names tokens. `tokens` is the table. `style` turns one declaration
into shared classes: the same `padding: '4'` anywhere in the app is one rule.
Put the calls below the function that reads them. The editor completes token
names from the table. No CSS-in-JS plugin.

```ts
import { tokens } from '@algosail/plykit'
import * as H from '@algosail/plydom/h'

export const card = (title: string) =>
  H.article({ class: cardClass }, [
    H.h2({ class: titleClass }, [title]),
  ])

const { style, recipe } = tokens({
  color: { text: '#2b2b2b', surface: '#fffdf8', accent: '#7a4b1e' },
  space: { 0: '0', 2: '0.5rem', 4: '1rem', 8: '2rem' },
  font: { serif: 'Georgia, serif' },
  media: { md: '(min-width: 40rem)' },
  keyframes: {
    spin: {
      from: { transform: 'rotate(0deg)' },
      to: { transform: 'rotate(360deg)' },
    },
  },
})

const cardClass = style({
  padding: '4',
  color: 'text',
  fontFamily: 'serif',
  hover: { background: 'surface' },
  md: { padding: '8' },
})

const titleClass = style({ margin: '0' })

const button = recipe({
  base: { padding: '2', background: 'surface' },
  variants: {
    tone: {
      quiet: { color: 'text' },
      solid: { background: 'accent', color: 'surface' },
    },
  },
  defaultVariants: { tone: 'quiet' },
})
```

A value outside a scale is written in brackets: `width: '[100%]'`. `hover`,
`focus`, `active`, and the keys of `media` are the only conditions, one level
deep. `animationName` takes a key of `keyframes`. The class goes on the element
it paints. Two elements that look the same share one `style` call.

A template string still works for a selector the atoms do not express. The
editor will not offer CSS completions in it unless a plugin does.

```ts
const s = css`
  .card { padding: 1rem }
`
```

Until the islands are built, styles travel in the `<style>` of the page that
used them. The build takes them into one file under the chunk prefix.
`collectStyles(markup)` gathers the tags for those blocks whose classes are
in the markup. A Worker keeps linking that file. A block compiled since the
file was written also goes out in the page, so a dev reload shows the change
before the next build. `styleSheet()` returns all of the registered CSS as a
string.
`styleIds()` is the block identifiers. `resetStyles()` clears the registry
between tests.

An island in the browser has no server `process.env`. The build replaces a
read of `process.env.KIT_PUBLIC_<NAME>` and `process.env['KIT_PUBLIC_<NAME>']`
with a literal. If the name is not in the environment, `void 0` stands in its
place, and `??` decides from there. A name with no prefix stays a read and
lands in a build warning. The prefix is exported as `PUBLIC_PREFIX` from
`@algosail/plykit/build`.

## Navigation, page parts, live updates

`part(id)` marks a region of the page. `into(id, mode?)` marks a link or a
form: the reply lands in that region instead of replacing the document. The
mode is `'replace'`, `'append'`, or `'prepend'`. Replacement is the default.

A region name is 1 to 64 characters: letters, digits, `_`, and `-`. The
request header that asks for a region is `kit-part`. The markup attributes
are `data-kit-part`, `data-kit-into`, and `data-kit-mode`.

```ts
import * as H from '@algosail/plydom/h'
import { into, part } from '@algosail/plykit'

H.form({ ...into('comments'), method: 'post' }, [field, send])
H.ul({ ...part('comments') }, items)
H.a({ ...into('feed', 'append'), href: '/feed?after=42' }, ['more'])
```

`navigation` catches those links and forms when the island is on. A hover
reads the next page early. A POST drops that read, and the next page is read
from the server.
`refreshPart(id)` asks the browser to fetch the region again. The runtime
exports both: put `navigation` in a layout, call `refreshPart` from an island.

Your own live channel is SSE. The application's free channel is a WebSocket.

`channel({ path })` builds a channel in one process and serves it as
`text/event-stream`:

| field | what to do with it |
| --- | --- |
| `route` | put it in `routes` |
| `stale(region)` | tell listeners that a region is stale |
| `send(event)` | send your own event |

`path` is required. It is not given `/live`: that address belongs to the free
channel. A replay of what was missed, and the comment-pulse period, are
passed in the same argument. The pulse is 15 seconds by default. Your own
channel does not go to a Durable Object and does not become a socket.

The free channel is already built. `liveRoute()` is its route.
`stale(ctx)(region)` and `announce(ctx)(event)` write to `ctx.live`.
`live({ url? })` is an island: one connection on the page, a socket. The
address comes from `url`, `/live` by default, and a page scheme of `http` or
`https` becomes `ws` or `wss`. `heard(name)` on the island is the stream of
that socket's frames under that name. On the server, `heard` is silent. The
`hear` field is still accepted, and it listens to nothing itself.

```ts
import { heard, live } from '@algosail/plykit'

export const price = island('price', () => {
  const now = S.holdWith('—')(heard('price'))
  return H.output([now])
}, import.meta.url)
```

```ts
import { announce, liveRoute, page } from '@algosail/plykit'

export const routes = [
  page({
    pattern: '/',
    view: () => H.div([price({}), live({})]),
  }),
  liveRoute(),
]
```

After a write in the handler: `announce(ctx)({ event: 'price', data: '42' })`,
or `stale(ctx)('comments')`. `stalePart(id)` builds the region event, when
you need to put it on your own channel. `channel().stale` is a method of that
channel, not this function. `serializeEvent` encodes an event as SSE text.
`eventStream(source, options?)` is a reply that holds the connection open.
`lastEventId(request)` reads `last-event-id`. That belongs to `channel()`.

An ordinary `GET` of the free channel answers 426 and asks for
`Upgrade: websocket`. A frame on the wire is JSON
`{ data, event?, id?, retry? }`. `data` is required. The first time the
socket opens, it does not refresh a region. A later connection asks again for
every region with `data-kit-part`. There is no log: an `announce` sent while
there was no socket is lost, and a `stale` is caught up by that refresh.
`retry` on a frame, when it is there, sets the pause before a retry.
Otherwise the pause is one second.

With the `KIT_LIVE` binding, `worker` puts in a channel that sends a short
`POST` to `KitLive`. The socket itself is not put on the page reply: `worker`
answers `101`. Your own `channel({ path })` stays SSE. `wrangler dev` uses
that binding when the config has it.

`reload` and `reloadRoute()` reload an open page. The path is `/_kit-reload`,
the event is `kit-run`.

The event fields are the same on both channels:
`{ data, event?, id?, retry? }`. `data` is required. On your own channel they
go into the SSE text. On the free channel they go into a JSON frame.

## Document and markup

The handler usually assembles the document. These functions are for when you
assemble the page yourself.

`renderDocument({ head, body, styles, lang, dir?, scripts })` returns a
document: the doctype, the language, the viewport, the title, the styles, the
body inside `<div id="kit-root">`, and the module scripts. `scriptTags(srcs)`
assembles only the script tags. `ROOT_ID` is `'kit-root'`.

`escapeText` and `escapeAttribute` prepare a string for HTML. `serializeNode`
and `serializeChildren` print the server tree. `hazards(node)` lists
constructs that HTML parsing will rewrite. `serverRoot`, `serverBackend`,
`ELEMENT`, `TEXT`, and `COMMENT` are the server tree kit draws a page with.
These are not Node modules.

## Data read at build

`prepare(routes, { state? })` calls `load` on the static pages once and
returns `{ data, routes, refused }`. `data` is JSON by address. An address
whose `load` answered with a failure or a redirect lands in `refused` and
stays live.

`prebuilt(data)(routes)` replaces `load` on those pages: a known address
serves what was written, an unknown one goes to the real `load`.

The file of that record is called `kit-data.json`. It lies next to the
chunks, not in the directory served to the browser. The `DATA` constant is
that name. `readPrebuilt(outDir)` from `@algosail/plykit/build` reads the file.
`workerBuild` copies it into `record.json` for a deploy. `wrangler dev` leaves
`data` null, so those pages load live.

## Feeds, sitemap, robots

All three functions return an ordinary endpoint route. Put it in the same
list. The route is static by default.

| function | path by default | what you pass |
| --- | --- | --- |
| `sitemap({ origin, routes?, pattern?, also?, about?, static? })` | `/sitemap.xml` | the public origin. Pages with no captures, and pages with `paths`, are included on their own. `also` adds foreign addresses. `about(path)` says `lastmod`, `changefreq`, and `priority` |
| `feed({ origin, title, items, pattern?, description?, language?, static? })` | `/feed.xml` | RSS 2.0. `items` is a `Future` of records `{ title, link, id?, published?, summary?, author? }` |
| `robots({ pattern?, agent?, allow?, disallow?, sitemap?, static? })` | `/robots.txt` | with no rules you get `User-agent: *` and an empty `Disallow` |

```ts
import { feed, robots, sitemap } from '@algosail/plykit'

const pages = [home, book]
export const routes = [
  ...pages,
  sitemap({ origin, routes: pages }),
  feed({ origin, title: 'In the margins', items: () => notes() }),
  robots({ sitemap: `${origin}/sitemap.xml` }),
]
```

## Build

An island build is esbuild: a bundle, a split into chunks, ESM, target
ES2022. The platform is `neutral`, so a read of `process.env` reaches the
`KIT_PUBLIC_` substitution. `node:*` packages and `esbuild` do not go into a
chunk. After the environment substitution, a file's own name gets a hash
suffix. Zero islands means esbuild does not start.

`workerBuild` is that build for Workers. It builds the islands first and
prints a report: names, styles, weight, files, what was substituted from the
environment, what stayed a read, which static pages were read. Then `stage`
copies the chunks and `assets` into `dist/assets`, writes `dist/record.json`
beside the `assets` directory rather than inside it, and puts `_headers`
there. The worker entry is your `worker.ts`. `workerBuild` does not write it.

```ts
import { workerBuild } from '@algosail/plykit/build'
import application from './app.ts'

await workerBuild({
  ...application,
  assets: { dir: new URL('./static/', import.meta.url) },
})
```

Copy `templates/worker/wrangler.jsonc` into the application and edit it there.
`workerBuild` does not read or write that file.

`workerBuild` reads `WRANGLER_COMMAND`. `wrangler dev` and `wrangler types`
set `dev` and `types`: chunks are not minified, `prepare` does not run, and
`record.json` has `data: null`. A call with no `dev` flag, and
`wrangler deploy`, keep the production build: minify, and the data of static
pages in the record. `workerBuild(application, { dev: true })` keeps the dev
build when `WRANGLER_COMMAND` is `deploy`. Wrangler runs `build.command`.
In the Workers template that command is `npm run build`.

With `'live'` in `include`, `worker.ts` also exports `KitLive`, and the
binding stays in your `wrangler.jsonc`. `dist/record.json` and copies under
`dist/assets` are written only when the bytes differ, so a rebuild that
changes nothing does not touch their mtime.

A static site is `staticSite`, described in [Static site](#static-site). It
writes HTML into its own directory and does not write `record.json`.

The same steps, called on their own, are imported from `@algosail/plykit/build`.

```ts
import { resolve } from 'node:path'
import { build, chunkDir, report, stage } from '@algosail/plykit/build'

const outDir = await chunkDir(application)
const built = await build({ ...application, outDir })
console.log(report(built))

const laid = await stage({
  outDir,
  to: resolve('dist'),
  assets: application.assets,
  base: application.base,
})
```

`chunkDir(where, create?)` returns the real directory path and creates the
directory by default. `create: false` only computes the path.

`build(options)` writes into `outDir`:

| file | what is inside |
| --- | --- |
| `<name>-<hash>.js` | one island |
| `chunk-<hash>.js` | shared code |
| the style file | every `css` block, if there were any |
| `kit-build.json` | the manifest, the styles, the file list. This is the build record, not a file for the browser |
| `kit-data.json` | static-page data, if `routes` were passed and there was something for them to read |

`Built`, which `build` returns:

| field | what is in it |
| --- | --- |
| `manifest` | island name to chunk address |
| `styles` | the style sheet address, or `null` |
| `styleIds` | the blocks of that sheet |
| `styleBytes`, `islandBytes` | the bytes as they are, and gzip |
| `files` | the names of the files written |
| `env.put` | the public names and values that became literals |
| `env.left` | names with no prefix |
| `data` | the `prepare` result, if there were static pages |

`discover(where)` reads a manifest that is already written and builds
nothing. With no `kit-build.json`, the addresses stay without a hash.

`stage(options)` returns `{ assets, record, files }`. `assets` is the path
`to/assets`. `record` is the path `to/record.json`. The directory for the
browser gets only the files from the build record and the `assets` tree.
`kit-build.json` and `kit-data.json` are not copied there: their contents
move into `record.json`.

`record.json`:

| field | where from |
| --- | --- |
| `manifest` | which island is in which chunk |
| `styles` | the sheet address, or `null` |
| `styleIds` | the blocks |
| `files` | the static prefix, such as `/static/`, or `null` when nothing was copied |
| `data` | JSON of the static pages, or `null` |

The chunk prefix inside the directory repeats `base`. For `/_kit/`, `stage`
writes `_headers`:

```
/_kit/*
  Cache-Control: public, max-age=31536000, immutable
```

The file name is its contents, so the cache is long. Your own `base` gets the
same rule on its own prefix.

`report(built)` is the report text `workerBuild` prints.

## Deploy to Cloudflare Workers

How the worker meets bindings, storage, and the rest of the platform is
covered on its own: [docs/cloudflare.md](docs/cloudflare.md). Below is what
the build puts on disk, and how Wrangler runs it.

`wrangler dev` runs `build.command` before it serves, and again when a
watched file changes. `wrangler deploy` does the same. A fresh clone with
an empty `dist/` boots from that command. `npx wrangler dev` does this too,
once `templates/worker/wrangler.jsonc` is the application's config.

After `workerBuild`, the directory looks like this:

```
dist/assets/           files the platform serves
dist/assets/_kit/      chunks and styles
dist/assets/_headers
dist/record.json       the manifest the worker imports
worker.ts              the entry, copied from templates/worker/
wrangler.jsonc         the application's file, copied from templates/worker/
```

`templates/worker/worker.ts` is the entry. It imports the application and `dist/record.json`:

```ts
import { worker } from '@algosail/plykit/workers'
import application from './app.ts'
import record from './dist/record.json' with { type: 'json' }

export default worker(application, { record })
```

With `'live'` in `include`, the same file also exports the class:

```ts
export { KitLive } from '@algosail/plykit/workers'
```

`templates/worker/wrangler.jsonc` is the file to copy:

```jsonc
{
  "$schema": "./node_modules/wrangler/config-schema.json",
  "name": "reading-room",
  "main": "./worker.ts",
  "compatibility_date": "2026-10-23",
  "assets": { "directory": "./dist/assets", "binding": "ASSETS" },
  "build": {
    "command": "npm run build",
    "watch_dir": ["app.ts", "build.ts", "routes", "static", "ui"]
  }
}
```

`build.ts` is the script that command runs:

```ts
import { workerBuild } from '@algosail/plykit/build'
import application from './app.ts'

await workerBuild({
  ...application,
  assets: { dir: new URL('./static/', import.meta.url) },
})
```

`watch_dir` is the list you keep. `dist`, `.kit`, `node_modules`,
`.wrangler`, `.git`, `coverage`, `wrangler.jsonc`, `wrangler.json`,
`wrangler.toml`, and `worker-configuration.d.ts` stay off it, and so does
every name that starts with `.` (`.dev.vars` among them). Watching `.`
would run the build again, because the build writes into `dist`. Wrangler
does not ignore `node_modules` inside a watched directory, so name the
directories you mean. A new top-level directory is one more entry in that
list.

Add the Durable Object block yourself when `include` contains `'live'`,
and export `KitLive` from `worker.ts`. The template leaves both out. The
config has no `nodejs_compat` flag. If the application needs `node:` modules,
add the flag. Wrangler compiles `worker.ts` itself. Kit has no separate
build of the worker.

Then Wrangler:

```sh
wrangler dev
wrangler deploy
```

The platform serves files from `dist/assets` before the worker. Do not turn
`run_worker_first` on. A request that is not among the files is not given to
the worker as an error page: `worker` draws it.

The worker itself still looks at the `ASSETS` binding, and only for `GET` and
`HEAD` under the chunk prefix, under `assets.base` when `assets` is set, and
under `record.files` when that prefix was copied. The binding's reply is
returned as it is, a 404 included. Such a path does not fall through into a
page. Other paths are drawn.

`worker(config, { record })` returns `{ fetch(request, env, ctx) }`.
`record` is the `record.json` module. `fetch` puts the bindings on `ctx.env`
and the free channel on `ctx.live`. `load`, middleware, and handlers read
them. `state(request)` still sees only the request: the route context is
built after it.

The binding type is set on the route,
`const home: Route<State, Env> = page(...)`, and on the config,
`Config<State, Env>`. `worker` infers both from the application. Kit reads
`ASSETS` and `KIT_LIVE` itself. They do not have to be in `Env`. A D1 sample
is in the [platform document](docs/cloudflare.md).

`KitLive` is one object for the name `kit`, binding `KIT_LIVE`. The platform
creates new objects with SQLite storage: that is how the class is declared.
The socket list is not written there. `stale` and `announce` arrive as a
short `POST`. The browser holds a Hibernation WebSocket: the object takes the
server end through `acceptWebSocket` and may sleep while there is nothing to
send. It asks `getWebSockets()` whom to send to. The platform answers a
protocol ping itself and does not wake the object for that. The class has no
timer of its own. This does not apply to your own `channel()`.

The class accepts `fetch(input, init?)`, because that is how the platform
calls it. `POST` publishes an event. A request with `Upgrade: websocket`
opens a socket. Anything else answers 426. With no binding, the free channel
lives in one isolate, if the runtime has `WebSocketPair`. `wrangler dev` uses
`KitLive` when that binding is in the config. Add it
next to the other bindings when `include` contains `'live'`:

```jsonc
"durable_objects": {
  "bindings": [{ "name": "KIT_LIVE", "class_name": "KitLive" }]
},
"exports": {
  "KitLive": { "type": "durable-object", "storage": "sqlite" }
}
```

Do not run `workerBuild` inside the kit repository itself. Its `dist` is the
built package, and the function writes an application directory into `dist`.

## Node

`@algosail/plykit/node` serves the same `Config` from this process. `dev`
builds the islands without compression, leaves static page data live, adds
the `reload` island, and logs each answer. `serve` builds nothing and reads
the chunks already on disk. `listen` binds a port: the one passed in,
otherwise `PORT`, otherwise 8000. It returns `{ port, close }`.

There is no Wrangler on this host and no platform bindings. `env` is
`undefined`. The connection address is the socket's. Chunk files and `assets`
are read from disk.

`templates/node/` is that application. `dev` builds as it starts. `build`
writes the islands into `.kit` and does not call `workerBuild`. `start`
serves that directory.

```sh
npm run dev
npm run build
npm run start
```

```ts
import { dev, listen } from '@algosail/plykit/node'
import application from './app.ts'

const running = await listen(await dev(application))
console.log(`http://localhost:${running.port}`)
```

## Static site

`staticSite` from `@algosail/plykit/build` writes the site. Pass your own
directory, `names`, or `missing` when the defaults are not the ones you want.

`staticSite` asks the application with an ordinary `Request` and puts the
reply on disk. There is no crawler: addresses come from routes with
`static: true` and from their `paths`.

```ts
import { siteReport, staticSite } from '@algosail/plykit/build'

const written = await staticSite(application, { out: './dist' })
console.log(siteReport(written))
```

| field | what for |
| --- | --- |
| `out` | the directory. It is created if needed |
| `build` | build the islands first. Yes by default |
| `names` | `'index'` puts `/about` at `about/index.html`. `'flat'` puts it at `about.html`. `'index'` by default |
| `missing` | an address that is not among the routes. The reply becomes `404.html`. `/_kit-missing` by default |

The chunks and `assets` are copied alongside. A route that could not be
written lands in `skipped`, with a reason. `siteReport` prints the addresses,
the sizes, the page count, and the skips.

The root is written as `index.html`. Any static server can serve the `out`
directory. Islands in this directory are the same files as on the worker. A
static site does not need the live channel or `KitLive`: these files hold no
reply that depends on the request.

## License

MIT.
