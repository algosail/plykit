import {
  jsonField,
  jsonText,
  p
} from "./chunk-F674J47Q.js";
import {
  heard
} from "./chunk-FGMXFOP4.js";
import "./chunk-UGQEDWNS.js";
import "./chunk-CIPN4XET.js";
import {
  chain,
  either,
  encase,
  equals,
  filterMap,
  holdWith,
  hydrateIslands,
  isNothing,
  island,
  just,
  map,
  maybe_,
  nothing
} from "./chunk-QK6UEJ6B.js";

// test/fixture/islands/desk.ts
var style = { "word": "word_1n7grdu", "quiet": "quiet_1n7grdu" };
var notJson = () => nothing();
var asJson = (body) => just(body);
var parsed = (raw) => either(notJson)(asJson)(
  encase((text) => JSON.parse(text))(raw)
);
var field = (name) => (body) => chain(jsonText)(jsonField(name)(body));
var pair = (tag) => (title) => ({ tag, title });
var said = (raw) => chain(
  (body) => chain((tag) => map(pair(tag))(field("title")(body)))(
    field("tag")(body)
  )
)(parsed(raw));
var borrowed = (s) => equals("took")(s.tag);
var aloud = (s) => borrowed(s) ? `just borrowed: ${s.title}` : `returned: ${s.title}`;
var spoken = (props) => (last) => maybe_(() => props.quiet)(aloud)(last);
var tone = (last) => isNothing(last) ? style.quiet : style.word;
var desk = island("desk", (props) => {
  const loans = filterMap(said)(heard("loan"));
  const last = holdWith(nothing())(
    map((s) => just(s))(loans)
  );
  return p({ class: map(tone)(last) }, [
    map(spoken(props))(last)
  ]);
}, import.meta.url);

// ../../../../../private/var/folders/kq/sqmjd99j6h18sn8nbss1x1gw0000gn/T/kit-islands-Gjns6X/desk.ts
hydrateIslands(document.body);
