import {
  RELOAD_EVENT,
  RELOAD_PATH,
  canListen,
  comment,
  forEach,
  fromPredicate,
  isString,
  isTrue,
  island,
  just,
  maybe_,
  nothing,
  once,
  reject
} from "./chunk-QK6UEJ6B.js";

// src/reload.ts
var run = nothing();
var learning = (said) => () => {
  run = just(said);
};
var isSame = (said) => (known) => known === said;
var reloading = (_known) => location.reload();
var checking = (said) => (known) => {
  forEach(reloading)(reject(isSame(said))(just(known)));
};
var heard = (said) => {
  maybe_(learning(said))(checking(said))(run);
};
var saidIn = (event) => fromPredicate(isString)(event.data);
var onRun = (event) => {
  forEach(heard)(saidIn(event));
};
var begin = once(() => {
  const source = new EventSource(RELOAD_PATH);
  source.addEventListener(RELOAD_EVENT, onRun);
  return source;
});
var begun = () => {
  forEach(begin)(fromPredicate(isTrue)(canListen()));
};
begun();
var reload = island(
  "reload",
  (_props) => {
    begun();
    return comment("kit-reload");
  },
  import.meta.url
);
