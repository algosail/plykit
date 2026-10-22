import {
  chain,
  elementIn,
  filterMap,
  fromIterable,
  fromPairs,
  fromPredicate,
  fromTuple,
  isStrMap,
  isString,
  lookup,
  map,
  pair,
  pipe
} from "./chunk-QK6UEJ6B.js";

// node_modules/@algosail/plydom/dist/h.js
var NO_PROPS = Object.freeze({});
var NO_KIDS = Object.freeze([]);
function tagFn(build) {
  return (tag) => ((first = NO_PROPS, second = NO_KIDS) => Array.isArray(first) ? build(tag, NO_PROPS, first) : build(tag, first, second));
}
var SVG_NS = "http://www.w3.org/2000/svg";
var createElementFn = tagFn(elementIn(null));
var createSvgElementFn = tagFn(elementIn(SVG_NS));
var div = createElementFn("div");
var span = createElementFn("span");
var ul = createElementFn("ul");
var li = createElementFn("li");
var ol = createElementFn("ol");
var dl = createElementFn("dl");
var dt = createElementFn("dt");
var dd = createElementFn("dd");
var main = createElementFn("main");
var header = createElementFn("header");
var footer = createElementFn("footer");
var section = createElementFn("section");
var article = createElementFn("article");
var aside = createElementFn("aside");
var nav = createElementFn("nav");
var details = createElementFn("details");
var summary = createElementFn("summary");
var a = createElementFn("a");
var button = createElementFn("button");
var input = createElementFn("input");
var output = createElementFn("output");
var textarea = createElementFn("textarea");
var select = createElementFn("select");
var option = createElementFn("option");
var optgroup = createElementFn("optgroup");
var label = createElementFn("label");
var form = createElementFn("form");
var progress = createElementFn("progress");
var meter = createElementFn("meter");
var fieldset = createElementFn("fieldset");
var legend = createElementFn("legend");
var datalist = createElementFn("datalist");
var figure = createElementFn("figure");
var figcaption = createElementFn("figcaption");
var img = createElementFn("img");
var picture = createElementFn("picture");
var source = createElementFn("source");
var video = createElementFn("video");
var audio = createElementFn("audio");
var iframe = createElementFn("iframe");
var embed = createElementFn("embed");
var time = createElementFn("time");
var mark = createElementFn("mark");
var p = createElementFn("p");
var h1 = createElementFn("h1");
var h2 = createElementFn("h2");
var h3 = createElementFn("h3");
var h4 = createElementFn("h4");
var h5 = createElementFn("h5");
var h6 = createElementFn("h6");
var code = createElementFn("code");
var pre = createElementFn("pre");
var blockquote = createElementFn("blockquote");
var var_ = createElementFn("var");
var kbd = createElementFn("kbd");
var samp = createElementFn("samp");
var cite = createElementFn("cite");
var dfn = createElementFn("dfn");
var abbr = createElementFn("abbr");
var small = createElementFn("small");
var strong = createElementFn("strong");
var em = createElementFn("em");
var br = createElementFn("br");
var hr = createElementFn("hr");
var table = createElementFn("table");
var caption = createElementFn("caption");
var colgroup = createElementFn("colgroup");
var col = createElementFn("col");
var tbody = createElementFn("tbody");
var thead = createElementFn("thead");
var tfoot = createElementFn("tfoot");
var tr = createElementFn("tr");
var td = createElementFn("td");
var th = createElementFn("th");
var style = createElementFn("style");
var script = createElementFn("script");
var noscript = createElementFn("noscript");
var template = createElementFn("template");
var slot = createElementFn("slot");
var svg = createSvgElementFn("svg");
var g = createSvgElementFn("g");
var path = createSvgElementFn("path");
var circle = createSvgElementFn("circle");
var rect = createSvgElementFn("rect");
var line = createSvgElementFn("line");
var polyline = createSvgElementFn("polyline");
var polygon = createSvgElementFn("polygon");
var ellipse = createSvgElementFn("ellipse");
var defs = createSvgElementFn("defs");
var clipPath = createSvgElementFn("clipPath");
var mask = createSvgElementFn("mask");
var pattern = createSvgElementFn("pattern");
var linearGradient = createSvgElementFn("linearGradient");
var radialGradient = createSvgElementFn("radialGradient");
var stop = createSvgElementFn("stop");
var use = createSvgElementFn("use");

// src/request.ts
var submittedIn = (form2) => fromIterable(form2);
var fieldIn = (one) => map((said) => pair(one[0], said))(
  fromPredicate(isString)(one[1])
);
var fieldsOf = pipe([
  submittedIn,
  filterMap(fieldIn),
  fromPairs
]);
function groupedOf(pairs) {
  const out = {};
  for (const one of pairs) (out[one.fst] ??= []).push(one.snd);
  return out;
}
var fieldsAllOf = pipe([
  submittedIn,
  filterMap(fieldIn),
  groupedOf
]);
var searchIn = (url) => fromIterable(url.searchParams);
var searchPairs = pipe([
  searchIn,
  map((one) => fromTuple(one))
]);
var query = pipe([
  searchPairs,
  fromPairs
]);
var queryAll = pipe([
  searchPairs,
  groupedOf
]);
var isFields = (body) => isStrMap(body);
var fieldOf = (name) => (body) => lookup(name)(body);
function jsonField(name) {
  return pipe([fromPredicate(isFields), chain(fieldOf(name))]);
}
var jsonText = fromPredicate(
  isString
);

export {
  div,
  span,
  ul,
  li,
  button,
  input,
  output,
  form,
  p,
  small,
  jsonField,
  jsonText
};
