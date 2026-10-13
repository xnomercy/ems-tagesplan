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
    label: "Rudern einarmig mit Brustauflage",
    // aufrecht sitzend, Brust am Polster, Griff vorne auf Brusthöhe nach hinten ziehen
    parts: [[FR, [24, 76], [54, 76]], [FR, [39, 76], [39, 96]], [FR, [66, 32], [66, 66]], [FR, [66, 66], [66, 96]], [EQ, [108, 92], "h"], [EQ, "h1", "h2"],
      [FIG, "neck", "hip"], [FIG, "hip", "knee"], [FIG, "knee", "foot"], [FIG, "neck", "elbow"], [FIG, "elbow", "h"]],
    a: { head: [60, 28], neck: [57, 37], hip: [44, 72], knee: [62, 76], foot: [60, 96], elbow: [78, 44], h: [98, 46], h1: [98, 40], h2: [98, 52] },
    b: { head: [60, 28], neck: [57, 37], hip: [44, 72], knee: [62, 76], foot: [60, 96], elbow: [40, 44], h: [70, 46], h1: [70, 40], h2: [70, 52] },
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
  hyperext: {
    label: "Hyperextensions (45°)",
    parts: [[FR, [24, 96], [64, 58]], [FR, [56, 58], [70, 70]], [FR, [24, 96], [24, 86]],
      [FIG, "foot", "knee"], [FIG, "knee", "hip"], [FIG, "hip", "neck"], [FIG, "neck", "elbow"], [FIG, "elbow", "h"]],
    a: { foot: [30, 92], knee: [46, 77], hip: [62, 62], neck: [80, 84], head: [84, 92], elbow: [78, 74], h: [76, 80] },
    b: { foot: [30, 92], knee: [46, 77], hip: [62, 62], neck: [88, 38], head: [95, 32], elbow: [84, 48], h: [80, 42] },
  },
  rdl: {
    label: "Rumänisches Kreuzheben",
    parts: [[FIG, "foot", "knee"], [FIG, "knee", "hip"], [FIG, "hip", "neck"], [FIG, "neck", "elbow"], [FIG, "elbow", "h"], [EQ, "b1", "b2"]],
    a: { foot: [56, 96], knee: [56, 78], hip: [56, 58], neck: [58, 28], head: [60, 20], elbow: [58, 44], h: [58, 60], b1: [52, 60], b2: [64, 60] },
    b: { foot: [56, 96], knee: [54, 78], hip: [44, 58], neck: [80, 46], head: [88, 42], elbow: [80, 62], h: [80, 78], b1: [74, 78], b2: [86, 78] },
  },
  hip_thrust: {
    label: "Hip Thrust",
    parts: [[FR, [8, 62], [40, 62]], [FR, [14, 62], [14, 94]], [FR, [34, 62], [34, 94]],
      [FIG, "neck", "hip"], [FIG, "hip", "knee"], [FIG, "knee", "foot"], [FIG, "neck", "elbow"], [FIG, "elbow", "h"], [EQ, "b1", "b2"]],
    a: { head: [30, 54], neck: [38, 60], hip: [62, 84], knee: [82, 66], foot: [88, 96], elbow: [50, 76], h: [62, 78], b1: [62, 74], b2: [62, 82] },
    b: { head: [30, 54], neck: [38, 60], hip: [64, 60], knee: [86, 62], foot: [88, 96], elbow: [50, 64], h: [64, 54], b1: [64, 50], b2: [64, 58] },
  },
  face_pull: {
    label: "Face Pulls am Seil",
    parts: [[FR, [104, 2], [104, 96]], [EQ, [104, 24], "h"], [EQ, "h", "r1"],
      [FIG, "foot", "knee"], [FIG, "knee", "hip"], [FIG, "hip", "neck"], [FIG, "neck", "elbow"], [FIG, "elbow", "h"]],
    a: { foot: [52, 96], knee: [54, 78], hip: [52, 60], neck: [56, 30], head: [60, 22], elbow: [74, 30], h: [92, 28], r1: [92, 36] },
    b: { foot: [52, 96], knee: [54, 78], hip: [52, 60], neck: [56, 30], head: [60, 22], elbow: [48, 24], h: [70, 20], r1: [70, 28] },
  },
  reverse_fly: {
    label: "Reverse Butterfly",
    parts: [[FR, [36, 74], [84, 74]], [FR, [56, 30], [56, 66]], [FR, [64, 30], [64, 66]], [FIG, "neck", "hip"], [FIG, "hip", "lk"], [FIG, "hip", "rk"], [FIG, "lk", "lf"], [FIG, "rk", "rf"],
      [FIG, "ls", "rs"], [FIG, "ls", "le"], [FIG, "le", "lh"], [FIG, "rs", "re"], [FIG, "re", "rh"], [EQ, "lh", "lg"], [EQ, "rh", "rg"]],
    a: { ...latBase, le: [46, 46], lh: [54, 44], re: [74, 46], rh: [66, 44], lg: [54, 52], rg: [66, 52] },
    b: { ...latBase, le: [32, 42], lh: [14, 42], re: [88, 42], rh: [106, 42], lg: [14, 50], rg: [106, 50] },
  },
  dead_bug: {
    label: "Dead Bug",
    parts: [[FR, [4, 92], [116, 92]], [FIG, "neck", "hip"], [FIG, "hip", "k1"], [FIG, "k1", "f1"], [FIG, "hip", "k2"], [FIG, "k2", "f2"],
      [FIG, "neck", "e1"], [FIG, "e1", "h1"], [FIG, "neck", "e2"], [FIG, "e2", "h2"]],
    a: { head: [18, 82], neck: [28, 84], hip: [64, 84], k1: [72, 62], f1: [88, 62], k2: [70, 64], f2: [86, 64], e1: [30, 66], h1: [30, 50], e2: [34, 66], h2: [34, 50] },
    b: { head: [18, 82], neck: [28, 84], hip: [64, 84], k1: [72, 62], f1: [88, 62], k2: [86, 80], f2: [108, 86], e1: [30, 66], h1: [30, 50], e2: [18, 70], h2: [6, 74] },
  },
  side_plank: {
    label: "Seitstütz",
    parts: [[FR, [4, 94], [116, 94]], [FIG, "foot", "hip"], [FIG, "hip", "neck"], [FIG, "neck", "elbow"], [FIG, "elbow", "h"], [FIG, "neck", "e2"], [FIG, "e2", "h2"]],
    a: { foot: [106, 92], hip: [66, 82], neck: [30, 60], head: [22, 54], elbow: [32, 92], h: [46, 92], e2: [40, 70], h2: [52, 78] },
    b: { foot: [106, 92], hip: [66, 72], neck: [30, 58], head: [22, 52], elbow: [32, 92], h: [46, 92], e2: [42, 66], h2: [56, 70] },
  },
  plank: {
    label: "Unterarmstütz (Plank)",
    // Körper bleibt eine Linie, die Hüfte pendelt nur leicht
    parts: [[FR, [4, 94], [116, 94]], [FIG, "foot", "knee"], [FIG, "knee", "hip"], [FIG, "hip", "neck"], [FIG, "neck", "elbow"], [FIG, "elbow", "h"]],
    a: { head: [20, 66], neck: [30, 72], hip: [68, 78], knee: [88, 84], foot: [108, 91], elbow: [30, 92], h: [46, 92] },
    b: { head: [20, 65], neck: [30, 71], hip: [68, 75], knee: [88, 83], foot: [108, 91], elbow: [30, 92], h: [46, 92] },
  },
  situp: {
    label: "Sit-ups",
    parts: [[FR, [4, 94], [116, 94]], [FIG, "neck", "hip"], [FIG, "hip", "knee"], [FIG, "knee", "foot"], [FIG, "neck", "elbow"], [FIG, "elbow", "h"]],
    a: { head: [16, 84], neck: [26, 86], hip: [62, 88], knee: [80, 64], foot: [98, 90], elbow: [38, 77], h: [30, 81] },
    b: { head: [50, 46], neck: [50, 56], hip: [62, 88], knee: [80, 64], foot: [98, 90], elbow: [64, 64], h: [56, 60] },
  },
  pallof: {
    label: "Pallof Press",
    parts: [[FR, [8, 2], [8, 96]], [EQ, [8, 40], "h"],
      [FIG, "foot", "knee"], [FIG, "knee", "hip"], [FIG, "hip", "f2"], [FIG, "hip", "neck"], [FIG, "neck", "elbow"], [FIG, "elbow", "h"]],
    a: { foot: [52, 96], knee: [54, 78], f2: [66, 96], hip: [58, 60], neck: [58, 30], head: [60, 22], elbow: [56, 48], h: [64, 40] },
    b: { foot: [52, 96], knee: [54, 78], f2: [66, 96], hip: [58, 60], neck: [58, 30], head: [60, 22], elbow: [72, 38], h: [88, 38] },
  },
  treadmill: {
    label: "Laufband bergauf",
    parts: [[FR, [16, 94], [100, 82]], [FR, [98, 82], [102, 38]], [FR, [86, 46], [102, 38]],
      [FIG, "hip", "neck"], [FIG, "hip", "k1"], [FIG, "k1", "f1"], [FIG, "hip", "k2"], [FIG, "k2", "f2"], [FIG, "neck", "e1"], [FIG, "e1", "h1"], [FIG, "neck", "e2"], [FIG, "e2", "h2"]],
    a: { head: [62, 20], neck: [58, 28], hip: [54, 56], k1: [62, 70], f1: [70, 86], k2: [48, 72], f2: [38, 90], e1: [62, 44], h1: [70, 52], e2: [52, 44], h2: [46, 54] },
    b: { head: [62, 20], neck: [58, 28], hip: [54, 56], k1: [48, 72], f1: [38, 90], k2: [62, 70], f2: [70, 86], e1: [52, 44], h1: [46, 54], e2: [62, 44], h2: [70, 52] },
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
