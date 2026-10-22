import {
  refreshPart
} from "./chunk-UGQEDWNS.js";
import {
  LIVE_PATH,
  PART_ATTR,
  PART_EVENT,
  PART_NAME,
  bus,
  canListen,
  chain,
  comment,
  defaultTo,
  disposable,
  filter,
  forEach,
  fromNullable,
  fromPredicate,
  ifElse,
  isJust,
  isNumber,
  isStrMap,
  isString,
  isTrue,
  island,
  just,
  justs,
  map,
  maybeEncase,
  multicast,
  never,
  nothing,
  reduce_,
  restart,
  skipRepeats,
  stream,
  subscribe,
  switchMap,
  test
} from "./chunk-QK6UEJ6B.js";

// src/live.ts
var AGAIN = 1e3;
var isPartName = test(PART_NAME);
var refreshing = (id) => void refreshPart(id);
var socketUrl = (path) => {
  const url = new URL(path, location.href);
  if (url.protocol === "https:") url.protocol = "wss:";
  else if (url.protocol === "http:") url.protocol = "ws:";
  return url.href;
};
var parsed = (raw) => chain((text) => maybeEncase(JSON.parse)(text))(
  fromPredicate(isString)(raw)
);
var retryIn = (value) => filter((n) => Number.isFinite(n) && n >= 0)(
  fromPredicate(isNumber)(value.retry)
);
var asFrame = (value) => {
  if (!isStrMap(value) || !isString(value.data)) return nothing();
  const event = fromPredicate(isString)(value.event);
  const retry = retryIn(value);
  return just({
    data: value.data,
    ...isJust(event) ? { event: event.value } : {},
    ...isJust(retry) ? { retry: retry.value } : {}
  });
};
var frameIn = (raw) => chain(asFrame)(parsed(raw));
var partsOnPage = () => justs(
  map((el) => fromNullable(el.getAttribute(PART_ATTR)))(
    Array.from(document.querySelectorAll(`[${PART_ATTR}]`))
  )
);
var inTurn = (id) => (before) => before.then(() => refreshPart(id));
var refreshAll = () => {
  void reduce_(inTurn)(Promise.resolve())(partsOnPage());
};
var pace = (state, frame) => {
  const retry = frame.retry;
  if (retry === void 0 || !Number.isFinite(retry) || retry < 0) return state;
  return { ms: retry };
};
var showing = (frame) => {
  if (frame.event !== PART_EVENT) return;
  forEach(refreshing)(fromPredicate(isPartName)(frame.data));
};
var attempt = (url) => (again) => stream((snk, sch) => {
  const socket = new WebSocket(socketUrl(url));
  let closed = false;
  const finish = () => {
    if (closed) return;
    closed = true;
    socket.removeEventListener("open", onOpen);
    socket.removeEventListener("message", onMessage);
    socket.removeEventListener("close", onClose);
  };
  const onOpen = () => {
    if (again) refreshAll();
  };
  const onMessage = (event) => {
    forEach((frame) => {
      showing(frame);
      snk.event(sch.currentTime(), frame);
    })(frameIn(event.data));
  };
  const onClose = () => {
    finish();
    snk.end(sch.currentTime());
  };
  socket.addEventListener("open", onOpen);
  socket.addEventListener("message", onMessage);
  socket.addEventListener("close", onClose);
  return disposable(() => {
    finish();
    socket.close();
  });
});
var connection = (url) => restart(pace, { ms: AGAIN }, (state) => state.ms)(attempt(url));
var [urls, openAt] = bus();
var frames = multicast(
  switchMap(connection)(skipRepeats(
    (one, other) => one === other
  )(urls))
);
subscribe((_time, _frame) => void 0)(frames);
var named = (name) => (frame) => frame.event === name;
var listening = (name) => map((frame) => frame.data)(filter(named(name))(frames));
var nothingHeard = (_name) => never();
var inBrowser = (_name) => canListen();
function heard(name) {
  return ifElse(inBrowser)(listening)(nothingHeard)(name);
}
var urlIn = (props) => defaultTo(LIVE_PATH)(props.url);
var begun = (props) => (_yes) => {
  openAt(urlIn(props));
};
var live = island(
  "live",
  (props) => {
    forEach(begun(props))(fromPredicate(isTrue)(canListen()));
    return comment("kit-live");
  },
  import.meta.url
);

export {
  heard
};
