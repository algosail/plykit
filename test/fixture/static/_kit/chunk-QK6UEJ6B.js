// node_modules/@algosail/ply/dist/natives/bigint.js
var Big = {
  "@@type": "BigInt",
  _shape: void 0,
  is(x) {
    return typeof x === "bigint";
  },
  lte(a, b) {
    return a <= b;
  },
  equals(a, b) {
    return a === b;
  },
  show(n) {
    return String(n);
  }
};

// node_modules/@algosail/ply/dist/natives/boolean.js
var Bool = {
  "@@type": "Boolean",
  _shape: void 0,
  is(x) {
    return typeof x === "boolean";
  },
  lte(a, b) {
    return a <= b;
  },
  equals(a, b) {
    return a === b;
  },
  show(b) {
    return String(b);
  }
};
function not(x) {
  return !x;
}
function complement(pred) {
  return (x) => !pred(x);
}
function boolean(onFalse) {
  return (onTrue) => (b) => b ? onTrue : onFalse;
}
function ifElse(pred) {
  return (onTrue) => (onFalse) => (x) => pred(x) ? onTrue(x) : onFalse(x);
}
function when(pred) {
  return (f) => (x) => pred(x) ? f(x) : x;
}
function unless(pred) {
  return (f) => (x) => pred(x) ? x : f(x);
}
function isTrue(x) {
  return x === true;
}
function isFalse(x) {
  return x === false;
}

// node_modules/@algosail/ply/dist/core/named.js
function taggedName(x) {
  if ("@@type" in x) {
    const named2 = x["@@type"];
    return typeof named2 === "string" ? named2 : void 0;
  }
  const ctor = x.constructor;
  if (ctor === null || typeof ctor !== "function" && typeof ctor !== "object") {
    return void 0;
  }
  const named = ctor["@@type"];
  return typeof named === "string" ? named : void 0;
}
function hasName(x) {
  return (typeof x === "object" || typeof x === "function") && x !== null && taggedName(x) !== void 0;
}

// node_modules/@algosail/ply/dist/classes/functor.js
var functorNatives = lazily({
  Array: () => Arr,
  Fn: () => Fn,
  Set: () => Sets,
  Map: () => Maps,
  StrMap: () => StrMap
});
function map(f) {
  return (fa) => dispatch("map", "Functor", functorNatives, fa, f);
}

// node_modules/@algosail/ply/dist/classes/foldable.js
var foldableNatives = lazily({
  Array: () => Arr,
  StrMap: () => StrMap
});
function reduce(f) {
  return (init2) => (fa) => dispatch("reduce", "Foldable", foldableNatives, fa, f, init2);
}
function reduce_(f) {
  return (init2) => (fa) => reduce((acc, a) => f(a)(acc))(init2)(fa);
}
var reduceUntyped = (fa) => (f, init2) => reduce(f)(init2)(fa);
function toArray(fa) {
  return reduceUntyped(fa)((acc, a) => {
    acc.push(a);
    return acc;
  }, []);
}
function head(fa) {
  const xs = toArray(fa);
  return xs.length === 0 ? nothing() : just(xs[0]);
}
function size(fa) {
  return reduceUntyped(fa)((acc) => acc + 1, 0);
}
function any(p) {
  return (fa) => reduce((acc, a) => acc || p(a))(false)(fa);
}
function elem(a) {
  return (fa) => reduce((acc, x) => acc || equals(a)(x))(false)(fa);
}
function forEach(f) {
  return (fa) => {
    reduce((_acc, a) => {
      f(a);
      return null;
    })(null)(fa);
    return fa;
  };
}

// node_modules/@algosail/ply/dist/natives/number.js
var Num = {
  "@@type": "Number",
  _shape: void 0,
  is(x) {
    return typeof x === "number" && !Number.isNaN(x);
  },
  lte(a, b) {
    if (Number.isNaN(a))
      return Number.isNaN(b);
    if (Number.isNaN(b))
      return true;
    return a <= b;
  },
  equals(a, b) {
    return a === b || Number.isNaN(a) && Number.isNaN(b);
  },
  show(n) {
    return Object.is(n, -0) ? "-0" : String(n);
  }
};
function add(x) {
  return (y) => x + y;
}
function sub(y) {
  return (x) => x - y;
}
function div(y) {
  return (x) => x / y;
}

// node_modules/@algosail/ply/dist/natives/string.js
var Str = {
  "@@type": "String",
  _shape: void 0,
  is: (x) => typeof x === "string",
  empty() {
    return "";
  },
  lte(a, b) {
    return a <= b;
  },
  concat(a, b) {
    return a + b;
  },
  equals(a, b) {
    return a === b;
  },
  show(s) {
    return JSON.stringify(s);
  }
};
function startsWith(prefix) {
  return (s) => s.startsWith(prefix);
}
function replaceAll(from, to) {
  return (s) => s.replaceAll(from, to.replaceAll("$", "$$$$"));
}
function toLower(s) {
  return s.toLowerCase();
}
function trim(s) {
  return s.trim();
}

// node_modules/@algosail/ply/dist/classes/ord.js
var ordNatives = lazily({
  Array: () => Arr,
  String: () => Str,
  Number: () => Num,
  Boolean: () => Bool,
  BigInt: () => Big,
  Date: () => Dates
});
function lte(b) {
  return (a) => {
    const f = opIn(ordNatives, a, "lte");
    if (f !== void 0)
      return f(a, b) === true;
    throw new TypeError(`lte: ${nameOf(a)} has no Ord`);
  };
}
function lt(b) {
  return (a) => !lte(a)(b);
}
function gte(b) {
  return (a) => lte(a)(b);
}
function gt(b) {
  return (a) => !lte(b)(a);
}
function max(a) {
  return (b) => lte(b)(a) ? b : a;
}
function clamp(lo, hi) {
  return (x) => lt(lo)(x) ? lo : gt(hi)(x) ? hi : x;
}

// node_modules/@algosail/ply/dist/classes/semigroup.js
var semigroupNatives = lazily({
  Array: () => Arr,
  StrMap: () => StrMap,
  String: () => Str
});
function concat(a) {
  return (b) => dispatch("concat", "Semigroup", semigroupNatives, a, b);
}

// node_modules/@algosail/ply/dist/data/pair.js
var Pair = class _Pair {
  static "@@type" = "Pair";
  static is(value) {
    return value instanceof _Pair;
  }
  fst;
  snd;
  constructor(fst2, snd2) {
    this.fst = fst2;
    this.snd = snd2;
  }
  map(f) {
    return pair(this.fst, f(this.snd));
  }
  ap(ff) {
    return pair(concat(ff.fst)(this.fst), ff.snd(this.snd));
  }
  chain(f) {
    const that = f(this.snd);
    return pair(concat(this.fst)(that.fst), that.snd);
  }
  compose(that) {
    return pair(this.fst, that.snd);
  }
  extend(f) {
    return pair(this.fst, f(this));
  }
  extract() {
    return this.snd;
  }
  bimap(f, g) {
    return pair(f(this.fst), g(this.snd));
  }
  reduce(f, init2) {
    return f(init2, this.snd);
  }
  traverse(_T, f) {
    const left2 = this.fst;
    return map((b) => pair(left2, b))(f(this.snd));
  }
  concat(that) {
    return pair(concat(this.fst)(that.fst), concat(this.snd)(that.snd));
  }
  equals(that) {
    return equals(that.fst)(this.fst) && equals(that.snd)(this.snd);
  }
  lte(that) {
    return equals(that.fst)(this.fst) ? lte(that.snd)(this.snd) : lte(that.fst)(this.fst);
  }
  show() {
    return `Pair (${show(this.fst)}) (${show(this.snd)})`;
  }
};
function pair(fst2, snd2) {
  return new Pair(fst2, snd2);
}
function fromTuple(t) {
  return pair(t[0], t[1]);
}

// node_modules/@algosail/ply/dist/natives/strmap.js
var StrMap = {
  "@@type": "StrMap",
  _shape: void 0,
  is(x) {
    return isPlainObject(x) && !hasName(x);
  },
  alt(a, b) {
    const out = { ...a };
    for (const k of Object.keys(b)) {
      if (!Object.hasOwn(out, k))
        out[k] = b[k];
    }
    return out;
  },
  filter(m, p) {
    const out = {};
    for (const k of Object.keys(m))
      if (p(m[k]))
        out[k] = m[k];
    return out;
  },
  reduce(m, f, init2) {
    return Object.keys(m).sort().map((k) => m[k]).reduce((acc, a) => f(acc, a), init2);
  },
  map(m, f) {
    const out = {};
    for (const k of Object.keys(m))
      out[k] = f(m[k]);
    return out;
  },
  empty() {
    return {};
  },
  zero() {
    return {};
  },
  concat(a, b) {
    const out = { ...a };
    for (const k of Object.keys(b)) {
      if (!Object.hasOwn(out, k))
        out[k] = b[k];
    }
    return out;
  },
  equals(a, b) {
    const keysA = Object.keys(a).sort();
    return equals(keysA, Object.keys(b).sort()) && keysA.every((k) => equals(a[k], b[k]));
  },
  show(m) {
    const body = sortedKeys(m).map((k) => `${JSON.stringify(k)}: ${show(m[k])}`).join(", ");
    return `{${body}}`;
  }
};
function lookup(k) {
  return (m) => Object.hasOwn(m, k) ? just(m[k]) : nothing();
}
function sortedKeys(m) {
  return Object.keys(m).sort();
}
function fromPairs(ps) {
  const out = {};
  for (const entry of ps)
    out[entry.fst] = entry.snd;
  return out;
}
function isPlainObject(x) {
  if (x === null || typeof x !== "object")
    return false;
  const proto = Object.getPrototypeOf(x);
  return proto === Object.prototype || proto === null;
}

// node_modules/@algosail/ply/dist/classes/filterable.js
var filterableNatives = lazily({
  Array: () => Arr,
  Set: () => Sets,
  Map: () => Maps,
  StrMap: () => StrMap
});
function filter(p) {
  return (fa) => dispatch("filter", "Filterable", filterableNatives, fa, p);
}
var requireFilterable = (op, fa) => {
  if (opIn(filterableNatives, fa, "filter") === void 0) {
    throw new TypeError(`${op}: ${nameOf(fa)} has no Filterable (no method on the value, no entry in the instance table)`);
  }
};
function reject(p) {
  return (fa) => {
    requireFilterable("reject", fa);
    return filter((a) => !p(a))(fa);
  };
}
var mapKeepBranch = (op, fa, f, tag, field) => {
  requireFilterable(op, fa);
  const marked = map(f)(fa);
  const kept = filter((x) => x.tag === tag)(marked);
  return map((x) => x[field])(kept);
};
function filterMap(f) {
  return (fa) => mapKeepBranch("filterMap", fa, f, "just", "value");
}
function partition(p) {
  return (fa) => {
    requireFilterable("partition", fa);
    return [
      filter(p)(fa),
      reject(p)(fa)
    ];
  };
}

// node_modules/@algosail/ply/dist/data/either.js
var Either = class {
  static "@@type" = "Either";
  static is = (value) => value instanceof this;
  static of = (value) => new this("right", value);
  static left = (error) => new this("left", error);
  tag;
  value;
  constructor(tag, value) {
    this.tag = tag;
    this.value = value;
  }
  match(onLeft, onRight) {
    return this.tag === "left" ? onLeft(this.value) : onRight(this.value);
  }
  map(f) {
    return this.match((e) => left(e), (a) => right(f(a)));
  }
  ap(ff) {
    return ff.match((e) => left(e), (f) => this.match((e) => left(e), (a) => right(f(a))));
  }
  chain(f) {
    return this.match((e) => left(e), f);
  }
  alt(that) {
    return this.match(() => that, () => this);
  }
  bimap(f, g) {
    return this.match((e) => left(f(e)), (a) => right(g(a)));
  }
  reduce(f, init2) {
    return this.match(() => init2, (a) => f(init2, a));
  }
  traverse(T2, f) {
    return this.match((e) => of(T2)(left(e)), (a) => map((b) => right(b))(f(a)));
  }
  concat(that) {
    return this.match((thisError) => that.match((thatError) => left(concat(thisError)(thatError)), () => that), (thisValue) => that.match(() => this, (thatValue) => right(concat(thisValue)(thatValue))));
  }
  equals(that) {
    return this.match((thisError) => that.match((thatError) => equals(thatError)(thisError), () => false), (thisValue) => that.match(() => false, (thatValue) => equals(thatValue)(thisValue)));
  }
  lte(that) {
    return this.match((thisError) => that.match((thatError) => lte(thatError)(thisError), () => true), (thisValue) => that.match(() => false, (thatValue) => lte(thatValue)(thisValue)));
  }
  show() {
    return this.match((e) => `Left (${show(e)})`, (a) => `Right (${show(a)})`);
  }
};
function left(e) {
  return Either.left(e);
}
function right(a) {
  return Either.of(a);
}
function encase(f) {
  return (...args) => {
    try {
      return right(f(...args));
    } catch (e) {
      return left(e);
    }
  };
}
function either(onLeft) {
  return (onRight) => (e) => e.match(onLeft, onRight);
}
function eitherToMaybe(e) {
  return e.match(() => nothing(), (a) => just(a));
}

// node_modules/@algosail/ply/dist/data/maybe.js
var Maybe = class {
  static "@@type" = "Maybe";
  static absent = Object.freeze(new this("nothing"));
  static is = (value) => value instanceof this;
  static of = (value) => new this("just", value);
  static zero = () => this.absent;
  tag;
  constructor(tag, value) {
    this.tag = tag;
    if (tag === "just")
      this.value = value;
  }
  match(onNothing, onJust) {
    return this.tag === "just" ? onJust(this.value) : onNothing();
  }
  map(f) {
    return this.match(() => nothing(), (a) => just(f(a)));
  }
  ap(ff) {
    return ff.match(() => nothing(), (f) => this.match(() => nothing(), (a) => just(f(a))));
  }
  chain(f) {
    return this.match(() => nothing(), f);
  }
  alt(that) {
    return this.match(() => that, () => this);
  }
  filter(p) {
    return this.match(() => nothing(), (a) => p(a) ? this : nothing());
  }
  reduce(f, init2) {
    return this.match(() => init2, (a) => f(init2, a));
  }
  traverse(T2, f) {
    return this.match(() => of(T2)(nothing()), (a) => map((b) => just(b))(f(a)));
  }
  equals(that) {
    return this.match(() => that.tag === "nothing", (a) => that.match(() => false, (b) => equals(b)(a)));
  }
  lte(that) {
    return this.match(() => true, (a) => that.match(() => false, (b) => lte(b)(a)));
  }
  show() {
    return this.match(() => "Nothing", (a) => `Just (${show(a)})`);
  }
};
function just(a) {
  return Maybe.of(a);
}
function nothing() {
  return Maybe.zero();
}
function maybe_(onNothing) {
  return (onJust) => (m) => m.match(onNothing, onJust);
}
function fromMaybe(d) {
  return (m) => m.match(() => d, (a) => a);
}
function fromMaybe_(d) {
  return (m) => m.match(d, (a) => a);
}
function defaultTo(d) {
  return (a) => a === null || a === void 0 ? d : a;
}
function fromNullable(a) {
  return a === null || a === void 0 ? nothing() : just(a);
}
function fromPredicate(p) {
  return (a) => p(a) ? just(a) : nothing();
}
function maybeEncase(f) {
  return (...args) => {
    try {
      return just(f(...args));
    } catch {
      return nothing();
    }
  };
}
function isJust(m) {
  return m.tag === "just";
}
function isNothing(m) {
  return m.tag === "nothing";
}
function justs(fm) {
  return map((m) => m.value)(filter((m) => m.tag === "just")(fm));
}

// node_modules/@algosail/ply/dist/natives/map.js
var Maps = {
  "@@type": "Map",
  _shape: void 0,
  is(x) {
    return x instanceof Map;
  },
  filter(m, p) {
    return new Map([...m].filter(([, v]) => p(v)));
  },
  map(m, f) {
    return new Map([...m].map(([k, v]) => [k, f(v)]));
  },
  show(m) {
    return `Map (${show([...m])})`;
  }
};

