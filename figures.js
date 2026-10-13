// Kleine animierte Strichfiguren für die Übungen. Jede Figur hat zwei Posen (Start und Ende),
// zwischen denen Gelenke und Geräteteile hin- und herlaufen. Rein SVG, keine Bilder von außen.
// Ein Punkt ist entweder ein Gelenkname (bewegt sich) oder eine feste Koordinate [x, y].

const FIG = "fig";   // Körper
const EQ = "eq";     // bewegtes Gerät (Stange, Griff, Seil)
const FR = "frame";  // festes Gerät (Bank, Polster, Turm)

// Front: Latziehen breit / eng
const latLegs = [[FR, [36, 74], [84, 74]], [FR, [40, 62], [80, 62]], [FIG, "neck", "hip"], [FIG, "hip", "lk"], [FIG, "hip", "rk"], [FIG, "lk", "lf"], [FIG, "rk", "rf"],
  [FIG, "ls", "rs"], [FIG, "ls", "le"], [FIG, "le", "lh"], [FIG, "rs", "re"], [FIG, "re", "rh"]];
const latBase = { head: [60, 28], neck: [60, 37], hip: [60, 70], lk: [49, 70], rk: [71, 70], lf: [49, 94], rf: [71, 94], ls: [51, 40], rs: [69, 40] };

export const PATTERNS = {
  lat_wide: {
    label: "Latziehen breit",
    parts: [[FR, [60, 0], "bc"], ...latLegs, [EQ, "bl", "br"]],
    a: { ...latBase, le: [38, 24], lh: [28, 9], re: [82, 24], rh: [92, 9], bl: [18, 9], br: [102, 9], bc: [60, 9] },
    b: { ...latBase, le: [33, 50], lh: [36, 35], re: [87, 50], rh: [84, 35], bl: [24, 35], br: [96, 35], bc: [60, 35] },
  },
  lat_close: {
    label: "Latziehen eng",
    parts: [[FR, [60, 0], "g"], ...latLegs, [EQ, "lh", "g"], [EQ, "rh", "g"]],
    a: { ...latBase, le: [50, 24], lh: [55, 10], re: [70, 24], rh: [65, 10], g: [60, 4] },
    b: { ...latBase, le: [44, 58], lh: [55, 42], re: [76, 58], rh: [65, 42], g: [60, 36] },
  },
  row_incline: {
    label: "Rudern schräg (Brust aufgelegt)",
    parts: [[FR, [36, 84], [84, 50]], [FR, [56, 70], [56, 96]], [EQ, [106, 94], "h"], [EQ, "h1", "h2"],
      [FIG, "neck", "hip"], [FIG, "hip", "knee"], [FIG, "knee", "foot"], [FIG, "neck", "elbow"], [FIG, "elbow", "h"]],
    a: { head: [86, 38], neck: [78, 45], hip: [42, 70], knee: [40, 88], foot: [28, 96], elbow: [82, 62], h: [84, 80], h1: [80, 80], h2: [88, 80] },
    b: { head: [86, 38], neck: [78, 45], hip: [42, 70], knee: [40, 88], foot: [28, 96], elbow: [62, 44], h: [76, 62], h1: [72, 62], h2: [80, 62] },
  },
  row_single: {
    label: "Einarmig ziehen sitzend",
    parts: [[FR, [26, 76], [56, 76]], [FR, [41, 76], [41, 96]], [FR, [72, 40], [72, 66]], [EQ, [108, 34], "h"], [EQ, "h1", "h2"],
      [FIG, "neck", "hip"], [FIG, "hip", "knee"], [FIG, "knee", "foot"], [FIG, "neck", "elbow"], [FIG, "elbow", "h"]],
    a: { head: [52, 28], neck: [50, 37], hip: [44, 72], knee: [64, 72], foot: [64, 94], elbow: [64, 24], h: [80, 12], h1: [80, 6], h2: [80, 18] },
    b: { head: [52, 28], neck: [50, 37], hip: [44, 72], knee: [64, 72], foot: [64, 94], elbow: [38, 54], h: [56, 46], h1: [56, 40], h2: [56, 52] },
  },
  pushdown: {
    label: "Trizeps am Seil nach unten",
    parts: [[FR, [100, 2], [100, 96]], [EQ, [100, 8], "h"], [EQ, "h", "r1"], [EQ, "h", "r2"],
      [FIG, "neck", "hip"], [FIG, "hip", "knee"], [FIG, "knee", "foot"], [FIG, "neck", "elbow"], [FIG, "elbow", "h"]],
    a: { head: [56, 20], neck: [54, 29], hip: [50, 60], knee: [52, 78], foot: [48, 96], elbow: [56, 50], h: [70, 36], r1: [67, 42], r2: [73, 42] },
    b: { head: [56, 20], neck: [54, 29], hip: [50, 60], knee: [52, 78], foot: [48, 96], elbow: [56, 50], h: [62, 70], r1: [58, 76], r2: [66, 76] },
  },
  overhead_ext: {
    label: "Trizeps am Seil nach vorne",
    parts: [[FR, [8, 2], [8, 96]], [EQ, [8, 16], "h"],
      [FIG, "neck", "hip"], [FIG, "hip", "knee"], [FIG, "knee", "foot"], [FIG, "hip", "foot2"], [FIG, "neck", "elbow"], [FIG, "elbow", "h"]],
    a: { head: [72, 28], neck: [64, 35], hip: [48, 62], knee: [64, 78], foot: [68, 96], foot2: [34, 96], elbow: [74, 24], h: [60, 16] },
    b: { head: [72, 28], neck: [64, 35], hip: [48, 62], knee: [64, 78], foot: [68, 96], foot2: [34, 96], elbow: [74, 24], h: [98, 18] },
  },
  skullcrusher: {
    label: "SZ-Stirndrücken",
    parts: [[FR, [22, 70], [98, 70]], [FR, [30, 70], [30, 92]], [FR, [90, 70], [90, 92]],
      [FIG, "neck", "hip"], [FIG, "hip", "knee"], [FIG, "knee", "foot"], [FIG, "neck", "elbow"], [FIG, "elbow", "h"], [EQ, "b1", "b2"]],
    a: { head: [94, 60], neck: [84, 64], hip: [46, 64], knee: [30, 54], foot: [20, 94], elbow: [80, 36], h: [80, 10], b1: [74, 10], b2: [86, 10] },
    b: { head: [94, 60], neck: [84, 64], hip: [46, 64], knee: [30, 54], foot: [20, 94], elbow: [80, 36], h: [100, 46], b1: [100, 40], b2: [100, 52] },
  },
  curl: {
    label: "Bizeps-Curl",
    parts: [[FIG, "neck", "hip"], [FIG, "hip", "knee"], [FIG, "knee", "foot"], [FIG, "neck", "elbow"], [FIG, "elbow", "h"], [EQ, "b1", "b2"]],
    a: { head: [58, 18], neck: [56, 27], hip: [54, 60], knee: [56, 78], foot: [54, 96], elbow: [58, 48], h: [64, 68], b1: [58, 68], b2: [72, 68] },
    b: { head: [58, 18], neck: [56, 27], hip: [54, 60], knee: [56, 78], foot: [54, 96], elbow: [58, 48], h: [68, 30], b1: [62, 30], b2: [76, 30] },
  },
  bench: {
    label: "Bankdrücken",
    parts: [[FR, [22, 70], [98, 70]], [FR, [30, 70], [30, 92]], [FR, [90, 70], [90, 92]],
      [FIG, "neck", "hip"], [FIG, "hip", "knee"], [FIG, "knee", "foot"], [FIG, "neck", "elbow"], [FIG, "elbow", "h"], [EQ, "b1", "b2"]],
    a: { head: [94, 60], neck: [84, 64], hip: [46, 64], knee: [30, 54], foot: [20, 94], elbow: [78, 40], h: [76, 14], b1: [76, 8], b2: [76, 20] },
    b: { head: [94, 60], neck: [84, 64], hip: [46, 64], knee: [30, 54], foot: [20, 94], elbow: [64, 66], h: [74, 50], b1: [74, 44], b2: [74, 56] },
  },
  generic: {
    label: "Sonstige Übung",
    parts: [[FIG, "neck", "hip"], [FIG, "hip", "knee"], [FIG, "knee", "foot"], [FIG, "hip", "k2"], [FIG, "k2", "f2"], [FIG, "neck", "elbow"], [FIG, "elbow", "h"], [EQ, "b1", "b2"]],
    a: { head: [60, 18], neck: [60, 27], hip: [60, 58], knee: [52, 76], foot: [50, 96], k2: [68, 76], f2: [70, 96], elbow: [70, 40], h: [76, 52], b1: [70, 52], b2: [82, 52] },
    b: { head: [60, 18], neck: [60, 27], hip: [60, 58], knee: [52, 76], foot: [50, 96], k2: [68, 76], f2: [70, 96], elbow: [72, 30], h: [74, 8], b1: [68, 8], b2: [80, 8] },
  },
};

