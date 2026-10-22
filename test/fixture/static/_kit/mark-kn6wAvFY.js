import {
  button,
  output,
  p,
  small
} from "./chunk-F674J47Q.js";
import "./chunk-FGMXFOP4.js";
import "./chunk-UGQEDWNS.js";
import "./chunk-CIPN4XET.js";
import {
  K,
  add,
  clamp,
  div,
  gte,
  hold,
  hydrateIslands,
  island,
  map,
  mergeArray,
  sub,
  svgEl,
  use,
  when
} from "./chunk-QK6UEJ6B.js";

// test/fixture/islands/mark.ts
var style = { "mark": "mark_wkxuri", "done": "done_wkxuri" };
var STEP = 10;
var WIDTH = 160;
var HEIGHT = 6;
var clamp2 = (pages) => (page) => clamp(0, pages)(page);
var addPages = add(STEP);
var subPages = sub(STEP);
var mark = island(
  "mark",
  ({ pages, at }, on) => {
    const steps = mergeArray([
      map(K(addPages))(on.forward),
      map(K(subPages))(on.back)
    ]);
    const applyStep = (at2, apply) => clamp2(pages)(apply(at2));
    const page = hold(applyStep, at)(steps);
    const share = map(div(pages))(page);
    const done = map(gte(pages))(page);
    return p({ class: style.mark }, [
      use({ back: "click" })(button({ type: "button" }, ["\u2212"])),
      output([page, ` of ${pages}`]),
      use({ forward: "click" })(button({ type: "button" }, ["+"])),
      svgEl("svg", { width: String(WIDTH), height: String(HEIGHT) }, [
        svgEl("rect", {
          width: String(WIDTH),
          height: String(HEIGHT),
          fill: "#efe9dc"
        }),
        svgEl("rect", {
          width: map((s) => String(Math.round(s * WIDTH)))(share),
          height: String(HEIGHT),
          fill: "#7a4b1e"
        })
      ]),
      when(() => small({ class: style.done }, ["finished"]))(done)
    ]);
  },
  import.meta.url
);

// ../../../../../private/var/folders/kq/sqmjd99j6h18sn8nbss1x1gw0000gn/T/kit-islands-Gjns6X/mark.ts
hydrateIslands(document.body);