// node_modules/@algosail/ply/dist/natives/regexp.js
var Re = {
  "@@type": "RegExp",
  _shape: void 0,
  is(x) {
    return x instanceof RegExp;
  },
  equals(a, b) {
    return a.source === b.source && a.flags === b.flags;
  },
  show(re) {
    return String(re);
  }
};
function test(pattern) {
  return (s) => {
    const lastIndex = pattern.lastIndex;
    const result = pattern.test(s);
    pattern.lastIndex = lastIndex;
    return result;
  };
}
function match(pattern) {
  const flags = pattern.flags.replace("g", "");
  return (s) => {
    const once2 = new RegExp(pattern.source, flags);
    const found = s.match(once2);
    return found === null ? nothing() : just(matched(found));
  };
}
function matchAll(pattern) {
  return (s) => {
    const globalPattern = new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : pattern.flags + "g");
    const matches = [];
    for (; ; ) {
      const found = globalPattern.exec(s);
      if (found === null)
        return matches;
      matches.push(matched(found));
      if (found[0] === "") {
        globalPattern.lastIndex = nextIndex(s, globalPattern.lastIndex, globalPattern.unicode || globalPattern.unicodeSets);
      }
    }
  };
}
function firstCaptures(pattern) {
  return (s) => {
    const all2 = matchAll(pattern)(s);
    return all2.map((m) => m.groups[0] ?? nothing());
  };
}
function nextIndex(s, at, unicode) {
  if (!unicode || at + 1 >= s.length)
    return at + 1;
  const lead = s.charCodeAt(at);
  if (lead < 55296 || lead > 56319)
    return at + 1;
  const trail = s.charCodeAt(at + 1);
  return trail >= 56320 && trail <= 57343 ? at + 2 : at + 1;
}
function matched(found) {
  return {
    match: found[0],
    groups: found.slice(1).map((g) => g === void 0 ? nothing() : just(g))
  };
}

// node_modules/@algosail/ply/dist/classes/show.js
var showNatives = lazily({
  Array: () => Arr,
  Set: () => Sets,
  Map: () => Maps,
  StrMap: () => StrMap,
  String: () => Str,
  Number: () => Num,
  Boolean: () => Bool,
  BigInt: () => Big,
  Date: () => Dates,
  RegExp: () => Re,
  Fn: () => Fn
});
function show(x) {
  const isOutermost2 = seen === null;
  if (isOutermost2)
    seen = /* @__PURE__ */ new Set();
  try {
    return render(x);
  } finally {
    if (isOutermost2)
      seen = null;
  }
}
var seen = null;
function render(x) {
  if (x === null)
    return "null";
  if (x === void 0)
    return "undefined";
  if (typeof x === "symbol")
    return String(x);
  const tracked = typeof x === "object" || typeof x === "function";
  if (tracked && seen !== null) {
    if (seen.has(x))
      return "<Circular>";
    seen.add(x);
  }
  try {
    const f = opIn(showNatives, x, "show");
    return f === void 0 ? asPlainObject(x) : String(f(x));
  } finally {
    if (tracked && seen !== null)
      seen.delete(x);
  }
}
function asPlainObject(x) {
  const o = x;
  const body = Object.keys(o).sort().map((k) => `${JSON.stringify(k)}: ${show(o[k])}`).join(", ");
  return `{${body}}`;
}

// node_modules/@algosail/ply/dist/natives/date.js
var Dates = {
  "@@type": "Date",
  _shape: void 0,
  is(x) {
    return x instanceof Date;
  },
  lte(a, b) {
    return Num.lte(a.getTime(), b.getTime());
  },
  equals(a, b) {
    return Num.equals(a.getTime(), b.getTime());
  },
  show(d) {
    return `Date (${show(Number.isNaN(d.valueOf()) ? "NaN" : d.toISOString())})`;
  }
};

// node_modules/@algosail/ply/dist/classes/setoid.js
var setoidNatives = lazily({
  Array: () => Arr,
  StrMap: () => StrMap,
  String: () => Str,
  Number: () => Num,
  Boolean: () => Bool,
  BigInt: () => Big,
  Date: () => Dates,
  RegExp: () => Re
});
function equals(a, b) {
  return arguments.length >= 2 ? sameValue(a, b) : (x) => sameValue(x, a);
}
function sameValue(a, b) {
  const isOutermost2 = pairsInProgress === null;
  if (isOutermost2)
    pairsInProgress = /* @__PURE__ */ new Map();
  try {
    return structuralEquals(a, b);
  } finally {
    if (isOutermost2)
      pairsInProgress = null;
  }
}
var pairsInProgress = null;
function structuralEquals(a, b) {
  if (a === b)
    return true;
  if (a === null || b === null || a === void 0 || b === void 0) {
    return false;
  }
  if (nameOf(a) !== nameOf(b))
    return false;
  if (typeof a === "object" && typeof b === "object" && pairsInProgress !== null) {
    const partners = pairsInProgress.get(a);
    if (partners?.has(b))
      return true;
    if (partners)
      partners.add(b);
    else
      pairsInProgress.set(a, /* @__PURE__ */ new Set([b]));
  }
  const f = opIn(setoidNatives, a, "equals");
  if (f !== void 0)
    return f(a, b) === true;
  const name = nameOf(a);
  if (name === "Unknown" || name === "Fn")
    return false;
  throw new TypeError(`equals: ${name} has no Setoid`);
}

// node_modules/@algosail/ply/dist/natives/set.js
var Sets = {
  "@@type": "Set",
  _shape: void 0,
  is(x) {
    return x instanceof Set;
  },
  of(a) {
    return /* @__PURE__ */ new Set([a]);
  },
  ap(s, fs) {
    return new Set([...fs].flatMap((f) => [...s].map((x) => f(x))));
  },
  chain(s, f) {
    return new Set([...s].flatMap((a) => [...f(a)]));
  },
  filter(s, p) {
    return new Set([...s].filter((x) => p(x)));
  },
  map(s, f) {
    return new Set([...s].map((x) => f(x)));
  },
  show(s) {
    return `Set (${show([...s])})`;
  }
};

// node_modules/@algosail/ply/dist/classes/chain.js
var chainNatives = lazily({
  Array: () => Arr,
  Fn: () => Fn,
  Set: () => Sets
});
function chain(f) {
  return (fa) => dispatch("chain", "Chain", chainNatives, fa, f);
}

// node_modules/@algosail/ply/dist/natives/function.js
var Fn = {
  "@@type": "Fn",
  _shape: void 0,
  is(x) {
    return typeof x === "function";
  },
  of(a) {
    return (_) => a;
  },
  ap(g, h) {
    return (i) => h(i)(g(i));
  },
  id() {
    return (a) => a;
  },
  chain(g, f) {
    return (i) => f(g(i))(i);
  },
  contramap(g, f) {
    return (j) => g(f(j));
  },
  map(g, f) {
    return (i) => f(g(i));
  },
  promap(g, before, after) {
    return (j) => after(g(before(j)));
  },
  compose(g, f) {
    return (i) => f(g(i));
  },
  show(f) {
    return String(f);
  }
};
function I(a) {
  return a;
}
function K(a) {
  return (_b) => a;
}
function once(f) {
  let called = false;
  let answer;
  return (...args) => {
    if (!called) {
      called = true;
      answer = f(...args);
    }
    return answer;
  };
}
var foldFns = (fs, step, init2) => reduce(step)(init2)(fs);
function pipe(fs) {
  return (x) => foldFns(fs, (acc, f) => f(acc), x);
}

// node_modules/@algosail/ply/dist/classes/applicative.js
var applicativeNatives = lazily({
  Array: () => Arr,
  Fn: () => Fn,
  Set: () => Sets
});
function of(T2) {
  const f = typeRepIn(applicativeNatives, T2, "of");
  if (f === void 0) {
    throw new TypeError(`of: ${nameOf(T2)} has no Applicative`);
  }
  return (a) => f(a);
}

// node_modules/@algosail/ply/dist/classes/apply.js
var applyNatives = lazily({
  Array: () => Arr,
  Fn: () => Fn,
  Set: () => Sets
});
function ap(ff) {
  return (fa) => dispatch("ap", "Apply", applyNatives, fa, ff);
}
function lift2(f) {
  return (fa) => (fb) => {
    const ff = map(f)(fa);
    return ap(ff)(fb);
  };
}

// node_modules/@algosail/ply/dist/natives/array.js
var Arr = {
  "@@type": "Array",
  _shape: void 0,
  is(x) {
    return Array.isArray(x);
  },
  alt(a, b) {
    return [...a, ...b];
  },
  of(a) {
    return [a];
  },
  ap(xs, fs) {
    return fs.flatMap((f) => xs.map((x) => f(x)));
  },
  chain(xs, f) {
    return xs.flatMap((x) => [...f(x)]);
  },
  chainRec(f, init2) {
    const out = [];
    const frames = [f(init2)];
    const at = [0];
    while (frames.length > 0) {
      const frame = frames[frames.length - 1];
      const i = at[at.length - 1];
      if (i >= frame.length) {
        frames.pop();
        at.pop();
        continue;
      }
      at[at.length - 1] = i + 1;
      const step = frame[i];
      if (step.tag === "done")
        out.push(step.value);
      else {
        frames.push(f(step.value));
        at.push(0);
      }
    }
    return out;
  },
  filter(xs, p) {
    return xs.filter((x) => p(x));
  },
  reduce(xs, f, init2) {
    return xs.reduce((acc, x) => f(acc, x), init2);
  },
  map(xs, f) {
    return xs.map((x) => f(x));
  },
  empty() {
    return [];
  },
  lte(a, b) {
    const n = Math.min(a.length, b.length);
    for (let i = 0; i < n; i++) {
      if (!equals(a[i], b[i]))
        return lte(b[i])(a[i]);
    }
    return a.length <= b.length;
  },
  zero() {
    return [];
  },
  concat(a, b) {
    return [...a, ...b];
  },
  equals(a, b) {
    if (a.length !== b.length)
      return false;
    for (let i = 0; i < a.length; i++) {
      if (i in a !== i in b)
        return false;
      if (!equals(a[i], b[i]))
        return false;
    }
    return true;
  },
  show(xs) {
    const parts = [];
    for (let i = 0; i < xs.length; i++)
      parts.push(i in xs ? show(xs[i]) : "");
    return `[${parts.join(", ")}]`;
  },
  traverse(xs, T2, f) {
    return xs.reduce((acc, x) => ap(map((bs) => (b) => [...bs, b])(acc))(f(x)), of(T2)([]));
  }
};
function fromIterable(source) {
  return [...source];
}
function nub(xs) {
  return xs.reduce((kept, x) => kept.some((k) => equals(k, x)) ? kept : (kept.push(x), kept), []);
}

// node_modules/@algosail/ply/dist/core/instance.js
function lazily(cells) {
  const table = {};
  for (const name of Object.keys(cells)) {
    Object.defineProperty(table, name, {
      get: cells[name],
      enumerable: true
    });
  }
  return table;
}
var known = void 0;
var natives = () => known ??= [
  Arr,
  Big,
  Bool,
  Dates,
  Re,
  Fn,
  Maps,
  Num,
  Sets,
  Str,
  StrMap
];
function nameOf(x) {
  if (x === null)
    return "Null";
  if (x === void 0)
    return "Undefined";
  if (typeof x === "object" || typeof x === "function") {
    const named = taggedName(x);
    if (named !== void 0)
      return named;
  }
  for (const t of natives())
    if (t.is(x))
      return t["@@type"];
  return "Unknown";
}
var dictIn = (natives2, name) => {
  return natives2[name];
};
function opIn(natives2, x, name) {
  const row = dictIn(natives2, nameOf(x));
  if (row !== void 0) {
    const f = row[name];
    return typeof f === "function" ? f : void 0;
  }
  return hasMethod(x, name) ? ((v, ...rest) => v[name](...rest)) : void 0;
}
function dispatch(name, className, natives2, fa, ...rest) {
  const f = opIn(natives2, fa, name);
  if (f === void 0) {
    throw new TypeError(`${name}: ${nameOf(fa)} has no ${className} (no method on the value, no entry in the instance table)`);
  }
  return f(fa, ...rest);
}
function hasMethod(x, m) {
  return x !== null && (typeof x === "object" || typeof x === "function") && typeof x[m] === "function";
}
function typeRepIn(natives2, T2, name) {
  const own = T2?.[name];
  if (typeof own === "function")
    return own;
  const named = T2?.["@@type"];
  const row = typeof named === "string" ? dictIn(natives2, named) : void 0;
  const f = row?.[name];
  return typeof f === "function" ? f : void 0;
}
function staticOf(value, name) {
  const ctor = value?.constructor;
  if (ctor === null || typeof ctor !== "function" && typeof ctor !== "object") {
    return void 0;
  }
  const rep = ctor;
  if (rep["@@type"] !== nameOf(value))
    return void 0;
  return rep[name];
}
function ofIn(natives2, value) {
  const f = dictIn(natives2, nameOf(value))?.of ?? staticOf(value, "of");
  if (typeof f !== "function") {
    throw new TypeError(`of: ${nameOf(value)} has no Applicative`);
  }
  return f;
}

// node_modules/@algosail/ply/dist/classes/alt.js
var altNatives = lazily({
  Array: () => Arr,
  StrMap: () => StrMap
});
function alt(fb) {
  return (fa) => dispatch("alt", "Alt", altNatives, fa, fb);
}

// node_modules/@algosail/ply/dist/classes/category.js
var categoryNatives = lazily({
  Fn: () => Fn
});

// node_modules/@algosail/ply/dist/classes/chainrec.js
var chainRecNatives = lazily({
  Array: () => Arr
});

// node_modules/@algosail/ply/dist/classes/checkable.js
var checkableNatives = lazily({
  Array: () => Arr,
  Fn: () => Fn,
  Map: () => Maps,
  Set: () => Sets,
  StrMap: () => StrMap,
  BigInt: () => Big,
  Boolean: () => Bool,
  Date: () => Dates,
  Number: () => Num,
  RegExp: () => Re,
  String: () => Str
});
function is(T2) {
  const f = typeRepIn(checkableNatives, T2, "is");
  if (f === void 0) {
    throw new TypeError(`is: ${nameOf(T2)} has no Checkable`);
  }
  return (value) => f.call(T2, value);
}

// node_modules/@algosail/ply/dist/classes/contravariant.js
var contravariantNatives = lazily({
  Fn: () => Fn
});

// node_modules/@algosail/ply/dist/classes/monoid.js
var monoidNatives = lazily({
  Array: () => Arr,
  StrMap: () => StrMap,
  String: () => Str
});

// node_modules/@algosail/ply/dist/classes/plus.js
var plusNatives = lazily({
  Array: () => Arr,
  StrMap: () => StrMap
});

// node_modules/@algosail/ply/dist/classes/profunctor.js
var profunctorNatives = lazily({
  Fn: () => Fn
});

// node_modules/@algosail/ply/dist/classes/semigroupoid.js
var semigroupoidNatives = lazily({
  Fn: () => Fn
});

// node_modules/@algosail/ply/dist/classes/traversable.js
var traversableNatives = lazily({
  Array: () => Arr
});

// node_modules/@algosail/ply/dist/classes/_append.js
function append(a) {
  return (fa) => concat(fa)(ofIn(applicativeNatives, fa)(a));
}

// node_modules/@algosail/ply/dist/natives/record.js
function set(key) {
  return (value) => (a) => ({
    ...a,
    [key]: value
  });
}

// node_modules/@algosail/ply/dist/data/identity.js
var Identity = class _Identity {
  static "@@type" = "Identity";
  static is(value) {
    return value instanceof _Identity;
  }
  static of(value) {
    return identity(value);
  }
  value;
  constructor(value) {
    this.value = value;
  }
  map(f) {
    return identity(f(this.value));
  }
  ap(ff) {
    return identity(ff.value(this.value));
  }
  chain(f) {
    return f(this.value);
  }
  extend(f) {
    return identity(f(this));
  }
  extract() {
    return this.value;
  }
  reduce(f, init2) {
    return f(init2, this.value);
  }
  traverse(_T, f) {
    return map((b) => identity(b))(f(this.value));
  }
  equals(that) {
    return equals(that.value)(this.value);
  }
  lte(that) {
    return lte(that.value)(this.value);
  }
  show() {
    return `Identity (${show(this.value)})`;
  }
};
function identity(value) {
  return new Identity(value);
}

// node_modules/@algosail/ply/dist/data/predicate.js
var Predicate = class _Predicate {
  static "@@type" = "Predicate";
  static {
    Object.setPrototypeOf(this.prototype, Function.prototype);
  }
  static is(value) {
    return value instanceof _Predicate;
  }
  static empty() {
    return predicate(() => true);
  }
  static conquer() {
    return predicate(() => true);
  }
  static lose(absurd) {
    return predicate((x) => absurd(x));
  }
  constructor(run) {
    const self = (a) => run(a);
    return Object.setPrototypeOf(self, new.target.prototype);
  }
  contramap(f) {
    return predicate((x) => this(f(x)));
  }
  divide(split, that) {
    return predicate((x) => {
      const [b, c] = split(x);
      return this(b) && that(c);
    });
  }
  choose(split, that) {
    return predicate((x) => either((b) => this(b))((c) => that(c))(split(x)));
  }
  concat(that) {
    return this.divide((a) => [a, a], that);
  }
};
function predicate(run) {
  return new Predicate(run);
}
function predicateNot(p) {
  return predicate((a) => !p(a));
}
function predicateAnd(p) {
  return (q) => predicate((a) => p(a) && q(a));
}
function predicateOr(p) {
  return (q) => predicate((a) => p(a) || q(a));
}
function anyPass(ps) {
  return predicate((a) => ps.some((p) => p(a)));
}

