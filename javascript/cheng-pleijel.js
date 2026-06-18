/*
  Cheng-Pleijel Java Applet -> JavaScript/HTML5 Canvas port.

  This is a practical browser port of the uploaded Java subset:
  - Element.java
  - PointElement.java
  - LineElement.java
  - LineSlider.java
  - ChengPleijel.java
  - the drawing/dragging behavior from Slate.java / ChengPleijelCanvas.java

  It intentionally keeps Java-like names where that makes comparison easier.
*/

const COLORS = {
  black: '#000000', blue: '#0000ff', cyan: '#00ffff', darkGray: '#404040',
  gray: '#808080', green: '#008000', lightGray: '#d3d3d3', magenta: '#ff00ff',
  orange: '#ffa500', pink: '#ffc0cb', red: '#ff0000', white: '#ffffff', yellow: '#ffff00',
  background: '#ffffff', brighter: '#ffffff', darker: '#cccccc', none: null
};

function parseColor(value, fallback = null) {
  if (!value) return fallback;
  const s = value.trim();
  if (s in COLORS) return COLORS[s];
  if (/^#[0-9a-f]{6}$/i.test(s)) return s;
  const parts = s.split(',').map(Number);
  if (parts.length === 3 && parts.every(Number.isFinite)) {
    // Original Java interpreted triples as HSB: hue 0..360, sat 0..100, bright 0..100.
    return hsbToHex(parts[0] / 360, parts[1] / 100, parts[2] / 100);
  }
  return fallback;
}

function hsbToHex(h, s, v) {
  const i = Math.floor(h * 6);
  const f = h * 6 - i;
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);
  let r, g, b;
  switch (i % 6) {
    case 0: [r, g, b] = [v, t, p]; break;
    case 1: [r, g, b] = [q, v, p]; break;
    case 2: [r, g, b] = [p, v, t]; break;
    case 3: [r, g, b] = [p, q, v]; break;
    case 4: [r, g, b] = [t, p, v]; break;
    default: [r, g, b] = [v, p, q]; break;
  }
  const toHex = x => Math.round(x * 255).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

class Element {
  constructor() {
    this.name = null;
    this.nameColor = null;
    this.vertexColor = null;
    this.edgeColor = null;
    this.faceColor = null;
    this.dragable = false;
    this.dimension = -1;
  }
  setName(s) { this.name = s; }
  setNameColor(c) { this.nameColor = c; }
  setVertexColor(c) { this.vertexColor = c; }
  setEdgeColor(c) { this.edgeColor = c; }
  setFaceColor(c) { this.faceColor = c; }
  inClass(className) {
    if (className === 'Element') return true;
    let proto = this;
    while (proto) {
      if (proto.constructor && proto.constructor.name === className) return true;
      proto = Object.getPrototypeOf(proto);
    }
    return false;
  }
  reset() { this.update(); }
  update() {}
  translate(_dx, _dy) {}
  drag(_x, _y) {}
  rotate(_pivot, _ac, _as) {}
  defined() { return false; }
  drawName(_ctx) {}
  drawFace(_ctx) {}
  drawEdge(_ctx) {}
  drawVertex(_ctx) {}
}

class PointElement extends Element {
  constructor(x = NaN, y = NaN) {
    super();
    this.dimension = 0;
    this.x = x;
    this.y = y;
  }
  distance(B, By) {
    const bx = B instanceof PointElement ? B.x : B;
    const by = B instanceof PointElement ? B.y : By;
    return Math.hypot(bx - this.x, by - this.y);
  }
  distance2(B, By) {
    const bx = B instanceof PointElement ? B.x : B;
    const by = B instanceof PointElement ? B.y : By;
    return (bx - this.x) ** 2 + (by - this.y) ** 2;
  }
  angle(B, C) {
    const u = B.x - this.x, v = B.y - this.y;
    const s = C.x - this.x, t = C.y - this.y;
    return Math.atan2(u * t - v * s, u * s + v * t);
  }
  hessxx(A, B, H, K, O) {
    const denBase = A.distance2(B) * H.distance2(K);
    const cross = (O.x - A.x) * (B.y - A.y) - (O.y - A.y) * (B.x - A.x);
    return ((B.y - A.y) ** 2 * denBase) / ((denBase + cross ** 2) ** 1.5);
  }
  hessxy(A, B, H, K, O) {
    const denBase = A.distance2(B) * H.distance2(K);
    const cross = (O.x - A.x) * (B.y - A.y) - (O.y - A.y) * (B.x - A.x);
    return (-(B.x - A.x) * (B.y - A.y) * denBase) / ((denBase + cross ** 2) ** 1.5);
  }
  hessyy(A, B, H, K, O) {
    const denBase = A.distance2(B) * H.distance2(K);
    const cross = (O.x - A.x) * (B.y - A.y) - (O.y - A.y) * (B.x - A.x);
    return ((B.x - A.x) ** 2 * denBase) / ((denBase + cross ** 2) ** 1.5);
  }
  gradientx(A, B, H, K, O) {
    const cross = (O.x - A.x) * (B.y - A.y) - (O.y - A.y) * (B.x - A.x);
    const den = Math.sqrt(A.distance2(B) * H.distance2(K) + cross ** 2);
    return cross * (B.y - A.y) / den;
  }
  gradienty(A, B, H, K, O) {
    const cross = (O.x - A.x) * (B.y - A.y) - (O.y - A.y) * (B.x - A.x);
    const den = Math.sqrt(A.distance2(B) * H.distance2(K) + cross ** 2);
    return cross * (A.x - B.x) / den;
  }
  total(fn, A, B, C, D, H, K, O) {
    return this[fn](A, B, H, K, O) + this[fn](B, C, H, K, O) + this[fn](C, D, H, K, O) + this[fn](D, A, H, K, O);
  }
  toFoot(A, B, C) {
    const fmd = B.y - C.y;
    const emc = B.x - C.x;
    const d0 = C.x * fmd - C.y * emc;
    const d1 = A.x * emc + A.y * fmd;
    const den = fmd * fmd + emc * emc;
    this.x = (d0 * fmd + d1 * emc) / den;
    this.y = (d1 * fmd - d0 * emc) / den;
  }
  translate(dx, dy) { this.x += dx; this.y += dy; }
  rotate(pivot, ac, as) {
    const dx = this.x - pivot.x;
    const dy = this.y - pivot.y;
    this.x = pivot.x + ac * dx - as * dy;
    this.y = pivot.y + as * dx + ac * dy;
  }
  defined() { return Number.isFinite(this.x) && Number.isFinite(this.y); }
  drawName(ctx) {
    if (this.nameColor && this.name && this.defined()) {
      ctx.fillStyle = this.nameColor;
      ctx.font = 'italic 18px Courier, monospace';
      ctx.fillText(this.name, Math.round(this.x), Math.round(this.y) - 4);
    }
  }
  drawVertex(ctx) {
    if (this.vertexColor && this.defined()) {
      ctx.fillStyle = this.vertexColor;
      ctx.beginPath();
      ctx.arc(Math.round(this.x), Math.round(this.y), 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

class FreePoint extends PointElement {
  constructor(x, y) {
    super(x, y);
    this.initx = x;
    this.inity = y;
    this.dragable = true;
  }
  reset() { this.x = this.initx; this.y = this.inity; }
  drag(tox, toy) { this.x = tox; this.y = toy; }
}

class LineElement extends Element {
  constructor(A, B) {
    super();
    this.dimension = 1;
    this.A = A;
    this.B = B;
  }
  length() { return this.A.distance(this.B); }
  length2() { return this.A.distance2(this.B); }
  defined() { return this.A.defined() && this.B.defined(); }
  drawName(ctx) {
    if (this.nameColor && this.name && this.defined()) {
      ctx.fillStyle = this.nameColor;
      ctx.font = 'italic 18px Courier, monospace';
      ctx.fillText(this.name, (this.A.x + this.B.x) / 2, (this.A.y + this.B.y) / 2 - 8);
    }
  }
  drawVertex(ctx) {
    if (this.vertexColor && this.defined()) {
      for (const p of [this.A, this.B]) {
        ctx.fillStyle = this.vertexColor;
        ctx.beginPath();
        ctx.arc(Math.round(p.x), Math.round(p.y), 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  drawEdge(ctx) {
    if (this.edgeColor && this.defined()) {
      ctx.strokeStyle = this.edgeColor;
      ctx.beginPath();
      ctx.moveTo(Math.round(this.A.x), Math.round(this.A.y));
      ctx.lineTo(Math.round(this.B.x), Math.round(this.B.y));
      ctx.stroke();
    }
  }
}

class LineSlider extends PointElement {
  constructor(A, B, x, y) {
    super(x, y);
    this.dimension = 0;
    this.dragable = true;
    this.A = A;
    this.B = B;
    this.initx = x;
    this.inity = y;
    this.toFoot(this, this.A, this.B);
  }
  reset() { this.x = this.initx; this.y = this.inity; this.toFoot(this, this.A, this.B); }
  update() {
    if (!this.defined()) { this.x = this.initx; this.y = this.inity; }
    this.toFoot(this, this.A, this.B);
  }
  drag(tox, toy) { this.x = tox; this.y = toy; this.toFoot(this, this.A, this.B); }
}

class ChengPleijel extends PointElement {
  constructor(P, Q, R, S, H, K, O) {
    super();
    this.P = P; this.Q = Q; this.R = R; this.S = S; this.H = H; this.K = K; this.O = O;
  }
  update() {
    const { P, Q, R, S, H, K, O } = this;
    let oldx = Number.MAX_VALUE;
    let oldy = Number.MAX_VALUE;
    let guard = 0;
    while (H.distance(K) > 0 && O.distance(oldx, oldy) > 0.01 && guard++ < 100) {
      oldx = O.x;
      oldy = O.y;
      const hxx = this.total('hessxx', P, Q, R, S, H, K, O);
      const hxy = this.total('hessxy', P, Q, R, S, H, K, O);
      const hyy = this.total('hessyy', P, Q, R, S, H, K, O);
      const gx = this.total('gradientx', P, Q, R, S, H, K, O);
      const gy = this.total('gradienty', P, Q, R, S, H, K, O);
      const det = hxx * hyy - hxy * hxy;
      if (!Number.isFinite(det) || Math.abs(det) < 1e-12) break;
      const newx = hyy * gx - hxy * gy;
      const newy = -hxy * gx + hxx * gy;
      O.x -= newx / det;
      O.y -= newy / det;
    }
    this.x = O.x;
    this.y = O.y;
  }
}

class Slate {
  constructor(canvas, metricsEl) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.metricsEl = metricsEl;
    this.scale = 50;
    this.elements = [];
    this.preexists = [];
    this.pivot = null;
    this.pick = null;
    this.clear = true;
    this.initialData = '';
    this.installEvents();
  }
  lookupElement(name) { return this.elements.find(e => e.name === name) || null; }
  addElement(e, name, preexists = false) {
    if (this.lookupElement(name)) throw new Error(`Duplicate element name: ${name}`);
    e.setName(name);
    this.elements.push(e);
    this.preexists.push(preexists);
    return e;
  }
  constructElement(name, elementClass, construction, data) {
    const tokens = data.split(',').map(x => x.trim()).filter(Boolean);
    const byName = n => {
      const e = this.lookupElement(n);
      if (!e) throw new Error(`Unknown element: ${n}`);
      return e;
    };
    if (elementClass === 'point' && construction === 'free') {
      return this.addElement(new FreePoint(Number(tokens[0]), Number(tokens[1])), name);
    }
    if (elementClass === 'line' && construction === 'connect') {
      return this.addElement(new LineElement(byName(tokens[0]), byName(tokens[1])), name);
    }
    if (elementClass === 'point' && construction === 'lineSlider') {
      if (tokens.length === 3) {
        const line = byName(tokens[0]);
        return this.addElement(new LineSlider(line.A, line.B, Number(tokens[1]), Number(tokens[2])), name);
      }
      return this.addElement(new LineSlider(byName(tokens[0]), byName(tokens[1]), Number(tokens[2]), Number(tokens[3])), name);
    }
    if (elementClass === 'point' && construction === 'chengpleijel') {
      return this.addElement(new ChengPleijel(...tokens.map(byName)), name);
    }
    throw new Error(`Unsupported construction in this starter port: ${elementClass};${construction};${data}`);
  }
  parseElement(line) {
    const parts = line.split(';').map(s => s.trim());
    if (parts.length < 4 || parts[0].startsWith('#')) return;
    const [name, elementClass, construction, data, nameColor, vertexColor, edgeColor, faceColor] = parts;
    const e = this.constructElement(name, elementClass, construction, data);
    e.setNameColor(parseColor(nameColor, e instanceof PointElement ? '#000000' : null));
    e.setVertexColor(parseColor(vertexColor, e.dimension === 0 ? (e.dragable ? '#ff0000' : '#000000') : null));
    e.setEdgeColor(parseColor(edgeColor, e.dimension > 0 ? '#000000' : null));
    e.setFaceColor(parseColor(faceColor, e.dimension === 2 ? '#ffffff' : null));
  }
  load(text) {
    this.elements = [];
    this.preexists = [];
    this.pick = null;
    const errors = [];
    for (const line of text.split(/\r?\n/)) {
      if (!line.trim() || line.trim().startsWith('#')) continue;
      try { this.parseElement(line); } catch (err) { errors.push(`${line}\n  ${err.message}`); }
    }
    this.computeCoordinates();
    this.repaint();
    if (errors.length) console.warn(errors.join('\n'));
  }
  computeCoordinates() { for (const e of this.elements) e.update(); }
  translateCoordinates(dx, dy) { this.elements.forEach((e, i) => { if (!this.preexists[i]) e.translate(dx, dy); }); }
  rotateCoordinates(ac, as) { if (this.pivot) this.elements.forEach((e, i) => { if (!this.preexists[i]) e.rotate(this.pivot, ac, as); }); }
  gridToMath(p) { return { x: p.x / this.scale - 7, y: -p.y / this.scale + 4 }; }
  metricText() {
    const pts = ['A', 'B', 'C', 'D'].map(name => this.lookupElement(name)).filter(Boolean);
    const O = this.lookupElement('O');
    const htLine = this.lookupElement('h') || this.elements[9];
    if (pts.length < 4) return '';
    const [A, B, C, D] = pts;
    const fmt = n => Number.isFinite(n) ? n.toFixed(2) : 'NaN';
    const fmt4 = n => Number.isFinite(n) ? n.toFixed(4) : 'NaN';
    const mp = p => this.gridToMath(p);
    const mA = mp(A), mB = mp(B), mC = mp(C), mD = mp(D), mO = O ? mp(O) : {x: NaN, y: NaN};
    const height = htLine instanceof LineElement ? htLine.length() / this.scale : NaN;
    return `VERTICES\nA: x=${fmt(mA.x)} y=${fmt(mA.y)}\nB: x=${fmt(mB.x)} y=${fmt(mB.y)}\nC: x=${fmt(mC.x)} y=${fmt(mC.y)}\nD: x=${fmt(mD.x)} y=${fmt(mD.y)}\n\nEDGES\nAB: ${fmt(A.distance(B)/this.scale)}\nBC: ${fmt(B.distance(C)/this.scale)}\nCD: ${fmt(C.distance(D)/this.scale)}\nDA: ${fmt(D.distance(A)/this.scale)}\n\nHEIGHT = ${fmt(height)}\nXO = ${fmt4(mO.x)}\nYO = ${fmt4(mO.y)}`;
  }
  repaint() {
    const ctx = this.ctx, canvas = this.canvas;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#008000'; ctx.lineWidth = 1;
    for (let y = this.scale; y <= canvas.height; y += this.scale) line(ctx, 150, y, canvas.width, y);
    for (let x = 150; x <= canvas.width; x += this.scale) line(ctx, x, 0, x, canvas.height);
    ctx.strokeStyle = '#ff0000';
    line(ctx, 150, canvas.height / 2, canvas.width, canvas.height / 2);
    line(ctx, (canvas.width - 150) / 2 + 150, 0, (canvas.width - 150) / 2 + 150, canvas.height);
    for (const e of this.elements) e.drawFace(ctx);
    for (const e of this.elements) e.drawEdge(ctx);
    for (const e of this.elements) e.drawVertex(ctx);
    for (const e of this.elements) e.drawName(ctx);
    this.metricsEl.textContent = this.metricText();
  }
  pointerPosition(evt) {
    const rect = this.canvas.getBoundingClientRect();
    return { x: evt.clientX - rect.left, y: evt.clientY - rect.top };
  }
  movePick(x, y) {
    if (!this.pick) {
      let best = Infinity;
      for (const e of this.elements) if (e instanceof PointElement) {
        const d2 = e.distance2(x, y);
        if (d2 < 64 && d2 < best) { this.pick = e; best = d2; }
      }
    }
    x = Math.max(0, Math.min(this.canvas.width, x));
    y = Math.max(0, Math.min(this.canvas.height, y));
    if (!this.pick) return;
    if (this.pick === this.pivot) {
      this.translateCoordinates(x - this.pivot.x, y - this.pivot.y);
    } else if (this.pick.dragable) {
      this.pick.drag(x, y);
      this.computeCoordinates();
    } else if (this.pivot) {
      const temp = new PointElement(x, y);
      const a = this.pivot.distance(temp) / this.pivot.distance(this.pick);
      const theta = this.pivot.angle(this.pick, temp);
      this.rotateCoordinates(a * Math.cos(theta), a * Math.sin(theta));
    }
    this.repaint();
  }
  installEvents() {
    this.canvas.addEventListener('pointerdown', evt => { this.canvas.setPointerCapture(evt.pointerId); const p = this.pointerPosition(evt); this.pick = null; this.movePick(p.x, p.y); });
    this.canvas.addEventListener('pointermove', evt => { if (this.pick) { const p = this.pointerPosition(evt); this.movePick(p.x, p.y); } });
    this.canvas.addEventListener('pointerup', evt => { const p = this.pointerPosition(evt); this.movePick(p.x, p.y); this.pick = null; });
    window.addEventListener('keydown', evt => { if (evt.key.toLowerCase() === 'r') { this.load(this.initialData); } });
  }
}

function line(ctx, x1, y1, x2, y2) { ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); }

const defaultElements = `# Example Cheng-Pleijel quadrilateral. Coordinates are Java canvas pixels.
A;point;free;300,250;black;red
B;point;free;300,150;black;red
C;point;free;400,150;black;red
D;point;free;400,250;black;red
AB;line;connect;A,B;;;black
BC;line;connect;B,C;;;black
CD;line;connect;C,D;;;black
DA;line;connect;D,A;;;black
H0;point;free;500,-1000;black;orange
H1;point;free;500,1000;black;black
H;point;lineSlider;H0,H1,500,300;black;orange
T;point;lineSlider;H0,H1,500,350;black;orange
h;line;connect;H,T;;;black
O';point;free;350,200
O;point;chengpleijel;A,B,C,D,H,T,O';black;blue
OA;line;connect;O',A;;;black
OB;line;connect;O',B;;;black
OC;line;connect;O',C;;;black
OD;line;connect;O',D;;;black`;

const canvas = document.getElementById('slate');
const metrics = document.getElementById('metrics');
const textarea = document.getElementById('elementData');
const slate = new Slate(canvas, metrics);
slate.initialData = defaultElements;
textarea.value = defaultElements;
slate.load(defaultElements);
document.getElementById('reload').addEventListener('click', () => { slate.initialData = textarea.value; slate.load(textarea.value); });
