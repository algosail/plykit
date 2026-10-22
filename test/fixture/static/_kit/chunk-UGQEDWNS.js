import {
  INTO_ATTR,
  MODE_ATTR,
  PART_ATTR,
  PART_HEADER,
  PART_NAME,
  ROOT_ID,
  alt,
  any,
  anyPass,
  boolean,
  chain,
  comment,
  elem,
  filter,
  filterMap,
  forEach,
  fromIterable,
  fromMaybe,
  fromMaybe_,
  fromNullable,
  fromPredicate,
  head,
  hydrateIslands,
  ifElse,
  isFalse,
  isJust,
  isNumber,
  isString,
  isTrue,
  island,
  just,
  lift2,
  map,
  maybe_,
  nothing,
  once,
  pipe,
  predicate,
  predicateAnd,
  predicateNot,
  predicateOr,
  reject,
  resetIslands,
  resetIslandsIn,
  test,
  toLower
} from "./chunk-QK6UEJ6B.js";

// src/navigate.ts
var isBrowser = () => typeof document !== "undefined" && typeof document.createElement === "function";
var nothingToDo = () => Promise.resolve();
var swallowed = () => null;
var attrOf = (name) => (el) => fromNullable(el.getAttribute(name));
var has = (name) => (el) => el.hasAttribute(name);
var found = (selector) => (where) => Array.from(where.querySelectorAll(selector));
var removing = (tag) => tag.remove();
var adopting = (tag) => {
  document.head.appendChild(tag.cloneNode(true));
};
var asSwap = (arriving) => (here) => ({
  arriving,
  here
});
var isAnchor = (node) => node.localName === "a";
var itself = (node) => just(node);
var anchorAt = (node) => ifElse(isAnchor)(itself)(above)(node);
var above = (node) => chain(anchorAt)(fromNullable(node.parentNode));
var anchorOf = (event) => chain(anchorAt)(fromNullable(event.target));
var aimedAway = anyPass([
  predicate(has("target")),
  predicate(has("download"))
]);
var asUrl = (href) => new URL(href, location.href);
var urlOf = pipe([asUrl, just]);
var isHere = (url) => url.origin === location.origin;
var isSamePage = (url) => url.pathname === location.pathname && url.search === location.search;
var hasHash = (url) => url.hash !== "";
var jumpsWithin = predicateAnd(
  predicate(isSamePage)
)(predicate(hasHash));
var ours = predicateAnd(predicate(isHere))(
  predicateNot(predicate(jumpsWithin))
);
var handled = fromPredicate(
  predicateNot(predicate(aimedAway))
);
var linkable = fromPredicate(ours);
var linkIn = pipe([
  handled,
  chain(attrOf("href")),
  chain(urlOf),
  chain(linkable)
]);
var wasHandled = (event) => event.defaultPrevented;
var isSecondary = (event) => event.button !== 0;
var withMeta = (event) => event.metaKey;
var withCtrl = (event) => event.ctrlKey;
var withShift = (event) => event.shiftKey;
var withAlt = (event) => event.altKey;
var elsewhere = [
  wasHandled,
  isSecondary,
  withMeta,
  withCtrl,
  withShift,
  withAlt
];
var plainly = fromPredicate(
  predicateNot(anyPass(elsewhere.map(predicate)))
);
var linkTarget = pipe([
  plainly,
  chain(anchorOf),
  chain(linkIn)
]);
var KIT_STYLE = "style[data-kit]";
var LINKED = "link[rel]";
var META = "meta[name]";
var MODULE = 'script[type="module"][src]';
var styleFor = (id) => `style[data-kit="${id}"]`;
var standing = (id) => document.head.querySelector(styleFor(id)) !== null;
var isNewStyle = (tag) => fromMaybe(false)(
  map(predicateNot(predicate(standing)))(attrOf("data-kit")(tag))
);
var adoptStyles = (next) => {
  forEach(adopting)(filter(isNewStyle)(found(KIT_STYLE)(next)));
};
var linkKey = (el) => `${el.getAttribute("rel")}|${el.getAttribute("href")}`;
var keysOf = (tags) => new Set(map(linkKey)(tags));
var among = (keys) => (tag) => keys.has(linkKey(tag));
var adoptLinks = (next) => {
  const here = found(LINKED)(document.head);
  const arriving = found(LINKED)(next.head);
  forEach(removing)(reject(among(keysOf(arriving)))(here));
  forEach(adopting)(reject(among(keysOf(here)))(arriving));
};
var adoptMeta = (next) => {
  forEach(removing)(found(META)(document.head));
  forEach(adopting)(found(META)(next.head));
};
var adoptHead = (next) => {
  document.title = next.title;
  adoptStyles(next);
  adoptLinks(next);
  adoptMeta(next);
};
var importing = (src) => import(asUrl(src).href).catch(swallowed);
var sourcesIn = (next) => filterMap(attrOf("src"))(found(MODULE)(next));
var loadChunks = async (next) => {
  await Promise.all(map(importing)(sourcesIn(next)));
};
var giveUp = (url) => {
  location.href = url.href;
};
var giving = (url) => () => {
  giveUp(url);
  return Promise.resolve();
};
var BUSY = "aria-busy";
var waiting = 0;
var busy = (el) => el.setAttribute(BUSY, "true");
var idle = (el) => el.removeAttribute(BUSY);
var lastOne = (_root) => waiting === 0;
var clearing = (where) => () => {
  waiting -= 1;
  forEach(idle)(filter(lastOne)(just(document.documentElement)));
  forEach(idle)(where);
};
var marked = (where) => {
  waiting += 1;
  busy(document.documentElement);
  forEach(busy)(where);
  return once(clearing(where));
};
var inFlight = (where) => (run) => {
  const done = marked(where);
  return run().finally(done);
};
var startsIn = () => fromNullable(document.startViewTransition);
var wantsMotion = () => globalThis.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches !== true;
var crossing = () => boolean(nothing())(startsIn())(wantsMotion());
var atOnce = (change) => () => {
  change();
  return Promise.resolve();
};
var across = (change) => async (start) => {
  const move = start.call(document, change);
  move.ready.catch(swallowed);
  move.finished.catch(swallowed);
  return move.updateCallbackDone.catch(swallowed).then(nothingToDo);
};
var paint = (change) => maybe_(atOnce(change))(across(change))(crossing());
var AHEAD_MAX = 6;
var AHEAD_TTL = 3e4;
var HOVER_WAIT = 65;
var ahead = /* @__PURE__ */ new Map();
var noPage = () => nothing();
var asLanded = (url) => async (res) => just({
  html: await res.text(),
  url: res.url === "" ? url.href : res.url
});
var sending = (init) => fromMaybe({})(init);
var fresh = { cache: "no-store" };
var fetchPage = (url, init) => fetch(url.href, {
  ...sending(init),
  ...fresh,
  headers: { accept: "text/html" }
}).then(asLanded(url)).catch(noPage);
var isMetered = (_url) => navigator.connection?.saveData === true;
var isKept = (url) => ahead.has(url.href);
var skipping = anyPass([
  predicate(isMetered),
  predicate(isKept)
]);
var forget = (key) => {
  ahead.delete(key);
};
var keyOf = ([key]) => key;
var isStale = (now) => ([, kept]) => now - kept.at > AHEAD_TTL;
var expiring = (now) => {
  forEach(forget)(map(keyOf)(filter(isStale(now))(fromIterable(ahead))));
};
var isFull = (_url) => ahead.size >= AHEAD_MAX;
var oldest = () => head(fromIterable(ahead.keys()));
var crowding = (url) => boolean(nothing())(oldest())(isFull(url));
var keeping = (url) => {
  ahead.set(url.href, { at: Date.now(), answer: fetchPage(url, nothing()) });
};
var guessing = (url) => {
  expiring(Date.now());
  forEach(forget)(crowding(url));
  forEach(keeping)(reject(isKept)(just(url)));
};
var prefetch = (url) => {
  forEach(guessing)(reject(skipping)(just(url)));
};
var isFresh = (kept) => Date.now() - kept.at <= AHEAD_TTL;
var answerOf = (kept) => kept.answer;
var taken = (url) => {
  const kept = fromNullable(ahead.get(url.href));
  forget(url.href);
  return kept;
};
var guessed = (url) => map(answerOf)(filter(isFresh)(taken(url)));
var positions = /* @__PURE__ */ new Map();
var entries = 0;
var shown = "";
var sameAsShown = (url) => {
  const was = new URL(shown, url.href);
  return was.pathname === url.pathname && was.search === url.search;
};
var filed = () => {
  const state = history.state;
  return filter(isNumber)(fromNullable(state?.kit));
};
var minted = () => {
  const key = ++entries;
  history.replaceState({ ...history.state ?? {}, kit: key }, "");
  return key;
};
var entryKey = () => fromMaybe_(minted)(filed());
var rememberScroll = () => {
  positions.set(entryKey(), globalThis.scrollY);
};
var isNamed = (hash) => hash.length > 1;
var nameIn = (hash) => decodeURIComponent(hash.slice(1));
var fragmentOf = (url) => map(nameIn)(fromPredicate(isNamed)(url.hash));
var namedIn = (id) => fromNullable(document.getElementById(id));
var toTop = () => globalThis.scrollTo(0, 0);
var intoView = (target) => target.scrollIntoView();
var scrollToTarget = (url) => maybe_(toTop)(intoView)(chain(namedIn)(fragmentOf(url)));
var keptAt = (key) => fromNullable(positions.get(key));
var restoreScroll = () => globalThis.scrollTo(0, fromMaybe(0)(chain(keptAt)(filed())));
var clicked = (url) => ({
  url,
  push: true,
  init: nothing()
});
var popped = (url) => ({
  url,
  push: false,
  init: nothing()
});
var current = 0;
var partRuns = /* @__PURE__ */ new Map();
var runningPage = (what) => ({
  what,
  mine: ++current,
  seen: () => current
});
var runningPart = (what) => {
  const mine = (partRuns.get(what.id) ?? 0) + 1;
  partRuns.set(what.id, mine);
  return { what, mine, seen: () => partRuns.get(what.id) ?? 0 };
};
var still = (run) => (_b) => run.mine === run.seen();
var sendsBody = (one) => isJust(one.init);
var noGuess = (_one) => nothing();
var guessFor = (one) => guessed(one.url);
var answerFor = (one) => ifElse(sendsBody)(noGuess)(
  guessFor
)(one);
var fetching = (one) => () => fetchPage(one.url, one.init);
var asking = (one) => fromMaybe_(fetching(one))(answerFor(one));
var parsed = (html) => new DOMParser().parseFromString(html, "text/html");
var rootIn = (where) => fromNullable(where.getElementById(ROOT_ID));
var rootsIn = (next) => lift2(asSwap)(rootIn(next))(rootIn(document));
var asArrived = (go) => (landed) => (next) => (roots) => ({ go, landed, next, roots });
var landedAt = (page) => new URL(page.url);
var arrivedIn = (go) => (page) => {
  const next = parsed(page.html);
  return map(asArrived(go)(landedAt(page))(next))(rootsIn(next));
};
var entering = (at) => {
  rememberScroll();
  history.pushState({ kit: ++entries }, "", at.landed.href);
};
var isNew = (at) => at.go.push;
var entered = (at) => {
  forEach(entering)(filter(isNew)(just(at)));
};
var replacingAll = (at) => () => {
  resetIslands();
  adoptHead(at.next);
  at.roots.here.replaceChildren(...Array.from(at.roots.arriving.childNodes));
  shown = at.landed.href;
  partRuns.clear();
};
var landing = (at) => () => scrollToTarget(at.landed);
var placed = (at) => boolean(restoreScroll)(landing(at))(isNew(at))();
var living = (at) => {
  hydrateIslands(at.roots.here);
  placed(at);
};
var drawing = (run) => async (at) => {
  entered(at);
  await paint(replacingAll(at));
  await loadChunks(at.next);
  forEach(living)(filter(still(run))(just(at)));
};
var drawn = (run) => (page) => fromMaybe_(giving(landedAt(page)))(
  map(drawing(run))(arrivedIn(run.what)(page))
);
var answered = (run) => (page) => maybe_(nothingToDo)(drawn(run))(page);
var showing = async (run) => {
  const page = await asking(run.what);
  return fromMaybe_(nothingToDo)(
    map(answered(run))(
      filter(still(run))(just(page))
    )
  );
};
var show = (one) => inFlight(nothing())(() => showing(runningPage(one)));
var isPartName = test(PART_NAME);
var aimedAt = pipe([
  attrOf(INTO_ATTR),
  chain(fromPredicate(isPartName))
]);
var partOf = (el) => chain(aimedAt)(el);
var hasPart = (el) => isJust(aimedAt(el));
var MODES = ["append", "prepend"];
var isMode = (said) => elem(said)(MODES);
var asMode = (said) => said;
var modeIn = (el) => map(asMode)(chain(fromPredicate(isMode))(attrOf(MODE_ATTR)(el)));
var modeOf = (el) => fromMaybe("replace")(chain(modeIn)(el));
var regionIn = (where) => (id) => fromNullable(where.querySelector(`[${PART_ATTR}="${id}"]`));
var regionAt = (id) => (mode) => (url) => (init) => ({ id, url, init, mode });
var isReplacing = (one) => one.mode === "replace";
var noAnswer = () => nothing();
var noAnswerYet = () => Promise.resolve(noAnswer());
var noResponse = () => nothing();
var asAnswered = (res) => (html) => just({ res, html });
var reading = (res) => res.text().then(asAnswered(res)).catch(noAnswer);
var fetchPart = (one) => fetch(one.url.href, {
  ...sending(one.init),
  ...fresh,
  headers: { accept: "text/html", [PART_HEADER]: one.id }
}).then(just).catch(noResponse);
var asking1 = async (one) => fromMaybe_(noAnswerYet)(map(reading)(await fetchPart(one)));
var cameFrom = (one) => (got) => new URL(got.res.url === "" ? one.url.href : got.res.url);
var asComing = (one) => (next) => (roots) => ({
  one,
  next,
  roots
});
var partsIn = (one) => (next) => lift2(asSwap)(regionIn(next)(one.id))(regionIn(document)(one.id));
var comingIn = (one) => (got) => {
  const next = parsed(got.html);
  return map(asComing(one)(next))(partsIn(one)(next));
};
var replacingOne = (at) => (brought2) => () => {
  resetIslandsIn(at.roots.here);
  at.roots.here.replaceWith(brought2);
};
var isAppending = (at) => at.one.mode === "append";
var joining = (at) => (brought2) => () => {
  const children = Array.from(brought2.childNodes);
  boolean(
    () => at.roots.here.prepend(...children)
  )(
    () => at.roots.here.append(...children)
  )(isAppending(at))();
};
var changing = (at) => (brought2) => boolean(joining(at)(brought2))(replacingOne(at)(brought2))(
  isReplacing(at.one)
);
var around = (at) => fromMaybe(document.body)(
  fromNullable(at.roots.here.parentNode)
);
var livingIn = (at) => boolean(at.roots.here)(around(at))(isReplacing(at.one));
var settled = (at) => (brought2) => () => {
  if (!at.roots.here.isConnected) return;
  const where = livingIn(at);
  changing(at)(brought2)();
  hydrateIslands(where);
};
var putting = (at) => () => paint(settled(at)(document.importNode(at.roots.arriving, true)));
var settling = (run) => async (at) => {
  adoptStyles(at.next);
  await loadChunks(at.next);
  return fromMaybe_(nothingToDo)(
    map(putting(at))(filter(still(run))(just(at)))
  );
};
var brought = (run) => (got) => fromMaybe_(giving(cameFrom(run.what)(got)))(
  map(settling(run))(comingIn(run.what)(got))
);
var returned = (run) => (got) => maybe_(nothingToDo)(brought(run))(got);
var swapping = async (run) => {
  const got = await asking1(run.what);
  return fromMaybe_(nothingToDo)(
    map(returned(run))(
      filter(still(run))(just(got))
    )
  );
};
var marking = (one) => (here) => inFlight(just(here))(() => swapping(runningPart(one)));
var swap = (one) => fromMaybe_(nothingToDo)(
  map(marking(one))(
    chain(regionIn(document))(filter(isPartName)(just(one.id)))
  )
);
var refreshing = (id) => () => swap(regionAt(id)("replace")(new URL(location.href))(nothing()));
function refreshPart(id) {
  return fromMaybe_(nothingToDo)(
    map(refreshing(id))(fromPredicate(isTrue)(isBrowser()))
  );
}
var ACTION = { onButton: "formaction", onForm: "action" };
var METHOD = { onButton: "formmethod", onForm: "method" };
var ENCTYPE = { onButton: "formenctype", onForm: "enctype" };
var MULTIPART = "multipart/form-data";
var told = (on) => (said) => alt(attrOf(said.onForm)(on.form))(chain(attrOf(said.onButton))(on.button));
var isSomething = (name) => name !== "";
var valueOf = (button) => fromMaybe("")(attrOf("value")(button));
var signed = (data) => (button) => (name) => data.append(name, valueOf(button));
var signing = (data) => (button) => {
  forEach(signed(data)(button))(filter(isSomething)(attrOf("name")(button)));
};
var fieldsOf = (on) => {
  const data = new FormData(on.form);
  forEach(signing(data))(on.button);
  return data;
};
var isFile = ([, value]) => !isString(value);
var pairing = (key) => (said) => [key, said];
var asText = ([key, value]) => map(pairing(key))(fromPredicate(isString)(value));
var asQuery = (data) => new URLSearchParams(filterMap(asText)(fromIterable(data)));
var wasStopped = (event) => event.defaultPrevented;
var isForm = (el) => el.localName === "form";
var isOurs = predicateAnd(predicate(isForm))(
  predicateNot(predicate(has("target")))
);
var formIn = (event) => filter(isOurs)(
  fromNullable(event.target)
);
var buttonIn = (event) => fromNullable(event.submitter);
var asSent = (event) => (form) => ({
  form,
  button: buttonIn(event)
});
var sentIn = (event) => map(asSent(event))(
  chain(formIn)(
    fromPredicate(predicateNot(predicate(wasStopped)))(event)
  )
);
var aimingIn = (on) => alt(just(on.form))(filter(hasPart)(on.button));
var actionOf = (on) => asUrl(fromMaybe("")(told(on)(ACTION)));
var methodOf = (on) => toLower(fromMaybe("get")(told(on)(METHOD)));
var asSending = (on) => {
  const source = aimingIn(on);
  return {
    sent: on,
    url: actionOf(on),
    method: methodOf(on),
    into: partOf(source),
    mode: modeOf(source),
    data: fieldsOf(on)
  };
};
var goesHere = (one) => isHere(one.url);
var sendingOf = pipe([
  asSending,
  fromPredicate(goesHere)
]);
var sendingIn = pipe([
  sentIn,
  chain(sendingOf)
]);
var isPosting = (one) => one.method === "post";
var saysMultipart = (one) => fromMaybe("")(map(toLower)(told(one.sent)(ENCTYPE))) === MULTIPART;
var carriesFile = (one) => any(isFile)(fromIterable(one.data));
var multipart = predicateOr(
  predicate(saysMultipart)
)(predicate(carriesFile));
var bodyOf = (one) => boolean(asQuery(one.data))(one.data)(
  multipart(one)
);
var wholePage = (init) => (url) => () => show({ url, push: true, init });
var onePart = (one) => (init) => (url) => (id) => swap(regionAt(id)(one.mode)(url)(init));
var answering = (one) => (init) => (url) => maybe_(wholePage(init)(url))(onePart(one)(init)(url))(one.into);
var withFields = (one) => {
  const target = new URL(one.url.href);
  target.search = asQuery(one.data).toString();
  return target;
};
var getting = (one) => answering(one)(nothing())(withFields(one));
var forgetting = () => {
  ahead.clear();
};
var posting = (one) => {
  forgetting();
  return answering(one)(just({ method: "POST", body: bodyOf(one) }))(one.url).finally(forgetting);
};
var asked = (one) => ifElse(isPosting)(posting)(getting)(one);
var taking = (event) => (one) => {
  event.preventDefault();
  void asked(one);
};
var send = (event) => {
  forEach(taking(event))(sendingIn(event));
};
var aiming;
var guessable = (anchor) => chain(linkIn)(reject(hasPart)(just(anchor)));
var aheadOf = (event) => chain(guessable)(anchorOf(event));
var soon = (url) => {
  clearTimeout(aiming);
  aiming = setTimeout(() => prefetch(url), HOVER_WAIT);
};
var aim = (event) => {
  forEach(soon)(aheadOf(event));
};
var touched = (event) => {
  forEach(prefetch)(chain(linkIn)(anchorOf(event)));
};
var forgetAim = () => clearTimeout(aiming);
var pending = false;
var recorded = () => {
  pending = false;
  rememberScroll();
};
var queueing = (_idle) => {
  pending = true;
  requestAnimationFrame(recorded);
};
var onScroll = () => {
  forEach(queueing)(fromPredicate(isFalse)(pending));
};
var asPage = (url) => () => show(clicked(url));
var asPart = (anchor) => (url) => (id) => swap(regionAt(id)(modeOf(anchor))(url)(nothing()));
var following = (anchor) => (url) => {
  void maybe_(asPage(url))(asPart(anchor)(url))(partOf(anchor));
};
var stopped = (event) => (url) => {
  event.preventDefault();
  return url;
};
var onClick = (event) => {
  forEach(following(anchorOf(event)))(
    map(stopped(event))(linkTarget(event))
  );
};
var toFragment = (url) => () => scrollToTarget(url);
var jumped = (url) => boolean(restoreScroll)(toFragment(url))(hasHash(url))();
var refetching = (url) => void show(popped(url));
var onPop = () => {
  const url = new URL(location.href);
  const here = sameAsShown(url);
  shown = url.href;
  boolean(refetching)(jumped)(here)(url);
};
var begin = once(() => {
  history.scrollRestoration = "manual";
  shown = location.href;
  document.addEventListener("mouseover", aim);
  document.addEventListener("focusin", aim);
  document.addEventListener("touchstart", touched, { passive: true });
  document.addEventListener("mouseout", forgetAim);
  globalThis.addEventListener("scroll", onScroll, { passive: true });
  document.addEventListener("click", onClick);
  document.addEventListener("submit", send);
  globalThis.addEventListener("popstate", onPop);
});
var navigation = island(
  "navigation",
  () => {
    forEach(begin)(fromPredicate(isTrue)(isBrowser()));
    return comment("kit-nav");
  },
  import.meta.url
);

export {
  refreshPart
};