// node_modules/@algosail/ply/dist/data/tagged.js
function cases(branches) {
  return (t) => branches[t.tag](t);
}

// node_modules/@algosail/ply/dist/data/ordering.js
var LT = { tag: "LT" };
var EQ = { tag: "EQ" };
var GT = { tag: "GT" };
var Ordering = {
  empty: () => EQ,
  concat: (a, b) => a.tag === "EQ" ? b : a,
  lt: LT,
  eq: EQ,
  gt: GT,
  isLT: (o) => o.tag === "LT",
  isEQ: (o) => o.tag === "EQ",
  isGT: (o) => o.tag === "GT",
  toNumber: (o) => o.tag === "LT" ? -1 : o.tag === "GT" ? 1 : 0,
  fromNumber: (n) => n < 0 ? LT : n > 0 ? GT : EQ,
  reverse: (o) => o.tag === "LT" ? GT : o.tag === "GT" ? LT : EQ,
  compare: (a, b) => {
    const aFirst = lte(b)(a);
    const bFirst = lte(a)(b);
    return aFirst && bFirst ? EQ : aFirst ? LT : GT;
  },
  comparing: (f) => (a, b) => Ordering.compare(f(a), f(b)),
  sortWith: (cmp) => (xs) => [...xs].sort((a, b) => Ordering.toNumber(cmp(a, b)))
};
var compare = Ordering.compare;
var comparing = Ordering.comparing;
var sortWith = Ordering.sortWith;
var isLT = Ordering.isLT;
var isEQ = Ordering.isEQ;
var isGT = Ordering.isGT;

// node_modules/@algosail/ply/dist/data/equivalence.js
var Equivalence = class _Equivalence {
  static "@@type" = "Equivalence";
  static {
    Object.setPrototypeOf(this.prototype, Function.prototype);
  }
  static is(value) {
    return value instanceof _Equivalence;
  }
  static empty() {
    return equivalence(() => true);
  }
  static conquer() {
    return equivalence(() => true);
  }
  static lose(absurd) {
    return equivalence((x) => absurd(x));
  }
  constructor(run) {
    const self = (a, b) => run(a, b);
    return Object.setPrototypeOf(self, new.target.prototype);
  }
  contramap(f) {
    return equivalence((x, y) => this(f(x), f(y)));
  }
  divide(split, that) {
    return equivalence((x, y) => {
      const [bx, cx] = split(x);
      const [by, cy] = split(y);
      return this(bx, by) && that(cx, cy);
    });
  }
  choose(split, that) {
    return equivalence((x, y) => {
      const ex = split(x);
      const ey = split(y);
      return either((bx) => either((by) => this(bx, by))(() => false)(ey))((cx) => either(() => false)((cy) => that(cx, cy))(ey))(ex);
    });
  }
  concat(that) {
    return this.divide((a) => [a, a], that);
  }
};
function equivalence(run) {
  return new Equivalence(run);
}

// node_modules/@algosail/ply/dist/utils/typepredicate.js
var isArray = is(Arr);
var isBoolean = is(Bool);
var isBigInt = is(Big);
var isDate = is(Dates);
var isFunction = is(Fn);
var isMap = is(Maps);
var isNumber = is(Num);
var isRegexp = is(Re);
var isSet = is(Sets);
var isString = is(Str);
var isStrMap = is(StrMap);
var isEither = is(Either);
var isEquivalence = is(Equivalence);
var isIdentity = is(Identity);
var isMaybe = is(Maybe);
var isPair = is(Pair);
var isPredicate = is(Predicate);

// node_modules/@algosail/plyfuture/dist/interpreter.js
var noop = () => {
};
function raise(e) {
  setTimeout(() => {
    throw e;
  }, 0);
}
function deliver(onCrash, onRejected, onResolved, outcome) {
  if (outcome.tag === "crash")
    onCrash(outcome.value);
  else if (outcome.tag === "reject")
    onRejected(outcome.value);
  else
    onResolved(outcome.value);
}
var Scheduler = class {
  jobs = [];
  draining = false;
  enqueue(job) {
    this.jobs.push(job);
  }
  flush() {
    if (this.draining)
      return;
    this.draining = true;
    try {
      while (this.jobs.length) {
        const job = this.jobs.pop();
        try {
          job();
        } catch (e) {
          raise(e);
        }
      }
    } finally {
      this.draining = false;
    }
  }
  fork(future2, onCrash, onRejected, onResolved) {
    const run = new Run(this, future2, onCrash, onRejected, onResolved);
    this.enqueue(() => run.drain());
    const cancel = () => run.cancel();
    cancel.detach = () => run.detach();
    return cancel;
  }
};
function interpret(future2, onCrash, onRejected, onResolved) {
  const scheduler = new Scheduler();
  const cancel = scheduler.fork(future2, onCrash, onRejected, onResolved);
  scheduler.flush();
  return cancel;
}
var Run = class {
  scheduler;
  onCrash;
  onRejected;
  onResolved;
  phase = "running";
  next;
  steps = [];
  pending = null;
  cancelCurrent = noop;
  constructor(scheduler, future2, onCrash, onRejected, onResolved) {
    this.scheduler = scheduler;
    this.onCrash = onCrash;
    this.onRejected = onRejected;
    this.onResolved = onResolved;
    this.next = future2;
  }
  detach() {
    if (this.phase !== "running")
      return;
    this.phase = "detached";
    this.next = null;
    this.pending = null;
    this.steps = [];
  }
  cancel() {
    if (this.phase === "done" || this.phase === "stopped")
      return;
    this.phase = "stopped";
    this.next = null;
    this.pending = null;
    this.steps = [];
    const cancel = this.cancelCurrent;
    this.cancelCurrent = noop;
    try {
      cancel.detach?.();
    } catch (e) {
      raise(e);
    }
    this.scheduler.enqueue(cancel);
    this.scheduler.flush();
  }
  drain() {
    while (this.phase === "running") {
      if (this.pending !== null) {
        const outcome = this.pending;
        this.pending = null;
        const step = outcome.tag === "crash" ? void 0 : this.steps.pop();
        if (step === void 0) {
          this.phase = "done";
          this.steps = [];
          this.cancelCurrent = noop;
          deliver(this.onCrash, this.onRejected, this.onResolved, outcome);
          return;
        }
        try {
          const next = outcome.tag === "reject" ? step.rejected(outcome.value) : step.resolved(outcome.value);
          if (!Future.is(next)) {
            throw new TypeError(`${step.name}: expected a Future from the handler`);
          }
          if (this.phase === "running")
            this.next = next;
        } catch (e) {
          this.pending = { tag: "crash", value: e };
        }
        continue;
      }
      if (this.next === null)
        return;
      const future2 = this.next;
      this.next = null;
      if (!Future.is(future2)) {
        this.pending = {
          tag: "crash",
          value: new TypeError("Expected a Future")
        };
        continue;
      }
      if (future2 instanceof Transformer) {
        for (let list = future2.transformations; list !== null; list = list.tail) {
          this.steps.push(list.head);
        }
        this.next = future2.source;
        continue;
      }
      let returned = false;
      let settled = false;
      const receive = (outcome) => {
        if (this.phase !== "running" || settled)
          return;
        settled = true;
        this.pending = outcome;
        this.cancelCurrent = noop;
        if (returned) {
          this.scheduler.enqueue(() => this.drain());
          this.scheduler.flush();
        }
      };
      try {
        const cancel = future2._interpret((value) => receive({ tag: "crash", value }), (value) => receive({ tag: "reject", value }), (value) => receive({ tag: "resolve", value }), this.scheduler);
        if (cancel !== void 0 && typeof cancel !== "function") {
          throw new TypeError("future: executor must return a cancellation function or undefined");
        }
        const child = typeof cancel === "function" ? cancel : noop;
        if (!settled) {
          if (this.phase === "running")
            this.cancelCurrent = child;
          else {
            try {
              child.detach?.();
            } catch (e) {
              raise(e);
            }
            this.scheduler.enqueue(child);
          }
        }
      } catch (e) {
        settled = true;
        this.pending = { tag: "crash", value: e };
        this.cancelCurrent = noop;
      }
      returned = true;
    }
  }
};

// node_modules/@algosail/plyfuture/dist/transformation.js
var Transformation = class {
};
var MapTransformation = class extends Transformation {
  f;
  name = "map";
  constructor(f) {
    super();
    this.f = f;
  }
  rejected(e) {
    return new Rejected(e);
  }
  resolved(a) {
    const f = this.f;
    return new Resolved(f(a));
  }
};
var BimapTransformation = class extends Transformation {
  f;
  g;
  name = "bimap";
  constructor(f, g) {
    super();
    this.f = f;
    this.g = g;
  }
  rejected(e) {
    const f = this.f;
    return new Rejected(f(e));
  }
  resolved(a) {
    const g = this.g;
    return new Resolved(g(a));
  }
};
var ChainTransformation = class extends Transformation {
  f;
  name = "chain";
  constructor(f) {
    super();
    this.f = f;
  }
  rejected(e) {
    return new Rejected(e);
  }
  resolved(a) {
    const f = this.f;
    return f(a);
  }
};
var AltTransformation = class extends Transformation {
  that;
  name = "alt";
  constructor(that) {
    super();
    this.that = that;
  }
  rejected(_e) {
    return this.that;
  }
  resolved(a) {
    return new Resolved(a);
  }
};
var ApTransformation = class extends Transformation {
  value;
  name = "ap";
  constructor(value) {
    super();
    this.value = value;
  }
  rejected(e) {
    return new Rejected(e);
  }
  resolved(f) {
    if (typeof f !== "function")
      throw new TypeError("ap: expected a function");
    return this.value.map(f);
  }
};

// node_modules/@algosail/plyfuture/dist/future.js
var Future = class _Future {
  static "@@type" = "Future";
  static is(value) {
    return value instanceof _Future;
  }
  static of(a) {
    return new Resolved(a);
  }
  static chainRec(f, init2) {
    const advance = (step) => {
      if (step === null || typeof step !== "object") {
        throw new TypeError("chainRec: expected a loop or done step");
      }
      if (step.tag === "done")
        return new Resolved(step.value);
      if (step.tag !== "loop") {
        throw new TypeError("chainRec: expected a loop or done step");
      }
      return new Resolved(step.value).chain(f).chain(advance);
    };
    return new Resolved({ tag: "loop", value: init2 }).chain(advance);
  }
  _run(onCrash, onRejected, onResolved) {
    return interpret(this, onCrash, onRejected, onResolved);
  }
  _transform(step) {
    const head3 = step;
    if (this instanceof Transformer) {
      return new Transformer(this.source, { head: head3, tail: this.transformations });
    }
    return new Transformer(this, {
      head: head3,
      tail: null
    });
  }
  fork(onRejected, onResolved) {
    return this._run(raise, onRejected, onResolved);
  }
  map(f) {
    return this._transform(new MapTransformation(f));
  }
  ap(ff) {
    return ff._transform(new ApTransformation(this));
  }
  chain(f) {
    return this._transform(new ChainTransformation(f));
  }
  bimap(f, g) {
    return this._transform(new BimapTransformation(f, g));
  }
  alt(that) {
    return this._transform(new AltTransformation(that));
  }
  show() {
    return "Future";
  }
};
var Transformer = class extends Future {
  source;
  transformations;
  constructor(source, transformations) {
    super();
    this.source = source;
    this.transformations = transformations;
  }
  _interpret() {
    throw new Error("Transformer must be handled by the interpreter");
  }
};
var Resolved = class extends Future {
  value;
  constructor(value) {
    super();
    this.value = value;
  }
  _interpret(_onCrash, _onRejected, onResolved) {
    onResolved(this.value);
  }
};
var Rejected = class extends Future {
  error;
  constructor(error) {
    super();
    this.error = error;
  }
  _interpret(_onCrash, onRejected) {
    onRejected(this.error);
  }
};
var Never = class extends Future {
  _interpret() {
  }
};

// node_modules/@algosail/plyfuture/dist/mod.js
var isFuture = is(Future);
var never = new Never();

// node_modules/@algosail/plystream/dist/disposable.js
function disposable(onDispose) {
  return new Handle(onDispose);
}
var Handle = class {
  onDispose;
  constructor(onDispose) {
    this.onDispose = onDispose;
  }
  [Symbol.dispose]() {
    this.onDispose();
  }
};
function disposeNone() {
  return none2;
}
var none2 = disposable(() => {
});
function dispose(d) {
  d[Symbol.dispose]();
  return d;
}

// node_modules/@algosail/plystream/dist/transaction.js
var depth = 0;
var version = 0;
var round = 0;
var head2 = null;
var tail2 = null;
function touch() {
  version += 1;
}
function enter() {
  if (depth === 0)
    round += 1;
  depth += 1;
}
function roundId() {
  return depth === 0 ? 0 : round;
}
function leave() {
  if (depth === 1) {
    try {
      flush();
    } finally {
      depth -= 1;
    }
  } else {
    depth -= 1;
  }
}
function flush() {
  let failure;
  let failed = false;
  while (head2 !== null) {
    const cell = head2;
    head2 = cell.next;
    if (head2 === null)
      tail2 = null;
    cell.next = null;
    cell.inQueue = false;
    if (!cell.live)
      continue;
    cell.live = false;
    if (cell.sentAt === version)
      continue;
    cell.sentAt = version;
    try {
      cell.emit();
    } catch (e) {
      if (!failed) {
        failed = true;
        failure = e;
      }
    }
  }
  if (failed)
    throw failure;
}

// node_modules/@algosail/plystream/dist/scheduler.js
function task(run) {
  return { run, dispose: NOTHING_TO_UNDO };
}
var NOTHING_TO_UNDO = () => {
};
var Timed = class {
  timer;
  slots = [];
  head = 0;
  handle = null;
  armedFor = Number.POSITIVE_INFINITY;
  readIn = 0;
  read = 0;
  fire;
  constructor(timer) {
    this.timer = timer;
    this.fire = () => this.runDue();
  }
  currentTime() {
    const round2 = roundId();
    if (round2 === 0)
      return this.timer.now();
    if (round2 === this.readIn)
      return this.read;
    this.readIn = round2;
    return this.read = this.timer.now();
  }
  asap(t) {
    return this.schedule(0, 0, t);
  }
  delay(d, t) {
    return this.schedule(Math.max(0, d), 0, t);
  }
  periodic(p, t) {
    return this.schedule(Math.max(0, p), Math.max(0, p), t);
  }
  relative(offset) {
    return new Relative(offset, this);
  }
  schedule(delay, period, t) {
    const now = this.timer.now();
    const entry = {
      time: now + delay,
      period,
      task: t,
      active: true
    };
    this.put(entry);
    this.arm(now);
    return new Cancelling(this, entry);
  }
  place(time) {
    const slots2 = this.slots;
    let lo = this.head;
    let hi = slots2.length;
    while (lo < hi) {
      const mid = lo + hi >>> 1;
      if (slots2[mid].time < time)
        lo = mid + 1;
      else
        hi = mid;
    }
    return lo;
  }
  put(entry) {
    const at = this.place(entry.time);
    const slot = this.slots[at];
    if (slot !== void 0 && slot.time === entry.time) {
      if (slot.draining || slot.one !== null) {
        (slot.more ?? (slot.more = [])).push(entry);
      } else
        slot.one = entry;
      return;
    }
    this.slots.splice(at, 0, { time: entry.time, one: entry, more: null, draining: false });
  }
  arm(now) {
    const slots2 = this.slots;
    let at = this.head;
    while (at < slots2.length && empty2(slots2[at]))
      at += 1;
    this.head = at;
    if (at >= slots2.length) {
      if (this.handle !== null) {
        this.timer.clearTimer(this.handle);
        this.handle = null;
        this.armedFor = Number.POSITIVE_INFINITY;
      }
      return;
    }
    const due = slots2[at].time;
    if (this.handle !== null && this.armedFor <= due && now <= this.armedFor) {
      return;
    }
    if (this.handle !== null)
      this.timer.clearTimer(this.handle);
    this.armedFor = due;
    this.handle = this.timer.setTimer(this.fire, Math.max(0, due - now));
  }
  runDue() {
    this.handle = null;
    this.armedFor = Number.POSITIVE_INFINITY;
    const now = this.timer.now();
    const slots2 = this.slots;
    let at = this.head;
    let failure = null;
    try {
      while (at < slots2.length && slots2[at].time <= now) {
        const slot = slots2[at];
        at += 1;
        slot.draining = true;
        try {
          let i = 0;
          for (; ; ) {
            const first = slot.one;
            if (first !== null) {
              slot.one = null;
              failure = this.safely(first, slot.time, failure);
              continue;
            }
            const more = slot.more;
            if (more === null || i >= more.length)
              break;
            const entry = more[i];
            i += 1;
            failure = this.safely(entry, slot.time, failure);
          }
        } finally {
          slot.draining = false;
          slot.more = null;
        }
      }
    } finally {
      this.head = at;
      if (at > 32 && at * 2 >= slots2.length) {
        slots2.splice(0, at);
        this.head = 0;
      }
      this.arm(now);
    }
    if (failure !== null)
      throw failure.error;
  }
  safely(entry, time, failure) {
    try {
      this.fireOff(entry, time);
      return failure;
    } catch (error) {
      return failure ?? { error };
    }
  }
  fireOff(entry, time) {
    if (!entry.active)
      return;
    entry.task.run(time);
    if (entry.period > 0 && entry.active) {
      entry.time += entry.period;
      this.put(entry);
    }
  }
  drop(entry) {
    if (!entry.active)
      return;
    entry.active = false;
    const slot = this.slots[this.place(entry.time)];
    if (slot !== void 0 && slot.time === entry.time) {
      if (slot.one === entry)
        slot.one = null;
      else if (slot.more !== null) {
        const i = slot.more.indexOf(entry);
        if (i >= 0)
          slot.more.splice(i, 1);
      }
    }
    entry.task.dispose();
    this.arm(this.timer.now());
  }
};
function empty2(slot) {
  return slot.one === null && (slot.more === null || slot.more.length === 0);
}
var Cancelling = class {
  sch;
  entry;
  constructor(sch, entry) {
    this.sch = sch;
    this.entry = entry;
  }
  [Symbol.dispose]() {
    this.sch.drop(this.entry);
  }
};
var Relative = class _Relative {
  offset;
  base;
  constructor(offset, base) {
    this.offset = offset;
    this.base = base;
  }
  currentTime() {
    return this.base.currentTime() - this.offset;
  }
  asap(t) {
    return this.base.asap(new Shifted(this.offset, t));
  }
  delay(d, t) {
    return this.base.delay(d, new Shifted(this.offset, t));
  }
  periodic(p, t) {
    return this.base.periodic(p, new Shifted(this.offset, t));
  }
  relative(more) {
    return new _Relative(this.offset + more, this.base);
  }
};
var Shifted = class {
  offset;
  task;
  constructor(offset, task3) {
    this.offset = offset;
    this.task = task3;
  }
  run(time) {
    this.task.run(time - this.offset);
  }
  dispose() {
    this.task.dispose();
  }
};
var defaultTimer = {
  now: () => Date.now(),
  setTimer: (f, delay) => setTimeout(f, delay),
  clearTimer: (handle) => clearTimeout(handle)
};
var shared = null;
function defaultScheduler() {
  return shared ??= new Timed(defaultTimer);
}

