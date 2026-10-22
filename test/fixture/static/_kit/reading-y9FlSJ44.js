import {
  button,
  div,
  form,
  input,
  li,
  p,
  span,
  ul
} from "./chunk-F674J47Q.js";
import "./chunk-FGMXFOP4.js";
import "./chunk-UGQEDWNS.js";
import "./chunk-CIPN4XET.js";
import {
  I,
  add,
  any,
  append,
  complement,
  equals,
  fieldOf,
  fromPredicate,
  hold,
  holdWith,
  hydrateIslands,
  ifElse,
  island,
  map,
  max,
  maybe_,
  mergeArray,
  multicast,
  not,
  prevented,
  reduce,
  reject,
  rows,
  set,
  size,
  skipRepeats,
  trim,
  use,
  valueOf
} from "./chunk-QK6UEJ6B.js";

// test/fixture/islands/reading.ts
var style = { "list": "list_17xo3i4", "entry": "entry_17xo3i4", "add": "add_17xo3i4", "clear": "clear_17xo3i4", "left": "left_17xo3i4" };
var nextId = (items) => reduce((n, e) => max(n)(add(1)(e.id)))(1)(items);
var blank = (text) => equals("")(text);
var trimmed = (title) => fromPredicate(complement(blank))(trim(title));
var adding = (title) => (items) => maybe_(() => items)(
  (text) => append({ id: nextId(items), title: text, read: false })(items)
)(trimmed(title));
var sameId = (id) => (e) => equals(id)(e.id);
var flipped = (e) => set("read")(not(e.read))(e);
var isRead = (e) => e.read;
var toggling = (id) => map(ifElse(sameId(id))(flipped)(I));
var removing = (id) => reject(sameId(id));
var clearingRead = reject(isRead);
var countLeft = (items) => size(reject(isRead)(items));
var noneRead = (items) => not(any(isRead)(items));
function part(read) {
  return (items) => skipRepeats((a, b) => equals(a, b))(map(read)(items));
}
var checkedAttr = (on) => on ? "" : null;
var saidIn = (field) => (e) => fieldOf(field)(prevented(e));
var Row = (entry) => {
  const read = map((e) => e.read)(entry);
  return li({ class: style.entry }, [
    input({
      type: "checkbox",
      checked: map(checkedAttr)(read),
      ".checked": read
    }).use({ marked: "change" }),
    span([map((e) => e.title)(entry)]),
    button({ type: "button" }, ["\xD7"]).use({ dropped: "click" })
  ]);
};
var reading = island("reading", (props, on) => {
  const added = multicast(map(saidIn("title"))(on.added));
  const draft = holdWith("")(
    mergeArray([
      map(valueOf)(on.typed),
      map(() => "")(added)
    ])
  );
  const items = hold(
    (was, apply) => apply(was),
    props.seed
  )(
    mergeArray([
      map(adding)(added),
      map(([id]) => toggling(id))(on.marked),
      map(([id]) => removing(id))(on.dropped),
      map(() => clearingRead)(on.cleared)
    ])
  );
  const left = part(countLeft)(items);
  const idle = part(noneRead)(items);
  const withTyped = use({ typed: "input" });
  const withAdded = use({ added: "submit" });
  const withRowEvents = use({ marked: "marked", dropped: "dropped" });
  const withCleared = use({ cleared: "click" });
  return div([
    withAdded(form({}, [
      withTyped(input({
        name: "title",
        placeholder: "what else to read",
        value: draft,
        ".value": draft
      })),
      button({ class: style.add, type: "submit" }, ["add"])
    ])),
    ul({ class: style.list }, [
      withRowEvents(rows((e) => e.id)(Row)(items))
    ]),
    p({ class: style.left }, ["left: ", left]),
    p([
      withCleared(button({
        class: style.clear,
        type: "button",
        disabled: map(checkedAttr)(idle)
      }, ["clear finished"]))
    ])
  ]);
}, import.meta.url);

// ../../../../../private/var/folders/kq/sqmjd99j6h18sn8nbss1x1gw0000gn/T/kit-islands-Gjns6X/reading.ts
hydrateIslands(document.body);