const SPLINE = 'calcMode="spline" keyTimes="0;0.5;1" keySplines=".45 0 .55 1;.45 0 .55 1"';

// SVG für ein Muster; animate=false zeigt nur die Endpose
export function figureSvg(pattern, { size = 96, animate = true } = {}) {
  const p = PATTERNS[pattern] ?? PATTERNS.generic;
  const still = !animate || (typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches);
  const pt = (ref, pose) => (Array.isArray(ref) ? ref : p[pose][ref]);
  const anim = (attr, ref, idx) => {
    if (Array.isArray(ref)) return "";
    const a = p.a[ref][idx], b = p.b[ref][idx];
    if (a === b) return "";
    return `<animate attributeName="${attr}" values="${a};${b};${a}" dur="2.6s" repeatCount="indefinite" ${SPLINE}/>`;
  };
  const pose = still ? "b" : "a";
  const lines = p.parts.map(([kind, from, to]) => {
    const f = pt(from, pose), tt = pt(to, pose);
    const kids = still ? "" : anim("x1", from, 0) + anim("y1", from, 1) + anim("x2", to, 0) + anim("y2", to, 1);
    return `<line class="${kind}" x1="${f[0]}" y1="${f[1]}" x2="${tt[0]}" y2="${tt[1]}">${kids}</line>`;
  }).join("");
  const h = p[pose].head;
  const head = `<circle class="head" cx="${h[0]}" cy="${h[1]}" r="7">${still ? "" : anim("cx", "head", 0) + anim("cy", "head", 1)}</circle>`;
  return `<svg class="figure" viewBox="0 0 120 100" width="${size}" height="${Math.round(size * 100 / 120)}" style="width:${size}px;height:${Math.round(size * 100 / 120)}px" aria-hidden="true">${lines}${head}</svg>`;
}