// node_modules/@algosail/plystream/dist/stream.js
var Mapping = class {
  snk;
  f;
  constructor(snk, f) {
    this.snk = snk;
    this.f = f;
  }
  event(time, value) {
    this.snk.event(time, this.f(value));
  }
  end(time) {
    this.snk.end(time);
  }
};
var Keeping = class {
  snk;
  p;
  constructor(snk, p) {
    this.snk = snk;
    this.p = p;
  }
  event(time, value) {
    if (this.p(value))
      this.snk.event(time, value);
  }
  end(time) {
    this.snk.end(time);
  }
};
var Passing = class {
  snk;
  onEnd;
  constructor(snk, onEnd) {
    this.snk = snk;
    this.onEnd = onEnd;
  }
  event(time, value) {
    this.snk.event(time, value);
  }
  end(time) {
    this.onEnd(time);
  }
};
var Ending = class {
  on;
  snk;
  constructor(on2, snk) {
    this.on = on2;
    this.snk = snk;
  }
  event(time, value) {
    this.on(time, value);
  }
  end(time) {
    this.snk.end(time);
  }
};
function mapping(strm, f) {
  return (snk, sch) => strm.run(new Mapping(snk, f), sch);
}
var Plain = class _Plain {
  static "@@type" = "Stream";
  static empty() {
    return endAt();
  }
  static zero() {
    return endAt();
  }
  constructor(source) {
    if (source !== void 0)
      this.source = source;
  }
  run(sink2, scheduler = defaultScheduler()) {
    return this.source(sink2, scheduler);
  }
  map(f) {
    return new _Plain(mapping(this, f));
  }
  filter(p) {
    return new _Plain((snk, sch) => this.run(new Keeping(snk, p), sch));
  }
  concat(that) {
    return mergeSources([this, that]);
  }
  alt(that) {
    return mergeSources([this, that]);
  }
  show() {
    return "Stream";
  }
};
var Held = class _Held {
  static "@@type" = "HeldStream";
  constructor(source) {
    if (source !== void 0)
      this.source = source;
  }
  run(sink2, scheduler = defaultScheduler()) {
    return this.source(sink2, scheduler);
  }
  map(f) {
    return new _Held(mapping(this, f));
  }
  show() {
    return "HeldStream";
  }
};
function endAt() {
  return new Plain((snk, sch) => sch.asap(task((t) => snk.end(t))));
}
function mergeSources(streams) {
  return new Plain((snk, sch) => {
    if (streams.length === 0)
      return endAt().run(snk, sch);
    let open = streams.length;
    let ended = false;
    const dsps = [];
    for (const strm of streams) {
      if (ended)
        break;
      let done2 = false;
      const onEnd = (t) => {
        if (done2 || ended)
          return;
        done2 = true;
        if (--open > 0)
          return;
        ended = true;
        snk.end(t);
      };
      dsps.push(strm.run(new Passing(snk, onEnd), sch));
    }
    return disposable(() => {
      if (ended)
        return;
      ended = true;
      dsps.forEach((d) => dispose(d));
    });
  });
}
var Reading = class {
  hub;
  snk;
  sch;
  gone = false;
  constructor(hub, snk, sch) {
    this.hub = hub;
    this.snk = snk;
    this.sch = sch;
  }
  [Symbol.dispose]() {
    this.hub.drop(this.snk);
  }
};
var Listeners = class {
  one = null;
  rest = null;
  join(snk, sch) {
    const one = this.one;
    if (one !== null && one.snk === snk)
      return one;
    const had = this.rest?.get(snk);
    if (had !== void 0)
      return had;
    const way = new Reading(this, snk, sch);
    if (one === null)
      this.one = way;
    else {
      (this.rest ?? (this.rest = /* @__PURE__ */ new Map())).set(snk, way);
    }
    return way;
  }
  drop(snk) {
    const one = this.one;
    if (one === null || one.snk !== snk) {
      const had = this.rest?.get(snk);
      if (had === void 0)
        return;
      had.gone = true;
      this.rest?.delete(snk);
      return;
    }
    one.gone = true;
    const rest = this.rest;
    const next = rest === null ? void 0 : rest.values().next().value;
    this.one = next ?? null;
    if (next !== void 0)
      rest.delete(next.snk);
  }
  none() {
    return this.one === null;
  }
  clear() {
    this.one = null;
    this.rest = null;
  }
  told(time, value) {
    this.deliver(time, value);
  }
  tell(value) {
    this.deliver(null, value);
  }
  deliver(time, value) {
    const one = this.one;
    const rest = this.rest;
    const many = rest === null ? 0 : rest.size;
    if (one === null && many === 0)
      return;
    const others = many === 0 ? null : [...rest.values()];
    enter();
    try {
      if (one !== null)
        one.snk.event(time ?? one.sch.currentTime(), value);
      if (others === null)
        return;
      for (const way of others) {
        if (!way.gone)
          way.snk.event(time ?? way.sch.currentTime(), value);
      }
    } finally {
      leave();
    }
  }
  finish(time) {
    const one = this.one;
    const rest = this.rest;
    const many = rest === null ? 0 : rest.size;
    if (one === null && many === 0)
      return;
    const others = many === 0 ? null : [...rest.values()];
    enter();
    try {
      if (one !== null)
        one.snk.end(time);
      if (others === null)
        return;
      for (const way of others)
        if (!way.gone)
          way.snk.end(time);
    } finally {
      leave();
    }
  }
};
var Hub = class extends Listeners {
  source;
  held = disposeNone();
  done = false;
  constructor(source) {
    super();
    this.source = source;
  }
  end(time) {
    this.done = true;
    this.held = disposeNone();
    this.finish(time);
    this.clear();
  }
  greet(_snk, _sch) {
  }
  emptied() {
  }
  join(snk, sch) {
    const way = super.join(snk, sch);
    if (way !== this.one || this.held !== disposeNone())
      return way;
    const held = this.source.run(this, sch);
    if (this.none()) {
      dispose(held);
      return way;
    }
    this.held = held;
    return way;
  }
  start(snk, sch) {
    this.greet(snk, sch);
    if (this.done) {
      snk.end(sch.currentTime());
      return disposeNone();
    }
    return this.join(snk, sch);
  }
  drop(snk) {
    super.drop(snk);
    if (!this.none())
      return;
    dispose(this.held);
    this.held = disposeNone();
    this.emptied();
  }
};
var Relayed = class extends Listeners {
  last = void 0;
  said = false;
  ended = false;
  event(time, value) {
    this.last = value;
    this.said = true;
    this.told(time, value);
  }
  end(time) {
    this.ended = true;
    this.finish(time);
    this.clear();
  }
  start(snk, sch) {
    if (this.said)
      snk.event(sch.currentTime(), this.last);
    if (this.ended) {
      snk.end(sch.currentTime());
      return disposeNone();
    }
    return this.join(snk, sch);
  }
};
var Relay = class extends Hub {
  event(time, value) {
    this.told(time, value);
  }
};
var Fold = class extends Hub {
  step;
  acc;
  capture = false;
  capturedEnd = null;
  constructor(source, step, init2) {
    super(source);
    this.step = step;
    this.acc = init2;
  }
  event(time, value) {
    this.acc = this.step(this.acc, value);
    if (this.capture)
      return;
    touch();
    this.told(time, this.acc);
  }
  end(time) {
    if (this.capture) {
      if (this.capturedEnd === null)
        this.capturedEnd = time;
      return;
    }
    if (this.done)
      return;
    super.end(time);
  }
  greet(snk, sch) {
    snk.event(sch.currentTime(), this.acc);
  }
  start(snk, sch) {
    if (this.done) {
      this.greet(snk, sch);
      snk.end(sch.currentTime());
      return disposeNone();
    }
    const way = Listeners.prototype.join.call(this, snk, sch);
    let ending = null;
    if (way === this.one && this.held === disposeNone()) {
      this.capture = true;
      const held = this.source.run(this, sch);
      this.capture = false;
      ending = this.capturedEnd;
      this.capturedEnd = null;
      if (this.none()) {
        dispose(held);
        return way;
      }
      this.held = held;
    }
    if (!way.gone)
      this.greet(snk, sch);
    if (ending !== null) {
      const held = this.held;
      this.held = disposeNone();
      dispose(held);
      this.end(ending);
    }
    return way;
  }
};

// node_modules/@algosail/plystream/dist/mod.js
function disposable2(onDispose) {
  return disposable(onDispose);
}
function disposeNone2() {
  return disposeNone();
}
function dispose2(d) {
  return dispose(d);
}
function task2(run) {
  return task(run);
}
function defaultScheduler2() {
  return defaultScheduler();
}
function stream(run) {
  return new Plain(run);
}
function heldStream(run) {
  return new Held(run);
}
function isStream(value) {
  return value instanceof Plain;
}
function isHeld(value) {
  return value instanceof Held;
}
function isSource(value) {
  return isStream(value) || isHeld(value);
}
function sink(event, end) {
  return { event, end };
}
function subscribe(onEvent, onEnd = IGNORE_END, scheduler = defaultScheduler2()) {
  return (strm) => strm.run(sink(onEvent, onEnd), scheduler);
}
var IGNORE_END = () => {
};
function never2() {
  return stream(() => disposeNone2());
}
function mergeArray(streams) {
  return mergeSources(streams);
}
function restart(step, start, wait) {
  return (source) => stream((snk, sch) => {
    let state2 = start;
    let phase = "wait";
    let current = disposeNone2();
    let timer = disposeNone2();
    const rest = () => {
      if (phase !== "live")
        return;
      phase = "wait";
      dispose2(current);
      current = disposeNone2();
      timer = sch.delay(wait(state2), task2(() => {
        if (phase === "wait")
          begin(true);
      }));
    };
    const begin = (again) => {
      phase = "live";
      let ready = false;
      let ended = false;
      const inner = source(again).run(sink((time, value) => {
        if (phase !== "live")
          return;
        state2 = step(state2, value);
        snk.event(time, value);
      }, () => {
        if (phase !== "live")
          return;
        ended = true;
        if (ready)
          rest();
      }), sch);
      ready = true;
      current = inner;
      if (ended)
        rest();
    };
    begin(false);
    return disposable2(() => {
      phase = "dead";
      dispose2(timer);
      dispose2(current);
    });
  });
}
function scan(scanner, seed) {
  return (strm) => stream((snk, sch) => {
    let state2 = seed;
    return strm.run(new Ending((t, a) => {
      state2 = scanner(state2, a);
      snk.event(t, state2);
    }, snk), sch);
  });
}
function skipRepeats(compare2) {
  return ((strm) => {
    const run = (snk, sch) => {
      let last2 = nothing();
      return strm.run(new Ending((t, a) => {
        if (last2.tag === "nothing" || !compare2(last2.value, a)) {
          last2 = just(a);
          snk.event(t, a);
        }
      }, snk), sch);
    };
    return isHeld(strm) ? heldStream(run) : stream(run);
  });
}
function join2(concurrency, strategy) {
  return (s) => stream((outer, sch) => {
    let outerClosed = false;
    let lastTime = 0;
    const queue = [];
    const running = /* @__PURE__ */ new Map();
    const startInner = (strm) => {
      const onEnd2 = (t) => {
        lastTime = Math.max(lastTime, t);
        running.delete(innerSnk);
        if (running.size < concurrency && queue.length > 0) {
          startInner(queue.shift());
        }
        if (outerClosed && running.size === 0)
          outer.end(lastTime);
      };
      const innerSnk = new Passing(outer, onEnd2);
      running.set(innerSnk, disposeNone2());
      const d2 = strm.run(innerSnk, sch);
      if (running.has(innerSnk))
        running.set(innerSnk, d2);
      else
        dispose2(d2);
    };
    const onEvent = (t, strm) => {
      lastTime = Math.max(lastTime, t);
      if (running.size < concurrency)
        return startInner(strm);
      if (strategy === "hold") {
        queue.push(strm);
        return;
      }
      if (strategy === "swap") {
        queue.length = 0;
        const oldest = running.entries().next();
        if (!oldest.done) {
          const [oldestSink, oldestDsp] = oldest.value;
          running.delete(oldestSink);
          dispose2(oldestDsp);
        }
        startInner(strm);
        return;
      }
    };
    const onEnd = (t) => {
      lastTime = Math.max(lastTime, t);
      outerClosed = true;
      if (running.size === 0 && queue.length === 0)
        outer.end(lastTime);
    };
    const d = s.run(sink(onEvent, onEnd), sch);
    return disposable2(() => {
      queue.length = 0;
      running.forEach((inner) => dispose2(inner));
      running.clear();
      if (!outerClosed)
        dispose2(d);
    });
  });
}
function switchLatest(s) {
  return join2(1, "swap")(s);
}
function switchMap(fn) {
  return (strm) => switchLatest(stream(mapping(strm, fn)));
}
function multicast(strm) {
  const hub = new Relay(strm);
  return stream((snk, sch) => hub.start(snk, sch));
}
function hold(step, init2) {
  return (strm) => {
    const hub = new Fold(strm, step, init2);
    return heldStream((snk, sch) => hub.start(snk, sch));
  };
}
function holdWith(init2) {
  return hold((_acc, a) => a, init2);
}
function relayed() {
  const hub = new Relayed();
  return [
    heldStream((snk, sch) => hub.start(snk, sch)),
    (strm, scheduler = defaultScheduler2()) => strm.run(hub, scheduler)
  ];
}
function bus() {
  const hub = new Listeners();
  const emit = (value) => {
    touch();
    hub.tell(value);
  };
  return [stream((snk, sch) => hub.join(snk, sch)), emit];
}
function state(init2) {
  let now = init2;
  const hub = new Listeners();
  const held = heldStream((snk, sch) => {
    const reading2 = hub.join(snk, sch);
    snk.event(sch.currentTime(), now);
    return reading2;
  });
  const set2 = (value) => {
    now = value;
    touch();
    hub.tell(value);
  };
  return [held, set2];
}

// node_modules/@algosail/plydom/dist/close.js
var isNil = (x) => x === null || x === void 0;
var isNotNil = (x) => !isNil(x);
var NOTHING_TO_CLOSE = disposeNone2();
function disposeEach(disposables) {
  for (const disposable3 of disposables)
    dispose2(disposable3);
}
function joinDisposables(disposables) {
  if (disposables === null)
    return NOTHING_TO_CLOSE;
  return disposables.length === 1 ? disposables[0] : disposable2(() => disposeEach(disposables));
}
function addDisposable(list, disposable3) {
  if (disposable3 === NOTHING_TO_CLOSE)
    return list;
  if (list === null)
    return [disposable3];
  list.push(disposable3);
  return list;
}
function removeIfPresent(parent, child) {
  if (isNotNil(parent) && child.parentNode === parent) {
    parent.removeChild(child);
  }
}
function removeRange(parent, open, close) {
  const first = open === null ? parent.firstChild : open.nextSibling;
  if (first === null || first === close)
    return;
  if (first.nextSibling === close) {
    parent.removeChild(first);
    return;
  }
  if (open === null && close === null) {
    parent.textContent = "";
    return;
  }
  const doc = parent.ownerDocument;
  if (doc !== null && typeof doc.createRange === "function") {
    const range2 = doc.createRange();
    if (open === null)
      range2.setStart(parent, 0);
    else
      range2.setStartAfter(open);
    if (close === null)
      range2.selectNodeContents(parent);
    else
      range2.setEndBefore(close);
    if (open !== null)
      range2.setStartAfter(open);
    range2.deleteContents();
    return;
  }
  let node = first;
  while (node !== null && node !== close) {
    const next = node.nextSibling;
    parent.removeChild(node);
    node = next;
  }
}

// node_modules/@algosail/plydom/dist/output.js
var OUT = Symbol("out");
var ON = Symbol("on");
var ROUTES = Symbol("routes");
var GIVEN = Symbol("given");
var PROVIDERS = Symbol("providers");
var NoSuchPart = class extends Error {
};
var AskedTooLate = class extends Error {
};
var NO_OUTPUTS = {};
var NO_ROUTES = {};
var NO_EVENT = "";
var NO_EVENT_ROUTE = Object.freeze({ type: NO_EVENT, view: null });
function mergeStreams(had, one) {
  return had === void 0 ? one : mergeArray([had, one]);
}
function fieldsOf(value) {
  return typeof value === "object" && value !== null ? value : null;
}
function hasRun(value) {
  return typeof value === "object" && value !== null && "run" in value && typeof value.run === "function";
}
function everySource(value) {
  for (const name of Object.keys(value)) {
    if (!hasRun(value[name]))
      return false;
  }
  return true;
}
function concatProviders(had, more) {
  if (had === void 0)
    return more;
  return [...had, ...more];
}
function gatherFrom(value, into) {
  const fields = fieldsOf(value);
  if (fields === null)
    return into;
  if (Array.isArray(value)) {
    let gathered = into;
    for (let i = 0; i < value.length; i++)
      gathered = gatherFrom(value[i], gathered);
    return gathered;
  }
  const routes = fields[ROUTES];
  if (routes === void 0)
    return into;
  return mergeGathered(into, fields, routes);
}
function mergeGathered(into, fields, routes) {
  const gathered = into ?? { streams: {}, routes: {} };
  const providers = routes[PROVIDERS];
  if (providers !== void 0) {
    gathered.routes[PROVIDERS] = concatProviders(gathered.routes[PROVIDERS], providers);
  }
  const streams = fields[OUT];
  if (streams !== void 0 && everySource(streams)) {
    for (const name of Object.keys(streams)) {
      gathered.streams[name] = mergeStreams(gathered.streams[name], streams[name]);
    }
  }
  for (const name of Object.keys(routes)) {
    const had = gathered.routes[name];
    const more = routes[name];
    gathered.routes[name] = had === void 0 ? more : [...had, ...more];
  }
  return gathered;
}
function setOutputs(target, streams, routes) {
  const fields = fieldsOf(target);
  if (fields === null)
    return;
  fields[OUT] = streams;
  fields[ROUTES] = routes;
}
function applyUse(target, spec, define) {
  const fields = fieldsOf(target);
  if (fields === null)
    return target;
  const hadStreams = fields[OUT];
  const hadRoutes = fields[ROUTES];
  const streams = hadStreams !== void 0 && everySource(hadStreams) ? { ...hadStreams } : {};
  const routes = hadRoutes === void 0 ? {} : { ...hadRoutes };
  for (const name of Object.keys(spec)) {
    const [source, route] = define(name, spec[name]);
    const had = routes[name];
    streams[name] = mergeStreams(streams[name], source);
    routes[name] = had === void 0 ? [route] : [...had, route];
  }
  fields[OUT] = streams;
  fields[ROUTES] = routes;
  return target;
}
function setGiven(target, given) {
  const fields = fieldsOf(target);
  if (fields !== null)
    fields[GIVEN] = given;
  return target;
}
function outsOf(target) {
  const streams = fieldsOf(target)?.[OUT];
  return streams !== void 0 && everySource(streams) ? streams : NO_OUTPUTS;
}
function givenOf(target) {
  const given = fieldsOf(target)?.[GIVEN];
  return given !== void 0 && everySource(given) ? given : NO_OUTPUTS;
}
function routesOf(target) {
  return fieldsOf(target)?.[ROUTES] ?? NO_ROUTES;
}
function subscribeTo(target, names, sink2) {
  const streams = outsOf(target);
  let held = null;
  for (const name of names) {
    const source = streams[name];
    if (source !== void 0)
      (held ??= []).push(sink2.accept(name, source));
  }
  const opened2 = subscribeToProviders(target, names, sink2);
  if (opened2 !== NOTHING_TO_CLOSE)
    (held ??= []).push(opened2);
  return joinDisposables(held);
}
function subscribeToProviders(target, names, sink2) {
  const providers = providersOf(target);
  if (providers === void 0)
    return NOTHING_TO_CLOSE;
  let held = null;
  for (const provider of providers) {
    const subscription = provider.subscribe(names, sink2);
    if (subscription !== NOTHING_TO_CLOSE)
      (held ??= []).push(subscription);
  }
  return joinDisposables(held);
}
function providersOf(value) {
  const fields = fieldsOf(value);
  return fields === null ? void 0 : fields[ROUTES]?.[PROVIDERS];
}
function takeChildOutputs(view, children) {
  if (children.length === 1) {
    const only = children[0];
    const fields = fieldsOf(only);
    if (fields !== null && !Array.isArray(only)) {
      const routes = fields[ROUTES];
      if (routes !== void 0)
        setOutputs(view, fields[OUT] ?? NO_OUTPUTS, routes);
      return view;
    }
  }
  let gathered = null;
  for (let i = 0; i < children.length; i++) {
    gathered = gatherFrom(children[i], gathered);
  }
  if (gathered !== null)
    setOutputs(view, gathered.streams, gathered.routes);
  return view;
}

// node_modules/@algosail/plydom/dist/backend.js
var domBackend = {
  element: (tag) => document.createElement(tag),
  elementNS: (ns, tag) => document.createElementNS(ns, tag),
  text: (data) => document.createTextNode(data),
  comment: (data) => document.createComment(data)
};
var backend = domBackend;
function getBackend() {
  return backend;
}

// node_modules/@algosail/plydom/dist/hosts/host.js
var CELL_OPEN = "[";
var CELL_CLOSE = "]";
var TEXT_NODE = 3;
function isText(node) {
  return node.nodeType === TEXT_NODE;
}
function createElement(tag, ns) {
  return ns === null ? getBackend().element(tag) : getBackend().elementNS(ns, tag);
}
function buildIn(host, element, fill) {
  const adopted = host.hydrating;
  const inner = host.descend(element);
  let disposables;
  try {
    disposables = fill(inner);
  } finally {
    inner.done();
  }
  return { node: element, disposables, adopted };
}

// node_modules/@algosail/plydom/dist/hosts/build.js
var BuildHost = class {
  hydrating = false;
  parent;
  detaches;
  rootDetaches;
  parents = null;
  constructor(parent, detaches) {
    this.parent = parent;
    this.detaches = detaches;
    this.rootDetaches = detaches;
  }
  element(_anchor, tag, ns) {
    return createElement(tag, ns);
  }
  text(anchor, data) {
    const node = getBackend().text(data);
    this.parent?.insertBefore(node, anchor);
    return node;
  }
  comment(anchor, data) {
    const node = getBackend().comment(data);
    this.parent?.insertBefore(node, anchor);
    return node;
  }
  place(anchor, node) {
    this.parent?.insertBefore(node, anchor);
    return node;
  }
  descend(element) {
    const parents = this.parents ?? (this.parents = []);
    parents.push(this.parent);
    this.parent = element;
    this.detaches = false;
    return this;
  }
  region() {
    return null;
  }
  childSlot(fill) {
    return fill(this.comment(null, ""));
  }
  done() {
    const parents = this.parents;
    if (parents === null || parents.length === 0)
      return;
    this.parent = parents.pop();
    this.detaches = parents.length === 0 ? this.rootDetaches : false;
  }
};
function buildHost(parent) {
  return new BuildHost(parent, true);
}
function buildInside(parent) {
  return new BuildHost(parent, false);
}

// node_modules/@algosail/plydom/dist/view.js
var NODE = Symbol("node");
var MATERIALIZE = Symbol("materialize");
var WHEN_NODE = Symbol("whenNode");
var NO_DISPOSABLES = [];
var MarkupView = class {
  tag = "view";
  use(spec) {
    return applyUse(this, spec, (_name, type) => [
      eventsOf(this, type),
      { type, view: this }
    ]);
  }
  output(given) {
    return setGiven(this, given);
  }
};
var ExistingView = class extends MarkupView {
  state;
  constructor(state2) {
    super();
    this.state = state2;
  }
  [MATERIALIZE]() {
    return this.state;
  }
  [WHEN_NODE](f) {
    f(this.state.node);
    return disposeNone2();
  }
  get [NODE]() {
    return this.state.node;
  }
  [Symbol.dispose]() {
    release(this.state);
  }
};
var LazyView = class extends MarkupView {
  build;
  state = null;
  waiting = null;
  constructor(build) {
    super();
    this.build = build;
  }
  [MATERIALIZE](host, anchor) {
    if (this.state === null) {
      const state2 = this.build(host, anchor);
      this.state = state2;
      nodeReady(this, state2.node);
    }
    return this.state;
  }
  [WHEN_NODE](f) {
    const state2 = this.state;
    if (state2 !== null) {
      f(state2.node);
      return disposeNone2();
    }
    return waitForNode(this, f);
  }
  get [NODE]() {
    const state2 = this.state;
    return state2 !== null ? state2.node : this[MATERIALIZE](buildHost(null), null).node;
  }
  [Symbol.dispose]() {
    const state2 = this.state;
    if (state2 !== null)
      release(state2);
  }
};
var WrappedView = class extends MarkupView {
  extra;
  inner;
  constructor(extra, inner) {
    super();
    this.extra = extra;
    this.inner = inner;
  }
  [MATERIALIZE](host, anchor) {
    return materialize(this.inner, host, anchor);
  }
  [WHEN_NODE](f) {
    return onNode(this.inner, f);
  }
  get [NODE]() {
    return this.inner[NODE];
  }
  [Symbol.dispose]() {
    dispose2(this.extra);
    dispose2(this.inner);
  }
};
function release(state2) {
  disposeEach(state2.disposables);
  state2.disposables = NO_DISPOSABLES;
}
function materialize(view, host, anchor) {
  return view[MATERIALIZE](host, anchor);
}
function onNode(view, f) {
  return view[WHEN_NODE](f);
}
function waitForNode(pending, hear) {
  const asked = pending.waiting ?? (pending.waiting = []);
  asked.push(hear);
  return disposable2(() => {
    const index2 = asked.indexOf(hear);
    if (index2 >= 0)
      asked.splice(index2, 1);
  });
}
function nodeReady(pending, node) {
  const asked = pending.waiting;
  pending.waiting = null;
  if (asked !== null) {
    for (const hear of asked)
      hear(node);
  }
}
function eventsOf(view, type, options) {
  return stream((sink2, scheduler) => {
    let node = null;
    let listener = null;
    const waiting = onNode(view, (ready) => {
      const hear = (event) => {
        sink2.event(scheduler.currentTime(), event);
      };
      node = ready;
      listener = hear;
      ready.addEventListener(type, hear, options);
    });
    return disposable2(() => {
      dispose2(waiting);
      if (node !== null && listener !== null) {
        node.removeEventListener(type, listener, options);
        node = null;
        listener = null;
      }
    });
  });
}
function lazyView(build) {
  return new LazyView(build);
}
function isView(value) {
  return typeof value === "object" && value !== null && "tag" in value && value.tag === "view" && NODE in value;
}
function wrapView(extra, view) {
  return new WrappedView(extra, view);
}

// node_modules/@algosail/plydom/dist/branch.js
var Shown = class {
  view = null;
  shownBy = null;
  firstWatch = null;
  used = null;
  subscribe(names, sink2) {
    const used2 = this.used;
    const needed = used2 === null ? names : names.filter((name) => !used2.has(name));
    return needed.length === 0 ? NOTHING_TO_CLOSE : this.watch(needed, sink2);
  }
  watch(names, sink2) {
    const watch = new NameWatch(this, names, sink2);
    watch.next = this.firstWatch;
    this.firstWatch = watch;
    if (this.view !== null)
      watch.subscription = subscribeTo(this.view, names, sink2);
    return watch;
  }
  show(view, shownBy) {
    this.view = view;
    this.shownBy = shownBy;
    for (let watch = this.firstWatch; watch !== null; watch = watch.next) {
      dispose2(watch.subscription);
      watch.subscription = view === null ? NOTHING_TO_CLOSE : subscribeTo(view, watch.names, watch.sink);
    }
  }
  hide(shownBy) {
    if (this.shownBy === shownBy)
      this.show(null, shownBy);
  }
  remove(gone) {
    if (this.firstWatch === gone) {
      this.firstWatch = gone.next;
      return;
    }
    for (let watch = this.firstWatch; watch !== null; watch = watch.next) {
      if (watch.next === gone) {
        watch.next = gone.next;
        return;
      }
    }
  }
};
var NameWatch = class {
  shown;
  names;
  sink;
  subscription = NOTHING_TO_CLOSE;
  next = null;
  constructor(shown, names, sink2) {
    this.shown = shown;
    this.names = names;
    this.sink = sink2;
  }
  [Symbol.dispose]() {
    dispose2(this.subscription);
    this.subscription = NOTHING_TO_CLOSE;
    this.shown.remove(this);
  }
};
var HeldBranch = class extends Held {
  input;
  pick;
  shown;
  constructor(input, pick) {
    super();
    this.input = input;
    this.pick = pick;
    this.shown = new Shown();
    this[ROUTES] = { [PROVIDERS]: [this.shown] };
  }
  use(spec) {
    return wireUse(this, spec);
  }
  output(given) {
    return setGiven(this, given);
  }
  run(sink2, scheduler = defaultScheduler2()) {
    return readBranch(this, sink2, scheduler);
  }
};
var PlainBranch = class extends Plain {
  input;
  pick;
  shown;
  constructor(input, pick) {
    super();
    this.input = input;
    this.pick = pick;
    this.shown = new Shown();
    this[ROUTES] = { [PROVIDERS]: [this.shown] };
  }
  use(spec) {
    return wireUse(this, spec);
  }
  output(given) {
    return setGiven(this, given);
  }
  run(sink2, scheduler = defaultScheduler2()) {
    return readBranch(this, sink2, scheduler);
  }
};
var Picking = class {
  downstream;
  pick;
  shown;
  subscription = NOTHING_TO_CLOSE;
  constructor(downstream, pick, shown) {
    this.downstream = downstream;
    this.pick = pick;
    this.shown = shown;
  }
  event(time, value) {
    const child = this.pick(value);
    this.shown.show(viewIn(child), this);
    this.downstream.event(time, child);
  }
  end(time) {
    this.downstream.end(time);
  }
  [Symbol.dispose]() {
    dispose2(this.subscription);
    this.shown.hide(this);
  }
};
var AttachSink = class {
  attach;
  constructor(attach) {
    this.attach = attach;
  }
  accept(_name, source) {
    return this.attach(source);
  }
};
function readBranch(branch, sink2, scheduler) {
  const picking = new Picking(sink2, branch.pick, branch.shown);
  picking.subscription = branch.input.run(picking, scheduler);
  return picking;
}
function viewIn(child) {
  if (isView(child))
    return child;
  return child.match(() => null, (view) => view);
}
function wireUse(branch, spec) {
  const shown = branch.shown;
  const used2 = shown.used ?? (shown.used = /* @__PURE__ */ new Set());
  return applyUse(branch, spec, (name, sourceName) => {
    const [stream2, attach] = relayed();
    shown.watch([sourceName], new AttachSink(attach));
    used2.add(name);
    return [stream2, NO_EVENT_ROUTE];
  });
}
function makeBranch(source, pick) {
  const input = source;
  const pickChild = pick;
  const branch = isHeld(source) ? new HeldBranch(input, pickChild) : new PlainBranch(input, pickChild);
  return branch;
}
var skipUnchanged = skipRepeats((a, b) => a === b);
function branchOn(pick) {
  return ((from) => makeBranch(skipUnchanged(from), pick));
}

// node_modules/@algosail/plydom/dist/hosts/hydrate.js
var COMMENT_NODE = 8;
var ELEMENT_NODE = 1;
function isComment(node) {
  return node.nodeType === COMMENT_NODE;
}
function isElement(node) {
  return node.nodeType === ELEMENT_NODE;
}
function detachSiblings(parent, stop, from, accept) {
  let node = from;
  while (node !== null && node !== stop && accept(node)) {
    const next = node.nextSibling;
    parent.removeChild(node);
    node = next;
  }
  return node;
}
function isFormatting(node) {
  return isText(node) && node.data.trim() === "";
}
var anyNode = () => true;
function findCellClose(from, stop) {
  let depth2 = 1;
  for (let node = from; node !== null && node !== stop; node = node.nextSibling) {
    if (!isComment(node))
      continue;
    if (node.data === CELL_OPEN)
      depth2 += 1;
    else if (node.data === CELL_CLOSE && --depth2 === 0)
      return node;
  }
  return null;
}
function takeText(node, stop, data) {
  if (node === null || node === stop || !isText(node))
    return null;
  if (node.data !== data) {
    if (!startsWith(data)(node.data))
      return null;
    const tail3 = getBackend().text(node.data.slice(data.length));
    node.parentNode?.insertBefore(tail3, node.nextSibling);
    node.data = data;
  }
  return node;
}
function skipFormatting(host) {
  host.cursor = detachSiblings(host.parent, host.stop, host.cursor, isFormatting);
}
function stopHydrating(host) {
  host.cursor = detachSiblings(host.parent, host.stop, host.cursor, anyNode);
  host.hydrating = false;
}
function insertBeforeStop(host, anchor, node) {
  host.parent.insertBefore(node, anchor ?? host.stop);
  return node;
}
var HydrateHost = class {
  hydrating = true;
  parent;
  detaches;
  cursor;
  stop;
  constructor(parent, cursor, stop, detaches) {
    this.parent = parent;
    this.cursor = cursor;
    this.stop = stop;
    this.detaches = detaches;
  }
  element(_anchor, tag, ns) {
    if (this.hydrating) {
      skipFormatting(this);
      const node = this.cursor;
      if (node !== null && node !== this.stop && isElement(node) && node.localName === tag && (ns === null || node.namespaceURI === ns)) {
        this.cursor = node.nextSibling;
        return node;
      }
      stopHydrating(this);
    }
    return createElement(tag, ns);
  }
  text(anchor, data) {
    if (this.hydrating) {
      if (data === "") {
        const node2 = getBackend().text("");
        this.parent.insertBefore(node2, this.cursor);
        return node2;
      }
      const node = takeText(this.cursor, this.stop, data);
      if (node !== null) {
        this.cursor = node.nextSibling;
        return node;
      }
      stopHydrating(this);
    }
    return insertBeforeStop(this, anchor, getBackend().text(data));
  }
  comment(anchor, data) {
    if (this.hydrating) {
      skipFormatting(this);
      const node = this.cursor;
      if (node !== null && node !== this.stop && isComment(node) && node.data === data) {
        this.cursor = node.nextSibling;
        return node;
      }
      stopHydrating(this);
    }
    return insertBeforeStop(this, anchor, getBackend().comment(data));
  }
  place(anchor, node) {
    if (this.hydrating)
      stopHydrating(this);
    return insertBeforeStop(this, anchor, node);
  }
  descend(element) {
    return this.hydrating ? hydrateHost(element, element.firstChild, null, false) : buildInside(element);
  }
  region(whole) {
    if (!this.hydrating)
      return null;
    if (whole) {
      this.cursor = this.stop;
      return { parent: this.parent, close: this.stop };
    }
    const close = findCellClose(this.cursor, this.stop);
    if (close === null) {
      stopHydrating(this);
      return null;
    }
    this.cursor = close;
    return { parent: this.parent, close };
  }
  childSlot(fill) {
    if (!this.hydrating)
      return fill(this.comment(null, ""));
    const handle = fill(null);
    this.comment(null, "");
    return handle;
  }
  done() {
    this.cursor = detachSiblings(this.parent, this.stop, this.cursor, anyNode);
  }
};
function adopt(mount, source, parent, from, stop) {
  const view = typeof source === "function" ? source() : source;
  const host = hydrateHost(parent, from, stop);
  const handle = mount(host, stop, view);
  host.done();
  return handle;
}
function hydrateHost(parent, cursor, stop, detaches = true) {
  return new HydrateHost(parent, cursor, stop, detaches);
}
function hydrateWith(mount) {
  return {
    hydrate: (parent) => (source) => adopt(mount, source, parent, parent.firstChild, null),
    hydrateIn: ({ parent, open, close }) => (source) => adopt(mount, source, parent, open.nextSibling, close)
  };
}

// node_modules/@algosail/plydom/dist/list.js
function nodeOf(view) {
  return view[NODE];
}
function shiftedRight(was, now, from, count) {
  for (let step = 0; step < count; step++) {
    if (now[from + step + 1] !== was[from + step])
      return false;
  }
  return true;
}
function shiftedLeft(was, now, from, count) {
  for (let step = 0; step < count; step++) {
    if (now[from + step] !== was[from + step + 1])
      return false;
  }
  return true;
}
function middleStayed(was, now, from, to) {
  for (let index2 = from + 1; index2 < to; index2++) {
    if (now[index2] !== was[index2])
      return false;
  }
  return true;
}
function alreadyInOrder(places) {
  const piles = [];
  const before = new Int32Array(places.length);
  const stay = new Uint8Array(places.length);
  for (let index2 = 0; index2 < places.length; index2++) {
    const place = places[index2];
    if (place < 0)
      continue;
    let low = 0;
    let high = piles.length;
    while (low < high) {
      const mid = low + high >> 1;
      if (places[piles[mid]] < place)
        low = mid + 1;
      else
        high = mid;
    }
    if (low > 0)
      before[index2] = piles[low - 1] + 1;
    piles[low] = index2;
  }
  let at = piles.length > 0 ? piles[piles.length - 1] + 1 : 0;
  while (at > 0) {
    stay[at - 1] = 1;
    at = before[at - 1];
  }
  return stay;
}
function patchViews(place, was, now, insert2) {
  const parent = place.host.parent;
  let head3 = 0;
  while (head3 < was.length && head3 < now.length && was[head3] === now[head3]) {
    head3 += 1;
  }
  let oldTail = was.length - 1;
  let newTail = now.length - 1;
  while (oldTail >= head3 && newTail >= head3 && was[oldTail] === now[newTail]) {
    oldTail -= 1;
    newTail -= 1;
  }
  if (head3 > oldTail && head3 > newTail)
    return false;
  if (now.length === 0) {
    removeRange(parent, place.open, place.close);
    disposeEach(was);
    return true;
  }
  const after = oldTail + 1 < was.length ? nodeOf(was[oldTail + 1]) : place.close;
  const oldCount = oldTail - head3 + 1;
  if (oldCount === newTail - head3 + 1) {
    const oldLastIsNewFirst = now[head3] === was[oldTail];
    const oldFirstIsNewLast = now[newTail] === was[head3];
    if (oldLastIsNewFirst && oldFirstIsNewLast && middleStayed(was, now, head3, newTail)) {
      parent.insertBefore(nodeOf(now[newTail]), after);
      if (oldCount > 2) {
        parent.insertBefore(nodeOf(now[head3]), nodeOf(now[head3 + 1]));
      }
      return true;
    }
    if (oldLastIsNewFirst && shiftedRight(was, now, head3, oldCount - 1)) {
      parent.insertBefore(nodeOf(now[head3]), nodeOf(now[head3 + 1]));
      return true;
    }
    if (oldFirstIsNewLast && shiftedLeft(was, now, head3, oldCount - 1)) {
      parent.insertBefore(nodeOf(now[newTail]), after);
      return true;
    }
  }
  const from = /* @__PURE__ */ new Map();
  for (let index2 = head3; index2 <= oldTail; index2++)
    from.set(was[index2], index2);
  const places = [];
  for (let index2 = head3; index2 <= newTail; index2++) {
    const oldIndex = from.get(now[index2]);
    places.push(oldIndex === void 0 ? -1 : oldIndex);
    from.delete(now[index2]);
  }
  for (const view of from.keys()) {
    removeIfPresent(parent, nodeOf(view));
    dispose2(view);
  }
  const stay = alreadyInOrder(places);
  let anchor = after;
  for (let index2 = places.length - 1; index2 >= 0; index2--) {
    const view = now[head3 + index2];
    if (stay[index2] === 1) {
      anchor = nodeOf(view);
      continue;
    }
    if (places[index2] < 0) {
      insert2(anchor, view);
      anchor = nodeOf(view);
    } else {
      const node = nodeOf(view);
      parent.insertBefore(node, anchor);
      anchor = node;
    }
  }
  return true;
}

// node_modules/@algosail/plydom/dist/child.js
var NO_VIEWS = [];
var Cell = class {
  parent;
  detaches;
  open;
  close;
  place = null;
  region;
  contents = NOTHING_TO_CLOSE;
  views = NO_VIEWS;
  patchable = false;
  subscription = NOTHING_TO_CLOSE;
  constructor(host, anchor, fillsParent) {
    this.parent = host.parent;
    this.detaches = host.detaches;
    this.open = fillsParent ? null : host.comment(anchor, CELL_OPEN);
    this.region = host.region(fillsParent);
    this.close = fillsParent ? null : host.comment(anchor, CELL_CLOSE);
  }
  event(_time, value) {
    if (this.region !== null) {
      this.replace(value);
      return;
    }
    if (this.writeText(value))
      return;
    if (this.moveViews(value))
      return;
    this.replace(value);
  }
  end(_time) {
  }
  [Symbol.dispose]() {
    dispose2(this.contents);
    const parent = this.parent;
    if (this.detaches && parent !== null) {
      const open = this.open;
      const close = this.close;
      removeRange(parent, open, close);
      if (open !== null)
        removeIfPresent(parent, open);
      if (close !== null)
        removeIfPresent(parent, close);
    }
    disposeEach(this.views);
    dispose2(this.subscription);
  }
  writeText(value) {
    if (typeof value !== "string" && typeof value !== "number")
      return false;
    const parent = this.parent;
    const open = this.open;
    const close = this.close;
    const text = String(value);
    const first = open === null ? parent?.firstChild ?? null : open.nextSibling;
    if (this.views.length === 0 && first !== null && first.nextSibling === close && isText(first)) {
      if (first.data !== text)
        first.data = text;
      return true;
    }
    dispose2(this.contents);
    if (parent !== null)
      removeRange(parent, open, close);
    disposeEach(this.views);
    this.views = NO_VIEWS;
    this.patchable = false;
    const node = getBackend().text(text);
    parent?.insertBefore(node, close);
    return true;
  }
  moveViews(value) {
    const place = this.place;
    if (!this.patchable || place === null || !isViewList(value))
      return false;
    if (patchViews(place, this.views, value, (anchor, view) => {
      mountChild(place.host, anchor, view);
    }))
      this.views = value.slice();
    return true;
  }
  replace(value) {
    dispose2(this.contents);
    this.contents = NOTHING_TO_CLOSE;
    const parent = this.parent;
    if (this.region === null && parent !== null) {
      removeRange(parent, this.open, this.close);
    }
    const claimed2 = this.region;
    this.region = null;
    const next = [];
    const place = this.place ?? (this.place = {
      host: parent === null ? buildHost(null) : buildInside(parent),
      open: this.open,
      close: this.close
    });
    this.contents = showChild(place, claimed2, value, next);
    disposeEach(viewsLeft(this.views, next));
    this.views = next.length === 0 ? NO_VIEWS : next;
    this.patchable = parent !== null && isViewList(value);
  }
};
function isMaybeChild(value) {
  return isMaybe(value);
}
function isEmpty2(child) {
  return isNil(child) || isMaybeChild(child) && maybe_(() => true)(isEmpty2)(child);
}
function needsSlot(child) {
  return Array.isArray(child) || isMaybeChild(child);
}
function isViewList(value) {
  if (!Array.isArray(value))
    return false;
  for (let index2 = 0; index2 < value.length; index2++) {
    const item = value[index2];
    if (item === null || item === void 0)
      return false;
    if (item.tag !== "view")
      return false;
  }
  return true;
}
function viewsLeft(was, now) {
  const kept = new Set(now);
  const left2 = [];
  for (const view of was) {
    if (!kept.has(view))
      left2.push(view);
  }
  return left2;
}
function mountEach(host, children, held) {
  let list = held;
  try {
    for (const child of children) {
      list = addDisposable(list, needsSlot(child) ? host.childSlot((anchor) => mountChild(host, anchor, child)) : mountChild(host, null, child));
    }
    return list;
  } catch (err) {
    if (held === null && list !== null)
      disposeEach(list);
    throw err;
  }
}
function showChild(place, region, value, into) {
  if (isEmpty2(value)) {
    if (region !== null)
      removeRange(region.parent, place.open, region.close);
    return NOTHING_TO_CLOSE;
  }
  if (region === null)
    return mountChild(place.host, place.close, value, into);
  const cursor = place.open === null ? region.parent.firstChild : place.open.nextSibling;
  const hydrating = hydrateHost(region.parent, cursor, region.close, place.host.detaches);
  const handle = mountChild(hydrating, place.close, value, into);
  hydrating.done();
  return handle;
}
function openCell(host, anchor, source, fillsParent) {
  const cell = new Cell(host, anchor, fillsParent);
  cell.subscription = source.run(cell, defaultScheduler2());
  const region = cell.region;
  if (region !== null) {
    removeRange(region.parent, cell.open, region.close);
    cell.region = null;
  }
  return cell;
}
function mountChild(host, anchor, child, collect = null) {
  const parent = host.parent;
  if (typeof child === "string" || typeof child === "number") {
    const text = host.text(anchor, String(child));
    if (!host.detaches)
      return disposeNone2();
    return disposable2(() => removeIfPresent(parent, text));
  }
  if (Array.isArray(child)) {
    let list = null;
    try {
      for (const item of child) {
        list = addDisposable(list, mountChild(host, anchor, item, collect));
      }
    } catch (err) {
      if (list !== null)
        disposeEach(list);
      throw err;
    }
    return joinDisposables(list);
  }
  if (isView(child)) {
    const state2 = materialize(child, host, anchor);
    if (state2.adopted)
      state2.adopted = false;
    else
      host.place(anchor, state2.node);
    if (collect !== null)
      collect.push(child);
    if (!host.detaches)
      return collect === null ? child : disposeNone2();
    return disposable2(() => {
      if (collect === null)
        dispose2(child);
      removeIfPresent(parent, state2.node);
    });
  }
  if (isSource(child))
    return openCell(host, anchor, child, false);
  if (isMaybeChild(child)) {
    return maybe_(() => NOTHING_TO_CLOSE)((inner) => mountChild(host, anchor, inner, collect))(child);
  }
  const _exhaustive = child;
  return disposeNone2();
}
function buildChildren(host, children) {
  return mountEach(host, children, null) ?? NO_DISPOSABLES;
}
function cellView(source) {
  return lazyView((host, anchor) => {
    const cell = openCell(host, anchor, source, false);
    return { node: cell.open, disposables: [cell], adopted: true };
  });
}
function placeChildren(host, children, held) {
  if (children.length === 1 && isSource(children[0])) {
    return addDisposable(held, openCell(host, null, children[0], true));
  }
  return mountEach(host, children, held);
}

// node_modules/@algosail/plydom/dist/component.js
var readInput = {
  get: (inputs, name) => typeof name === "string" ? (inputs[name] ??= relayed())[0] : void 0
};
var ENDED = stream((sink2, scheduler) => {
  sink2.end(scheduler.currentTime());
  return disposeNone2();
});
function missingPart(name) {
  return new NoSuchPart(`nothing is given under ${JSON.stringify(name)}`);
}
function carriesOutputs(value) {
  return providersOf(value) !== void 0;
}
function spanAround(children) {
  return lazyView((host, anchor) => {
    const wrapper = host.element(anchor, "span", null);
    wrapper.style.display = "contents";
    return buildIn(host, wrapper, (inner) => buildChildren(inner, [children]));
  });
}
var ComponentView = class {
  tag = "view";
  setup;
  props;
  inner = null;
  inputs = null;
  taken = null;
  published = null;
  wires = null;
  started = null;
  waiting = null;
  constructor(setup, props2) {
    this.setup = setup;
    this.props = props2;
  }
  use(spec) {
    return applyUse(this, spec, (_name, part) => [this.take(part), NO_EVENT_ROUTE]);
  }
  take(name) {
    const taken = this.taken ?? (this.taken = {});
    const had = taken[name];
    if (had !== void 0)
      return had[0];
    const published = this.published;
    const stream2 = published === null ? void 0 : published[name];
    if (published !== null && stream2 === void 0)
      throw missingPart(name);
    const relay = taken[name] = relayed();
    if (stream2 !== void 0)
      this.keepWire(relay[1](stream2));
    return relay[0];
  }
  keepWire(handle) {
    (this.wires ?? (this.wires = [])).push(handle);
  }
  buildInner() {
    const inputs = {};
    this.inputs = inputs;
    const start = (handle) => {
      (this.started ?? (this.started = [])).push(handle);
      return handle;
    };
    try {
      const on2 = new Proxy(inputs, readInput);
      const drawn = this.setup(this.props, on2, start);
      this.keepWire(subscribeTo(drawn, Object.keys(inputs), new ConnectInputs(inputs)));
      const given = givenOf(drawn);
      const taken = this.taken;
      if (taken !== null) {
        for (const name of Object.keys(taken)) {
          const stream2 = given[name];
          if (stream2 === void 0)
            throw missingPart(name);
          this.keepWire(taken[name][1](stream2));
        }
      }
      this.published = given;
      const inner = isView(drawn) ? drawn : carriesOutputs(drawn) ? cellView(drawn) : spanAround(drawn);
      this.inner = inner;
      return inner;
    } catch (err) {
      this.release();
      throw err;
    }
  }
  [MATERIALIZE](host, anchor) {
    const inner = this.inner ?? this.buildInner();
    let made;
    try {
      made = materialize(inner, host, anchor);
    } catch (err) {
      this.release();
      throw err;
    }
    nodeReady(this, made.node);
    return made;
  }
  [WHEN_NODE](f) {
    const inner = this.inner;
    if (inner !== null)
      return onNode(inner, f);
    return waitForNode(this, f);
  }
  get [NODE]() {
    const inner = this.inner;
    return inner !== null ? inner[NODE] : this[MATERIALIZE](buildHost(null), null).node;
  }
  release() {
    const started = this.started;
    this.started = null;
    if (started !== null)
      disposeEach(started);
    const wires = this.wires;
    this.wires = null;
    if (wires !== null)
      disposeEach(wires);
    for (const relays of [this.inputs, this.taken]) {
      if (relays === null)
        continue;
      for (const name of Object.keys(relays))
        dispose2(relays[name][1](ENDED));
    }
  }
  [Symbol.dispose]() {
    this.release();
    const inner = this.inner;
    if (inner !== null)
      dispose2(inner);
  }
};
var ConnectInputs = class {
  inputs;
  constructor(inputs) {
    this.inputs = inputs;
  }
  accept(name, source) {
    return this.inputs[name][1](source);
  }
};

// node_modules/@algosail/plydom/dist/props.js
var BOOLEAN = /* @__PURE__ */ new Set([
  "allowfullscreen",
  "async",
  "autofocus",
  "autoplay",
  "checked",
  "controls",
  "default",
  "defer",
  "disabled",
  "disablepictureinpicture",
  "disableremoteplayback",
  "download",
  "formnovalidate",
  "hidden",
  "inert",
  "ismap",
  "itemscope",
  "loop",
  "multiple",
  "muted",
  "nomodule",
  "novalidate",
  "open",
  "playsinline",
  "readonly",
  "required",
  "reversed",
  "selected",
  "shadowrootclonable",
  "shadowrootdelegatesfocus",
  "shadowrootserializable"
]);
var LIVE = /* @__PURE__ */ new Set(["value", "checked", "selected", "muted"]);
var ON2 = "on:";
var ON_HEAD = ON2.charCodeAt(0);
var DOT = ".".charCodeAt(0);
var Attr = class {
  element;
  key;
  constructor(element, key) {
    this.element = element;
    this.key = key;
  }
  event(_time, value) {
    setAttribute(this.element, this.key, value);
  }
  end() {
  }
};
var Prop = class {
  element;
  key;
  constructor(element, key) {
    this.element = element;
    this.key = key;
  }
  event(_time, value) {
    setByKey(this.element, this.key, value);
  }
  end() {
  }
};
var Styling = class {
  style;
  key;
  constructor(style, key) {
    this.style = style;
    this.key = key;
  }
  event(_time, value) {
    setByKey(this.style, this.key, value ?? "");
  }
  end() {
  }
};
var Live = class {
  element;
  key;
  constructor(element, key) {
    this.element = element;
    this.key = key;
  }
  event(_time, value) {
    writeLive(this.element, this.key, value);
  }
  end() {
  }
};
function setByKey(target, key, value) {
  const bag = target;
  bag[key] = value;
}
function setAttribute(element, key, value) {
  if (isNil(value) || value === false && BOOLEAN.has(key)) {
    element.removeAttribute(key);
  } else {
    element.setAttribute(key, value === true && BOOLEAN.has(key) ? "" : String(value));
  }
}
function writeLive(element, key, value) {
  if (key === "value") {
    const text = isNil(value) ? "" : String(value);
    setByKey(element, key, text);
    element.setAttribute(key, text);
    return;
  }
  setByKey(element, key, value);
  setAttribute(element, key, value);
}
function reading(value, into) {
  return value.run(into, defaultScheduler2());
}
function isBlock(value) {
  return typeof value === "object" && value !== null && !isSource(value);
}
function bindEvent(element, type, handler) {
  element.addEventListener(type, handler);
  return disposable2(() => element.removeEventListener(type, handler));
}
function bindProperty(element, prop2, value) {
  if (!isSource(value)) {
    setByKey(element, prop2, value);
    return disposeNone2();
  }
  return reading(value, new Prop(element, prop2));
}
function bindStyle(element, block, adopted) {
  const style = element.style;
  const names = Object.keys(block);
  if (names.length === 0)
    return disposeNone2();
  const held = [];
  for (const name of names) {
    const value = block[name];
    if (!isSource(value)) {
      if (!adopted)
        setByKey(style, name, value ?? "");
      continue;
    }
    held.push(reading(value, new Styling(style, name)));
  }
  if (held.length === 0)
    return disposeNone2();
  return disposable2(() => disposeEach(held));
}
function bindAttribute(element, key, value, adopted) {
  if (!isSource(value)) {
    if (!adopted)
      setAttribute(element, key, value);
    return disposeNone2();
  }
  return reading(value, new Attr(element, key));
}
function bindLive(element, key, value, adopted) {
  if (!isSource(value)) {
    if (!adopted)
      writeLive(element, key, value);
    return disposeNone2();
  }
  return reading(value, new Live(element, key));
}
function applyProp(element, key, value, adopted = false) {
  const mark = key.charCodeAt(0);
  if (mark === ON_HEAD && key.startsWith(ON2)) {
    if (typeof value === "function") {
      return bindEvent(element, key.slice(ON2.length), value);
    }
    if (isSource(value)) {
      throw new TypeError(`${key} wants an event handler, found a stream`);
    }
  }
  if (mark === DOT) {
    return bindProperty(element, key.slice(1), value);
  }
  if (key === "style" && isBlock(value)) {
    return bindStyle(element, value, adopted);
  }
  if (LIVE.has(key) && key in element) {
    return bindLive(element, key, value, adopted);
  }
  return bindAttribute(element, key, value, adopted);
}

// node_modules/@algosail/plydom/dist/element.js
var NO_PROPS = Object.freeze({});
var NO_CHILDREN = Object.freeze([]);
var Elem = class extends MarkupView {
  name;
  ns;
  props;
  children;
  node = null;
  disposables = NO_DISPOSABLES;
  adopted = false;
  waiting = null;
  acts = null;
  constructor(name, ns, props2, children) {
    super();
    this.name = name;
    this.ns = ns;
    this.props = props2;
    this.children = children;
  }
  act(action) {
    const node = this.node;
    if (node === null) {
      const queued = this.acts ?? (this.acts = []);
      queued.push(action);
      return this;
    }
    const handle = action(node);
    if (handle !== NOTHING_TO_CLOSE) {
      if (this.disposables === NO_DISPOSABLES)
        this.disposables = [handle];
      else
        this.disposables.push(handle);
    }
    return this;
  }
  [MATERIALIZE](host, anchor) {
    if (this.node !== null)
      return this;
    const element = host.element(anchor, this.name, this.ns);
    const adopted = host.hydrating;
    const acted = runActs(this, element);
    const inner = host.descend(element);
    try {
      this.disposables = keptAfter(acted, buildElement(inner, element, this.props, this.children));
    } catch (err) {
      disposeEach(acted);
      throw err;
    } finally {
      inner.done();
    }
    this.adopted = adopted;
    this.node = element;
    this.props = NO_PROPS;
    this.children = NO_CHILDREN;
    nodeReady(this, element);
    return this;
  }
  [WHEN_NODE](f) {
    const had = this.node;
    if (had !== null) {
      f(had);
      return disposeNone2();
    }
    return waitForNode(this, f);
  }
  get [NODE]() {
    const had = this.node;
    return had !== null ? had : this[MATERIALIZE](buildHost(null), null).node;
  }
  [Symbol.dispose]() {
    if (this.node === null)
      return;
    disposeEach(this.disposables);
    this.disposables = NO_DISPOSABLES;
  }
};
function runActs(view, element) {
  let acted = null;
  try {
    while (view.acts !== null) {
      const queued = view.acts;
      view.acts = null;
      for (const action of queued) {
        acted = addDisposable(acted, action(element));
      }
    }
  } catch (err) {
    if (acted !== null)
      disposeEach(acted);
    view.acts = null;
    throw err;
  }
  return acted ?? NO_DISPOSABLES;
}
function keptAfter(acted, filled) {
  if (acted === NO_DISPOSABLES)
    return filled;
  if (filled === NO_DISPOSABLES)
    return acted;
  return acted.concat(filled);
}
function buildElement(host, element, props2, children) {
  let made = null;
  try {
    const adopted = host.hydrating;
    for (const name in props2) {
      made = addDisposable(made, applyProp(element, name, props2[name], adopted));
    }
    made = placeChildren(host, children, made);
    return made ?? NO_DISPOSABLES;
  } catch (err) {
    if (made !== null)
      disposeEach(made);
    throw err;
  }
}
function elementIn(ns) {
  return ((tag, props2 = NO_PROPS, children = NO_CHILDREN) => {
    const kids = children;
    return takeChildOutputs(new Elem(tag, ns, props2, kids), kids);
  });
}

// node_modules/@algosail/plydom/dist/keyed.js
var DuplicateKey = class extends Error {
};
var UNSEEN = [];
function keeping(keyFn, rows2) {
  const step = (prev, arr) => {
    const state2 = prev ?? { cache: /* @__PURE__ */ new Map(), views: [], from: UNSEEN, gen: 0 };
    if (arr === state2.from)
      return state2;
    const cache = state2.cache;
    const was = cache.size;
    const gen = state2.gen += 1;
    const shown = state2.views;
    let views = arr.length === shown.length ? null : [];
    let matched2 = 0;
    for (let i = 0; i < arr.length; i++) {
      const item = arr[i];
      const key = keyFn(item, i);
      let entry = cache.get(key);
      if (entry === void 0) {
        entry = rows2.build(item, key);
        cache.set(key, entry);
      } else if (entry.seen === gen) {
        throw new DuplicateKey(`two elements share the key ${String(key)}`);
      } else {
        matched2 += 1;
        rows2.renew(entry, item, key);
      }
      entry.seen = gen;
      const view = entry.view;
      if (views !== null)
        views.push(view);
      else if (view !== shown[i]) {
        views = shown.slice(0, i);
        views.push(view);
      }
    }
    if (matched2 < was) {
      for (const key of cache.keys()) {
        const entry = cache.get(key);
        if (entry.seen !== gen) {
          dispose2(entry.view);
          cache.delete(key);
        }
      }
    }
    state2.from = arr;
    if (views !== null)
      state2.views = views;
    return state2;
  };
  const sameArray = (a, b) => a === b;
  const viewsOf = (kept) => kept === null ? [] : kept.views;
  return (items) => skipRepeats(sameArray)(map(viewsOf)(scan(step, null)(items)));
}
function keyedOn(keyFn) {
  return (renderFn) => {
    return keeping(keyFn, {
      build: (item, key) => {
        const [value, post] = state(item);
        return {
          view: renderFn(value, key),
          last: item,
          seen: 0,
          post
        };
      },
      renew: (entry, item) => {
        if (entry.last === item)
          return;
        entry.last = item;
        entry.post(item);
      }
    });
  };
}

// node_modules/@algosail/plydom/dist/rows.js
var NO_NAMES = Object.freeze([]);
var bubblingTypeCache = /* @__PURE__ */ new Map();
var BUBBLING_EVENTS = /* @__PURE__ */ new Set([
  "click",
  "auxclick",
  "dblclick",
  "contextmenu",
  "mousedown",
  "mouseup",
  "mousemove",
  "mouseover",
  "mouseout",
  "wheel",
  "pointerdown",
  "pointerup",
  "pointermove",
  "pointerover",
  "pointerout",
  "pointercancel",
  "touchstart",
  "touchend",
  "touchmove",
  "touchcancel",
  "keydown",
  "keyup",
  "keypress",
  "beforeinput",
  "input",
  "change",
  "submit",
  "reset",
  "select",
  "focusin",
  "focusout",
  "copy",
  "cut",
  "paste",
  "dragstart",
  "drag",
  "dragenter",
  "dragover",
  "dragleave",
  "drop",
  "dragend",
  "animationstart",
  "animationend",
  "animationiteration",
  "transitionrun",
  "transitionstart",
  "transitionend",
  "transitioncancel"
]);
var HeldRowList = class extends Held {
  views;
  registry;
  constructor(views, registry) {
    super();
    this.views = views;
    this.registry = registry;
    this[ROUTES] = { [PROVIDERS]: [registry] };
  }
  use(spec) {
    return exposeList(this, spec);
  }
  output(given) {
    return setGiven(this, given);
  }
  run(sink2, scheduler = defaultScheduler2()) {
    return this.views.run(sink2, scheduler);
  }
};
var PlainRowList = class extends Plain {
  views;
  registry;
  constructor(views, registry) {
    super();
    this.views = views;
    this.registry = registry;
    this[ROUTES] = { [PROVIDERS]: [registry] };
  }
  use(spec) {
    return exposeList(this, spec);
  }
  output(given) {
    return setGiven(this, given);
  }
  run(sink2, scheduler = defaultScheduler2()) {
    return this.views.run(sink2, scheduler);
  }
};
var RowRegistry = class {
  liveOutputs = null;
  exposed = null;
  rowsBuilt = false;
  subscribe(names, sink2) {
    let held = null;
    for (const name of names) {
      if (this.exposed?.has(name))
        continue;
      (held ??= []).push(sink2.accept(name, this.channel(name).events));
    }
    return joinDisposables(held);
  }
  channel(sourceName) {
    const outputs = this.liveFor(sourceName);
    const had = outputs.byName.get(sourceName);
    if (had !== void 0)
      return had;
    if (this.rowsBuilt)
      throw askedTooLate(sourceName);
    return outputs.openChannel(sourceName);
  }
  liveFor(name) {
    const had = this.liveOutputs;
    if (had !== null)
      return had;
    if (this.rowsBuilt)
      throw askedTooLate(name);
    return this.liveOutputs = new LiveOutputs();
  }
  addRow(key, view) {
    this.rowsBuilt = true;
    const outputs = this.liveOutputs;
    return outputs === null ? view : outputs.add(key, view);
  }
};
var LiveOutputs = class {
  channels = [];
  byName = /* @__PURE__ */ new Map();
  sourceNames = NO_NAMES;
  rows = /* @__PURE__ */ new Set();
  keyByNode = /* @__PURE__ */ new WeakMap();
  markByNode = /* @__PURE__ */ new WeakMap();
  openChannel(sourceName) {
    const had = this.byName.get(sourceName);
    if (had !== void 0)
      return had;
    const made = new OutputChannel(this, sourceName, this.channels.length);
    this.channels.push(made);
    this.byName.set(sourceName, made);
    this.sourceNames = [...this.sourceNames, sourceName];
    const asked = [sourceName];
    for (const row of this.rows)
      row.askChildren(asked);
    return made;
  }
  add(key, view) {
    const row = new LiveRow(this, key, view);
    this.rows.add(row);
    row.untilNode = onNode(view, (node) => row.rememberNode(node));
    if (this.sourceNames.length > 0)
      row.askChildren(this.sourceNames);
    for (const channel of this.channels) {
      if (channel.emit !== null)
        channel.startRow(row);
    }
    return takeChildOutputs(wrapView(row, view), [view]);
  }
  hasMark(node, type, name) {
    const here = this.markByNode.get(node)?.[type];
    return here === name || Array.isArray(here) && here.includes(name);
  }
  addMark(node, type, name) {
    const had = this.markByNode.get(node);
    if (had === void 0) {
      this.markByNode.set(node, { [type]: name });
      return;
    }
    const was = had[type];
    had[type] = was === void 0 ? name : typeof was === "string" ? [was, name] : (was.push(name), was);
  }
};
var LiveRow = class {
  outputs;
  key;
  view;
  fromChildren = NOTHING_TO_CLOSE;
  feeds = null;
  listeners;
  node = null;
  untilNode = NOTHING_TO_CLOSE;
  constructor(outputs, key, view) {
    this.outputs = outputs;
    this.key = key;
    this.view = view;
    this.listeners = new Array(outputs.channels.length);
  }
  rememberNode(node) {
    this.node = node;
    this.outputs.keyByNode.set(node, this.key);
    for (const channel of this.outputs.channels)
      channel.onRowNode(this);
  }
  askChildren(names) {
    const heard = subscribeToProviders(this.view, names, this);
    if (heard === NOTHING_TO_CLOSE)
      return;
    this.fromChildren = this.fromChildren === NOTHING_TO_CLOSE ? heard : joinDisposables([this.fromChildren, heard]);
  }
  accept(name, source) {
    const channel = this.outputs.byName.get(name);
    if (channel === void 0)
      return NOTHING_TO_CLOSE;
    const feed = new RowFeed(this, channel, source);
    feed.next = this.feeds;
    this.feeds = feed;
    if (this.listeners[channel.index] !== void 0)
      feed.start();
    return feed;
  }
  drop(gone) {
    if (this.feeds === gone) {
      this.feeds = gone.next;
      return;
    }
    for (let one = this.feeds; one !== null; one = one.next) {
      if (one.next === gone) {
        one.next = gone.next;
        return;
      }
    }
  }
  [Symbol.dispose]() {
    dispose2(this.untilNode);
    dispose2(this.fromChildren);
    this.outputs.rows.delete(this);
    for (const channel of this.outputs.channels)
      channel.stopRow(this);
  }
};
var RowFeed = class {
  row;
  channel;
  source;
  reading = NOTHING_TO_CLOSE;
  next = null;
  constructor(row, channel, source) {
    this.row = row;
    this.channel = channel;
    this.source = source;
  }
  start() {
    if (this.reading === NOTHING_TO_CLOSE) {
      this.reading = this.source.run(this, defaultScheduler2());
    }
  }
  stop() {
    dispose2(this.reading);
    this.reading = NOTHING_TO_CLOSE;
  }
  event(_time, value) {
    this.channel.emit?.([this.row.key, value]);
  }
  end() {
  }
  [Symbol.dispose]() {
    this.stop();
    this.row.drop(this);
  }
};
var OutputChannel = class {
  outputs;
  sourceName;
  index;
  emit = null;
  events;
  constructor(outputs, sourceName, index2) {
    this.outputs = outputs;
    this.sourceName = sourceName;
    this.index = index2;
    this.events = multicast(stream((sink2, scheduler) => {
      this.emit = (said) => sink2.event(scheduler.currentTime(), said);
      for (const row of this.outputs.rows)
        this.startRow(row);
      return disposable2(() => {
        this.emit = null;
        for (const row of this.outputs.rows)
          this.stopRow(row);
      });
    }));
  }
  startRow(row) {
    if (row.listeners[this.index] !== void 0)
      return;
    row.listeners[this.index] = this.listenTo(row);
    for (let one = row.feeds; one !== null; one = one.next) {
      if (one.channel === this)
        one.start();
    }
  }
  stopRow(row) {
    const had = row.listeners[this.index];
    if (had === void 0)
      return;
    row.listeners[this.index] = void 0;
    dispose2(had);
    for (let one = row.feeds; one !== null; one = one.next) {
      if (one.channel === this)
        one.stop();
    }
  }
  listenTo(row) {
    const routes = routesOf(row.view)[this.sourceName];
    const types = bubblingTypes(routes);
    if (types === null || routes === void 0) {
      const source = outsOf(row.view)[this.sourceName];
      return source === void 0 ? NOTHING_TO_CLOSE : this.readSource(row, source);
    }
    return this.listenAtRoot(row, routes, types);
  }
  readSource(row, source) {
    return subscribe((_t, value) => this.emit?.([row.key, value]))(source);
  }
  listenAtRoot(row, routes, types) {
    const node = row.node;
    if (node === null)
      return NOTHING_TO_CLOSE;
    let watches = null;
    for (const route of routes) {
      if (route.view === null)
        continue;
      const waiting = onNode(route.view, (node2) => this.outputs.addMark(node2, route.type, this.sourceName));
      if (waiting !== NOTHING_TO_CLOSE)
        (watches ??= []).push(waiting);
    }
    for (const type of types)
      node.addEventListener(type, this);
    return new BubbleBinding(this, row, watches);
  }
  onRowNode(row) {
    const had = row.listeners[this.index];
    if (had === void 0)
      return;
    const routes = routesOf(row.view)[this.sourceName];
    const types = bubblingTypes(routes);
    if (types === null || routes === void 0)
      return;
    row.listeners[this.index] = this.listenAtRoot(row, routes, types);
  }
  handleEvent(event) {
    const emit = this.emit;
    if (emit === null)
      return;
    let node = event.target;
    let matched2 = false;
    while (node !== null) {
      if (!matched2)
        matched2 = this.outputs.hasMark(node, event.type, this.sourceName);
      const key = this.outputs.keyByNode.get(node);
      if (key !== void 0) {
        if (matched2 && node.parentNode !== null)
          emit([key, event]);
        return;
      }
      node = node.parentNode;
    }
  }
};
var BubbleBinding = class {
  channel;
  row;
  watches;
  constructor(channel, row, watches) {
    this.channel = channel;
    this.row = row;
    this.watches = watches;
  }
  [Symbol.dispose]() {
    if (this.watches !== null)
      disposeEach(this.watches);
    const channel = this.channel;
    const node = this.row.node;
    const types = bubblingTypes(routesOf(this.row.view)[channel.sourceName]) ?? NO_NAMES;
    for (const type of types)
      node.removeEventListener(type, channel);
  }
};
function exposeList(list, spec) {
  const registry = list.registry;
  const exposed = registry.exposed ?? (registry.exposed = /* @__PURE__ */ new Set());
  return applyUse(list, spec, (name, sourceName) => {
    exposed.add(name);
    return [registry.channel(sourceName).events, NO_EVENT_ROUTE];
  });
}
function askedTooLate(name) {
  return new AskedTooLate(`a list was asked for ${JSON.stringify(name)} after its rows were built`);
}
function bubblingTypes(routes) {
  if (routes === void 0)
    return null;
  if (routes.length === 1)
    return oneBubblingType(routes[0].type);
  const types = [];
  for (const route of routes) {
    if (!BUBBLING_EVENTS.has(route.type))
      return null;
    if (!types.includes(route.type))
      types.push(route.type);
  }
  return types.length === 0 ? null : types;
}
function oneBubblingType(type) {
  const known3 = bubblingTypeCache.get(type);
  if (known3 !== void 0)
    return known3;
  const made = BUBBLING_EVENTS.has(type) ? [type] : null;
  bubblingTypeCache.set(type, made);
  return made;
}
function listRows(keyOf, render2, items) {
  const registry = new RowRegistry();
  const views = keyedOn(keyOf)((entry, key) => registry.addRow(key, render2(entry, key)))(items);
  const shared2 = registry;
  return isHeld(items) ? new HeldRowList(views, shared2) : new PlainRowList(views, shared2);
}

// node_modules/@algosail/plydom/dist/read.js
var valueOf = (e) => e.target.value;
var prevented = (e) => (e.preventDefault(), e);
var fieldOf = (name) => (e) => {
  const field = e.target.querySelector(`[name="${name}"]`);
  return field === null ? "" : field.value ?? "";
};

// node_modules/@algosail/plydom/dist/use.js
function use(spec) {
  return (view) => view.use(spec);
}

// node_modules/@algosail/plydom/dist/mod.js
var SVG_NS = "http://www.w3.org/2000/svg";
var adopting = hydrateWith(mountChild);
var el = elementIn(null);
var svgEl = elementIn(SVG_NS);
function comment(data) {
  return lazyView((host, anchor) => ({
    node: host.comment(anchor, data),
    disposables: [],
    adopted: true
  }));
}
function when2(onTrue) {
  return branchOn((cond) => cond ? just(onTrue()) : nothing());
}
function rows(keyFn) {
  return (row) => ((items) => listRows(keyFn, row, items));
}
function component(setup) {
  return (props2) => new ComponentView(setup, props2);
}
var hydrate = adopting.hydrate;
var hydrateIn = adopting.hydrateIn;

// src/island.ts
var OPEN = "kit:";
var CLOSE = "/kit";
var NAME_TEXT = "(?:@[A-Za-z0-9_.-]+\\/)?[A-Za-z_$][A-Za-z0-9_$.-]*";
var NAME = new RegExp(`^${NAME_TEXT}$`);
var MARKER = new RegExp(`^kit:(${NAME_TEXT}) ([\\s\\S]*)$`);
var IN_MARKUP = new RegExp(`<!--kit:(${NAME_TEXT}) `, "g");
var known2 = /* @__PURE__ */ new Map();
var claimed = /* @__PURE__ */ new WeakSet();
var live = [];
var refuse = (said) => {
  throw new Error(said);
};
var declaredIn = /* @__PURE__ */ new Map();
var whyBadName = (name) => `island: ${JSON.stringify(name)} is not a name an island can have \u2014 either a bare name or a scoped one, \`@somebody/counter\`, and no spaces`;
var whyNowhere = (name) => `island: ${name} needs the module it was declared in. Pass import.meta.url.`;
var whyTaken = (name) => (already) => `island: two islands named ${name} \u2014 one in ${already.module}`;
var claiming = (name) => (module) => {
  forEach((already) => refuse(whyTaken(name)(already)))(
    fromNullable(declaredIn.get(name))
  );
  declaredIn.set(name, { name, module });
};
var isBlank = (module) => module === "";
var declaring = (name) => (module) => (isle) => {
  unless(test(NAME))((bad) => refuse(whyBadName(bad)))(name);
  when(isBlank)(() => refuse(whyNowhere(name)))(module);
  claiming(name)(module);
  known2.set(name, isle);
};
var escaped = pipe([
  replaceAll("<", "\\u003c"),
  replaceAll(">", "\\u003e")
]);
var asJson = (props2) => JSON.stringify(props2);
var encodeProps = pipe([asJson, escaped]);
var parsed = (said) => JSON.parse(said);
var decodeProps = pipe([
  encase(parsed),
  eitherToMaybe
]);
function island(name, setup, moduleUrl) {
  const build = component(
    setup
  );
  const place = (props2) => [
    comment(`${OPEN}${name} ${encodeProps(props2)}`),
    build(props2),
    comment(CLOSE)
  ];
  const self = Object.defineProperties(place, {
    tag: { value: "island", enumerable: true },
    rebuild: {
      value: (props2) => build(props2),
      enumerable: true
    }
  });
  declaring(name)(moduleUrl)(self);
  return self;
}
var used = pipe([
  pipe([firstCaptures(IN_MARKUP), justs]),
  nub
]);
var COMMENT_NODE2 = 8;
var isComment2 = (n) => n.nodeType === COMMENT_NODE2;
var dataIn = (marker) => marker.node.data;
var asMarker = (parent) => (child) => [
  { node: child, parent }
];
var under = (root) => ifElse(isComment2)(asMarker(root))(markers);
var markers = (root) => chain(under(root))(Array.from(root.childNodes));
var asStarted = (marker) => (name) => (props2) => ({
  marker,
  name,
  props: props2
});
var readIn = (marker) => (one) => chain(
  (name) => chain(
    (props2) => map(asStarted(marker)(name))(decodeProps(props2))
  )(one.groups[1])
)(one.groups[0]);
var groupsIn = (marker) => match(MARKER)(dataIn(marker));
var opened = (marker) => chain(readIn(marker))(groupsIn(marker));
var islandNamed = (name) => fromNullable(known2.get(name));
var asSlot = (start) => (close) => (isle) => ({
  island: isle,
  name: start.name,
  props: start.props,
  bracket: {
    parent: start.marker.parent,
    open: start.marker.node,
    close: close.node
  }
});
var slotFor = (close) => (start) => map(asSlot(start)(close))(islandNamed(start.name));
var asList = (one) => toArray(one);
var closing = (close) => pipe([chain(slotFor(close)), asList]);
var opens = { tag: "opens" };
var closes = { tag: "closes" };
var other = { tag: "other" };
var isOpen = (marker) => startsWith(OPEN)(dataIn(marker));
var isClose = (marker) => dataIn(marker) === CLOSE;
var closeOrPlain = (marker) => boolean(other)(closes)(isClose(marker));
var markOf = (marker) => boolean(closeOrPlain(marker))(opens)(isOpen(marker));
var nothingScanned = {
  depth: 0,
  start: nothing(),
  found: []
};
var isOutermost = (depth2) => depth2 === 1;
var isFresh = (marker) => !claimed.has(marker.node);
var startedAt = (marker) => chain(opened)(fromPredicate(isFresh)(marker));
var deeper = (acc) => (_) => ({
  ...acc,
  depth: acc.depth + 1
});
var starting = (acc) => (marker) => ({
  ...acc,
  depth: acc.depth + 1,
  start: startedAt(marker)
});
var opening = (acc) => (marker) => boolean(deeper(acc))(starting(acc))(
  isOutermost(acc.depth + 1)
)(marker);
var upFrom = (depth2) => Math.max(0, depth2 - 1);
var shallower = (acc) => (_) => ({
  ...acc,
  depth: upFrom(acc.depth)
});
var finishing = (acc) => (marker) => ({
  depth: 0,
  start: nothing(),
  found: concat(acc.found)(closing(marker)(acc.start))
});
var closingAt = (acc) => (marker) => boolean(shallower(acc))(finishing(acc))(
  upFrom(acc.depth) === 0
)(marker);
var staying = (acc) => (_) => acc;
var stepping = (acc, marker) => cases({
  opens: K(opening(acc)),
  closes: K(closingAt(acc)),
  other: K(staying(acc))
})(markOf(marker))(marker);
var slots = (root) => reduce(stepping)(nothingScanned)(markers(root)).found;
var built = (slot) => ({
  dsp: hydrateIn(slot.bracket)(() => slot.island.rebuild(slot.props)),
  open: slot.bracket.open
});
var sayFailed = (slot) => (thrown) => console.error(
  `[kit] island ${slot.name} did not come to life`,
  thrown
);
var pushing = (one) => void live.push(one);
var reviving = (slot) => {
  claimed.add(slot.bracket.open);
  either(sayFailed(slot))(pushing)(encase(built)(slot));
};
function hydrateIslands(root) {
  forEach(reviving)(slots(root));
  return root;
}
var takingDown = (one) => void dispose2(one.dsp);
var keeping2 = (rest) => {
  live.length = 0;
  live.push(...rest);
};
function resetIslands() {
  forEach(takingDown)(live);
  keeping2([]);
}
var isInside = (root) => (one) => one.open === root || root.contains(one.open);
function resetIslandsIn(root) {
  const [inside, elsewhere] = partition(isInside(root))(live);
  forEach(takingDown)(inside);
  keeping2(elsewhere);
}

// src/types.ts
var ROOT_ID = "kit-root";
var PART_HEADER = "kit-part";
var PART_ATTR = "data-kit-part";
var INTO_ATTR = "data-kit-into";
var MODE_ATTR = "data-kit-mode";
var PART_NAME = /^[A-Za-z0-9_-]{1,64}$/;
var PART_EVENT = "kit-part";
var LIVE_PATH = "/live";
var RELOAD_PATH = "/_kit-reload";
var RELOAD_EVENT = "kit-run";
var canListen = () => typeof document !== "undefined" && typeof EventSource !== "undefined";

export {
  not,
  complement,
  boolean,
  ifElse,
  isTrue,
  isFalse,
  map,
  reduce,
  reduce_,
  head,
  size,
  any,
  elem,
  forEach,
  add,
  sub,
  div,
  toLower,
  trim,
  gte,
  max,
  clamp,
  pair,
  fromTuple,
  lookup,
  fromPairs,
  filter,
  reject,
  filterMap,
  encase,
  either,
  just,
  nothing,
  maybe_,
  fromMaybe,
  fromMaybe_,
  defaultTo,
  fromNullable,
  fromPredicate,
  maybeEncase,
  isJust,
  isNothing,
  justs,
  test,
  equals,
  chain,
  I,
  K,
  once,
  pipe,
  lift2,
  fromIterable,
  alt,
  append,
  set,
  predicate,
  predicateNot,
  predicateAnd,
  predicateOr,
  anyPass,
  isNumber,
  isString,
  isStrMap,
  disposable2 as disposable,
  stream,
  subscribe,
  never2 as never,
  mergeArray,
  restart,
  skipRepeats,
  switchMap,
  multicast,
  hold,
  holdWith,
  bus,
  elementIn,
  valueOf,
  prevented,
  fieldOf,
  use,
  svgEl,
  comment,
  when2 as when,
  rows,
  island,
  hydrateIslands,
  resetIslands,
  resetIslandsIn,
  ROOT_ID,
  PART_HEADER,
  PART_ATTR,
  INTO_ATTR,
  MODE_ATTR,
  PART_NAME,
  PART_EVENT,
  LIVE_PATH,
  RELOAD_PATH,
  RELOAD_EVENT,
  canListen
};
