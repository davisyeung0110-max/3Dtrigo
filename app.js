(() => {
  'use strict';

  /* ------------------------------------------------------------------ */
  /* Tiny DOM helpers                                                    */
  /* ------------------------------------------------------------------ */
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  /* ------------------------------------------------------------------ */
  /* Vector maths                                                        */
  /* ------------------------------------------------------------------ */
  const V = {
    add: (a, b) => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z }),
    sub: (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }),
    mul: (a, s) => ({ x: a.x * s, y: a.y * s, z: a.z * s }),
    dot: (a, b) => a.x * b.x + a.y * b.y + a.z * b.z,
    cross: (a, b) => ({
      x: a.y * b.z - a.z * b.y,
      y: a.z * b.x - a.x * b.z,
      z: a.x * b.y - a.y * b.x
    }),
    len: (a) => Math.hypot(a.x, a.y, a.z),
    norm: (a) => {
      const l = Math.hypot(a.x, a.y, a.z);
      return l < 1e-9 ? { x: 0, y: 0, z: 0 } : { x: a.x / l, y: a.y / l, z: a.z / l };
    },
    lerp: (a, b, t) => ({
      x: a.x + (b.x - a.x) * t,
      y: a.y + (b.y - a.y) * t,
      z: a.z + (b.z - a.z) * t
    }),
    dist: (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)
  };

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const deg = (radians) => radians * 180 / Math.PI;
  const rad = (degrees) => degrees * Math.PI / 180;
  const EPS = 1e-7;

  function average(points) {
    if (!points.length) return { x: 0, y: 0, z: 0 };
    const sum = points.reduce((acc, p) => V.add(acc, p), { x: 0, y: 0, z: 0 });
    return V.mul(sum, 1 / points.length);
  }

  function fmt(value, digits = 2) {
    if (!Number.isFinite(value)) return '—';
    const rounded = Number(value.toFixed(digits));
    return String(rounded);
  }

  function fmtFixed(value, digits = 2) {
    if (!Number.isFinite(value)) return '—';
    return value.toFixed(digits);
  }

  function linePointDistance(point, linePoint, lineDir) {
    const diff = V.sub(point, linePoint);
    const along = V.dot(diff, lineDir);
    const closest = V.add(linePoint, V.mul(lineDir, along));
    return V.dist(point, closest);
  }

  function roundRect(ctx, x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + width, y, x + width, y + height, r);
    ctx.arcTo(x + width, y + height, x, y + height, r);
    ctx.arcTo(x, y + height, x, y, r);
    ctx.arcTo(x, y, x + width, y, r);
    ctx.closePath();
  }

  function pointsInsidePolygon(x, y, points) {
    let inside = false;
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
      const xi = points[i].x;
      const yi = points[i].y;
      const xj = points[j].x;
      const yj = points[j].y;
      const intersect = ((yi > y) !== (yj > y)) &&
        (x < (xj - xi) * (y - yi) / ((yj - yi) || 1e-9) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }

  /* ------------------------------------------------------------------ */
  /* Visual constants                                                    */
  /* ------------------------------------------------------------------ */
  const FACE_COLORS = [
    [117, 210, 183],
    [119, 166, 255],
    [246, 183, 107],
    [196, 151, 235],
    [99, 206, 213],
    [241, 137, 120],
    [160, 212, 120],
    [230, 178, 100]
  ];

  const PLANE_COLORS = {
    teal: [96, 231, 190],
    coral: [255, 139, 110],
    acid: [216, 255, 106],
    blue: [126, 174, 255]
  };

  const toRgba = (rgb, alpha) => `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`;

  const SHAPE_INFO = {
    cuboid: {
      name: 'Cuboid',
      dims: [
        { key: 'w', label: 'Width', meta: 'AB', min: 2, max: 30, step: 0.1 },
        { key: 'd', label: 'Depth', meta: 'BC', min: 2, max: 30, step: 0.1 },
        { key: 'h', label: 'Height', meta: 'CG', min: 1, max: 30, step: 0.1 }
      ],
      note: 'Drag a slider. The 3D model and the live angle update together.'
    },
    triprism: {
      name: 'Triangular prism',
      dims: [
        { key: 'w', label: 'Base width', meta: 'AB', min: 2, max: 14, step: 0.5 },
        { key: 'd', label: 'Base depth', meta: '⊥ AB', min: 2, max: 14, step: 0.5 },
        { key: 'h', label: 'Prism height', meta: 'AD', min: 1, max: 14, step: 0.5 }
      ],
      note: 'The base is an isosceles triangle. Right-prism edges stay vertical.'
    },
    pyramid: {
      name: 'Square pyramid',
      dims: [
        { key: 's', label: 'Base side', meta: 'AB', min: 2, max: 30, step: 0.1 },
        { key: 'h', label: 'Vertical height', meta: 'VO', min: 1, max: 30, step: 0.1 }
      ],
      note: 'The apex sits directly above the centre, O, of the square base.'
    },
    tetrahedron: {
      name: 'Regular tetrahedron',
      dims: [
        { key: 'edge', label: 'Edge length', meta: 'AB', min: 2, max: 30, step: 0.1 }
      ],
      note: 'A regular tetrahedron: all six edges are equal and every face is an equilateral triangle.'
    }
  };

  const BASE_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

  /* ------------------------------------------------------------------ */
  /* Geometry model builders                                             */
  /* ------------------------------------------------------------------ */
  function makeModel(kind, name, vertices, edgePairs, faceDefs, diagonalPlanes = []) {
    const labels = vertices.map(v => v.label);
    const uniqueEdges = [];
    const seenEdges = new Set();

    edgePairs.forEach(([a, b]) => {
      if (a === b) return;
      const key = a < b ? `${a}:${b}` : `${b}:${a}`;
      if (seenEdges.has(key)) return;
      seenEdges.add(key);
      uniqueEdges.push([a, b]);
    });

    const faces = faceDefs.map((face, index) => {
      const points = face.verts.map(i => vertices[i].p);
      return {
        ...face,
        index,
        name: face.verts.map(i => labels[i]).join(''),
        tris: triangulatePolygon(points)
      };
    });

    const points = vertices.map(v => v.p);
    const centroid = average(points);
    const min = { x: Infinity, y: Infinity, z: Infinity };
    const max = { x: -Infinity, y: -Infinity, z: -Infinity };
    points.forEach(p => {
      min.x = Math.min(min.x, p.x); min.y = Math.min(min.y, p.y); min.z = Math.min(min.z, p.z);
      max.x = Math.max(max.x, p.x); max.y = Math.max(max.y, p.y); max.z = Math.max(max.z, p.z);
    });
    const bbox = { min, max, center: V.mul(V.add(min, max), 1 / 2) };
    const radius = Math.max(...points.map(p => V.dist(p, bbox.center)));

    return {
      kind,
      name,
      vertices,
      labels,
      edges: uniqueEdges,
      faces,
      diagonalPlanes,
      centroid,
      bbox,
      radius
    };
  }

  function buildCuboid(w, d, h) {
    const x = w / 2;
    const y = d / 2;
    const base = [
      { x: -x, y: -y, z: 0 },
      { x: x, y: -y, z: 0 },
      { x: x, y: y, z: 0 },
      { x: -x, y: y, z: 0 }
    ];
    const vertices = [];
    base.forEach((p, i) => vertices.push({ label: BASE_LETTERS[i], p }));
    base.forEach((p, i) => vertices.push({ label: BASE_LETTERS[i + 4], p: { ...p, z: h } }));

    const edges = [
      [0, 1], [1, 2], [2, 3], [3, 0],
      [4, 5], [5, 6], [6, 7], [7, 4],
      [0, 4], [1, 5], [2, 6], [3, 7]
    ];

    const faces = [
      { id: 'base', role: 'base', verts: [0, 1, 2, 3] },
      { id: 'top', role: 'top', verts: [4, 5, 6, 7] },
      { id: 'side-0', role: 'side', verts: [0, 1, 5, 4] },
      { id: 'side-1', role: 'side', verts: [1, 2, 6, 5] },
      { id: 'side-2', role: 'side', verts: [2, 3, 7, 6] },
      { id: 'side-3', role: 'side', verts: [3, 0, 4, 7] }
    ];

    const diagonals = [
      { id: 'diag-acge', key: 'diag:ACGE', name: 'ACGE', verts: [0, 2, 6, 4], kind: 'diagonal' },
      { id: 'diag-bdhf', key: 'diag:BDHF', name: 'BDHF', verts: [1, 3, 7, 5], kind: 'diagonal' }
    ];

    return makeModel('cuboid', 'Cuboid', vertices, edges, faces, diagonals);
  }

  function buildTriangularPrism(w, d, h) {
    const x = w / 2;
    const y = d / 2;
    const base = [
      { x: -x, y: -y, z: 0 },
      { x: x, y: -y, z: 0 },
      { x: 0, y: y, z: 0 }
    ];
    const vertices = [];
    base.forEach((p, i) => vertices.push({ label: BASE_LETTERS[i], p }));
    base.forEach((p, i) => vertices.push({ label: BASE_LETTERS[i + 3], p: { ...p, z: h } }));

    const edges = [
      [0, 1], [1, 2], [2, 0],
      [3, 4], [4, 5], [5, 3],
      [0, 3], [1, 4], [2, 5]
    ];

    const faces = [
      { id: 'base', role: 'base', verts: [0, 1, 2] },
      { id: 'top', role: 'top', verts: [3, 4, 5] },
      { id: 'side-0', role: 'side', verts: [0, 1, 4, 3] },
      { id: 'side-1', role: 'side', verts: [1, 2, 5, 4] },
      { id: 'side-2', role: 'side', verts: [2, 0, 3, 5] }
    ];

    return makeModel('triprism', 'Triangular prism', vertices, edges, faces, []);
  }

  function buildPyramid(s, h) {
    const x = s / 2;
    const base = [
      { x: -x, y: -x, z: 0 },
      { x: x, y: -x, z: 0 },
      { x: x, y: x, z: 0 },
      { x: -x, y: x, z: 0 }
    ];
    const vertices = [];
    base.forEach((p, i) => vertices.push({ label: BASE_LETTERS[i], p }));
    vertices.push({ label: 'V', p: { x: 0, y: 0, z: h } });

    const edges = [
      [0, 1], [1, 2], [2, 3], [3, 0],
      [4, 0], [4, 1], [4, 2], [4, 3]
    ];

    const faces = [
      { id: 'base', role: 'base', verts: [0, 1, 2, 3] },
      { id: 'side-0', role: 'side', verts: [4, 0, 1] },
      { id: 'side-1', role: 'side', verts: [4, 1, 2] },
      { id: 'side-2', role: 'side', verts: [4, 2, 3] },
      { id: 'side-3', role: 'side', verts: [4, 3, 0] }
    ];

    return makeModel('pyramid', 'Square pyramid', vertices, edges, faces, []);
  }

  function buildRegularTetrahedron(edge) {
    const a = edge;
    const baseHeight = a * Math.sqrt(3) / 2;
    const vertices = [
      { label: 'A', p: { x: -a / 2, y: -baseHeight / 3, z: 0 } },
      { label: 'B', p: { x: a / 2, y: -baseHeight / 3, z: 0 } },
      { label: 'C', p: { x: 0, y: (2 * baseHeight) / 3, z: 0 } },
      { label: 'D', p: { x: 0, y: 0, z: a * Math.sqrt(2 / 3) } }
    ];
    const edges = [[0, 1], [1, 2], [2, 0], [3, 0], [3, 1], [3, 2]];
    const faces = [
      { id: 'base', role: 'base', verts: [0, 1, 2] },
      { id: 'side-0', role: 'side', verts: [0, 1, 3] },
      { id: 'side-1', role: 'side', verts: [1, 2, 3] },
      { id: 'side-2', role: 'side', verts: [2, 0, 3] }
    ];
    return makeModel('tetrahedron', 'Regular tetrahedron', vertices, edges, faces, []);
  }

  function buildRightTetrahedron(ab, ac, ad) {
    const vertices = [
      { label: 'A', p: { x: 0, y: 0, z: 0 } },
      { label: 'B', p: { x: ab, y: 0, z: 0 } },
      { label: 'C', p: { x: 0, y: ac, z: 0 } },
      { label: 'D', p: { x: 0, y: 0, z: ad } }
    ];
    const edges = [[0, 1], [1, 2], [2, 0], [3, 0], [3, 1], [3, 2]];
    const faces = [
      { id: 'base', role: 'base', verts: [0, 1, 2] },
      { id: 'side-0', role: 'side', verts: [0, 1, 3] },
      { id: 'side-1', role: 'side', verts: [1, 2, 3] },
      { id: 'side-2', role: 'side', verts: [2, 0, 3] }
    ];
    return makeModel('tetrahedron', 'Right tetrahedron', vertices, edges, faces, []);
  }

  function buildCustomModel(basePoints, kind, height) {
    const n = basePoints.length;
    const labelsBase = BASE_LETTERS.slice(0, n);
    const labelsTop = BASE_LETTERS.slice(n, n * 2);
    const vertices = [];
    basePoints.forEach((p, i) => vertices.push({ label: labelsBase[i], p: { x: p.x, y: p.y, z: 0 } }));

    if (kind === 'pyramid') {
      const baseCenter = average(basePoints);
      vertices.push({ label: 'V', p: { x: baseCenter.x, y: baseCenter.y, z: height } });
      const edges = [];
      for (let i = 0; i < n; i++) edges.push([i, (i + 1) % n]);
      for (let i = 0; i < n; i++) edges.push([n, i]);
      const faces = [{ id: 'base', role: 'base', verts: Array.from({ length: n }, (_, i) => i) }];
      for (let i = 0; i < n; i++) {
        faces.push({ id: `side-${i}`, role: 'side', verts: [n, i, (i + 1) % n] });
      }
      return makeModel('customPyramid', 'Photo pyramid', vertices, edges, faces, []);
    }

    basePoints.forEach((p, i) => vertices.push({ label: labelsTop[i], p: { x: p.x, y: p.y, z: height } }));
    const edges = [];
    for (let i = 0; i < n; i++) edges.push([i, (i + 1) % n]);
    for (let i = 0; i < n; i++) edges.push([n + i, n + (i + 1) % n]);
    for (let i = 0; i < n; i++) edges.push([i, n + i]);

    const faces = [
      { id: 'base', role: 'base', verts: Array.from({ length: n }, (_, i) => i) },
      { id: 'top', role: 'top', verts: Array.from({ length: n }, (_, i) => n + i) }
    ];
    for (let i = 0; i < n; i++) {
      faces.push({
        id: `side-${i}`,
        role: 'side',
        verts: [i, (i + 1) % n, n + (i + 1) % n, n + i]
      });
    }
    return makeModel('customPrism', 'Photo prism', vertices, edges, faces, []);
  }

  /* ------------------------------------------------------------------ */
  /* Named / derived points                                              */
  /* ------------------------------------------------------------------ */
  function derivedReferences(definition) {
    if (!definition) return [];
    if (definition.type === 'midpoint' || definition.type === 'ratio' || definition.type === 'distance') {
      return [definition.a, definition.b];
    }
    if (definition.type === 'intersection') {
      return [...definition.line1, ...definition.line2];
    }
    if (definition.type === 'center') return definition.points.slice();
    if (definition.type === 'footLine') return [definition.source, definition.a, definition.b];
    if (definition.type === 'footPlane') return [definition.source, ...definition.points];
    return [];
  }

  function intersectTwoLines(A, B, C, D) {
    const d1 = V.sub(B, A);
    const d2 = V.sub(D, C);
    const w0 = V.sub(A, C);
    const a = V.dot(d1, d1);
    const b = V.dot(d1, d2);
    const c = V.dot(d2, d2);
    const d = V.dot(d1, w0);
    const e = V.dot(d2, w0);
    const denominator = a * c - b * b;
    if (Math.abs(denominator) < 1e-9) {
      return { error: 'The two lines are parallel.' };
    }
    const t = (b * e - c * d) / denominator;
    const u = (a * e - b * d) / denominator;
    const p1 = V.add(A, V.mul(d1, t));
    const p2 = V.add(C, V.mul(d2, u));
    const distance = V.dist(p1, p2);
    if (distance > 0.03) {
      return { error: 'The two lines do not meet in 3D.' };
    }
    return {
      point: V.mul(V.add(p1, p2), 0.5),
      t,
      u,
      warning: (t < -0.02 || t > 1.02 || u < -0.02 || u > 1.02)
        ? 'The lines meet outside one of the stated segments.'
        : ''
    };
  }

  function computeDerivedPoint(definition, pointMap) {
    const get = label => pointMap.get(label);
    if (definition.type === 'midpoint') {
      const A = get(definition.a);
      const B = get(definition.b);
      if (!A || !B) return { error: `Could not find ${definition.a} or ${definition.b}.` };
      return {
        point: V.mul(V.add(A, B), 0.5),
        guides: [{ from: A, to: B }]
      };
    }
    if (definition.type === 'ratio' || definition.type === 'distance') {
      const A = get(definition.a);
      const B = get(definition.b);
      if (!A || !B) return { error: `Could not find ${definition.a} or ${definition.b}.` };
      const length = V.dist(A, B);
      if (length < 1e-9) return { error: `${definition.a}${definition.b} has zero length.` };
      let t = definition.type === 'ratio' ? definition.t : definition.distance / length;
      let warning = '';
      if (!Number.isFinite(t)) return { error: 'The point position is not a valid number.' };
      if (t < 0 || t > 1) {
        warning = `The point lies outside segment ${definition.a}${definition.b}.`;
      }
      return {
        point: V.add(A, V.mul(V.sub(B, A), t)),
        guides: [{ from: A, to: B }],
        warning
      };
    }
    if (definition.type === 'intersection') {
      const [a, b] = definition.line1;
      const [c, d] = definition.line2;
      const A = get(a);
      const B = get(b);
      const C = get(c);
      const D = get(d);
      if (!A || !B || !C || !D) return { error: 'A line for this intersection is missing.' };
      const shared = [a, b].find(label => label === c || label === d);
      if (shared) {
        return {
          point: get(shared),
          guides: [{ from: A, to: B }, { from: C, to: D }],
          warning: `${definition.line1.join('')} and ${definition.line2.join('')} already meet at ${shared}.`
        };
      }
      const result = intersectTwoLines(A, B, C, D);
      if (result.error) return { error: result.error };
      return {
        point: result.point,
        guides: [{ from: A, to: B }, { from: C, to: D }],
        warning: result.warning
      };
    }
    if (definition.type === 'center') {
      const points = definition.points.map(get);
      if (points.some(point => !point)) return { error: 'The centre needs valid corners.' };
      const center = average(points);
      const guides = [];
      if (points.length === 4) {
        guides.push({ from: points[0], to: points[2] }, { from: points[1], to: points[3] });
      } else {
        points.forEach(point => guides.push({ from: point, to: center }));
      }
      return { point: center, guides };
    }
    if (definition.type === 'footLine') {
      const source = get(definition.source);
      const A = get(definition.a);
      const B = get(definition.b);
      if (!source || !A || !B) return { error: 'A line or source point for the perpendicular is missing.' };
      const direction = V.sub(B, A);
      const lengthSquared = V.dot(direction, direction);
      if (lengthSquared < 1e-9) return { error: `Line ${definition.a}${definition.b} has zero length.` };
      const t = V.dot(V.sub(source, A), direction) / lengthSquared;
      const foot = V.add(A, V.mul(direction, t));
      return {
        point: foot,
        guides: [{ from: source, to: foot }, { from: A, to: B }],
        warning: (t < -0.02 || t > 1.02) ? 'The perpendicular foot lies outside the segment.' : ''
      };
    }
    if (definition.type === 'footPlane') {
      const source = get(definition.source);
      const points = definition.points.map(get);
      if (!source || points.some(point => !point)) return { error: 'A plane or source point for the perpendicular is missing.' };
      const rawNormal = V.cross(V.sub(points[1], points[0]), V.sub(points[2], points[0]));
      if (V.len(rawNormal) < 1e-8) return { error: 'The target plane is not valid.' };
      const normal = V.norm(rawNormal);
      const signed = V.dot(V.sub(source, points[0]), normal);
      const foot = V.sub(source, V.mul(normal, signed));
      return {
        point: foot,
        guides: [
          { from: source, to: foot },
          { from: points[0], to: points[1] },
          { from: points[1], to: points[2] }
        ]
      };
    }
    return { error: 'This point definition is not supported.' };
  }

  function addDerivedPoints(model, definitions) {
    const warnings = [];
    const pointMap = new Map(model.vertices.map(vertex => [vertex.label, vertex.p]));
    const baseLabels = new Set(pointMap.keys());
    const added = [];
    let pending = definitions.map(definition => ({ ...definition }));
    model.derived = [];

    for (let pass = 0; pass < definitions.length + 1 && pending.length; pass++) {
      let progressed = false;
      const nextPending = [];
      pending.forEach(definition => {
        if (!definition.label) return;
        let def = { ...definition };
        if ((def.type === 'center' || def.type === 'footPlane') && def.planeToken && !def.points) {
          const resolved = resolveTextPlane(def.planeToken, model);
          if (resolved.error) {
            warnings.push(`${def.label}: ${resolved.error}`);
            return;
          }
          def.points = resolved.indices.map(index => model.vertices[index].label);
        }
        if (baseLabels.has(def.label)) {
          warnings.push(`${def.label} is already a corner of the solid, so its point definition was ignored.`);
          return;
        }
        if (pointMap.has(def.label)) {
          warnings.push(`${def.label} has more than one definition; the first one was used.`);
          return;
        }
        const references = derivedReferences(def);
        if (!references.every(label => pointMap.has(label))) {
          nextPending.push(def);
          return;
        }
        const computed = computeDerivedPoint(def, pointMap);
        if (computed.error) {
          warnings.push(`${def.label}: ${computed.error}`);
          return;
        }
        if (computed.warning) warnings.push(`${def.label}: ${computed.warning}`);
        const vertex = {
          label: def.label,
          p: computed.point,
          derived: true,
          definitionText: def.text || 'Named point'
        };
        model.vertices.push(vertex);
        pointMap.set(def.label, computed.point);
        const stored = { ...def };
        added.push(stored);
        model.derived.push({
          label: def.label,
          point: computed.point,
          definitionText: vertex.definitionText,
          guides: computed.guides || [],
          warning: computed.warning || ''
        });
        progressed = true;
      });
      pending = nextPending;
      if (!progressed) break;
    }

    pending.forEach(definition => {
      const missing = derivedReferences(definition).filter(label => !pointMap.has(label));
      warnings.push(`${definition.label}: could not locate it${missing.length ? ` because ${missing.join(', ')} is missing` : ''}.`);
    });

    return { model, warnings, added };
  }

  /* Ear clipping keeps occlusion tests reliable for traced, possibly concave bases. */
  function triangulatePolygon(points) {
    if (points.length < 3) return [];
    if (points.length === 3) return [[points[0], points[1], points[2]]];

    const normal = V.norm(V.cross(
      V.sub(points[1], points[0]),
      V.sub(points[2], points[0])
    ));
    const ax = Math.abs(normal.x);
    const ay = Math.abs(normal.y);
    const az = Math.abs(normal.z);

    const projected = points.map(p => {
      if (az >= ax && az >= ay) return { x: p.x, y: p.y, i: 0 };
      if (ax >= ay) return { x: p.y, y: p.z, i: 1 };
      return { x: p.x, y: p.z, i: 2 };
    });

    const signedArea = projected.reduce((sum, p, i) => {
      const q = projected[(i + 1) % projected.length];
      return sum + p.x * q.y - q.x * p.y;
    }, 0) / 2;

    let indices = projected.map((_, i) => i);
    if (signedArea < 0) indices.reverse();

    const cross2 = (a, b, c) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
    const pointInTriangle = (p, a, b, c) => {
      const d1 = cross2(a, b, p);
      const d2 = cross2(b, c, p);
      const d3 = cross2(c, a, p);
      return d1 >= -1e-9 && d2 >= -1e-9 && d3 >= -1e-9;
    };

    const triangles = [];
    let guard = 0;
    while (indices.length > 3 && guard < 200) {
      guard++;
      let clipped = false;
      for (let k = 0; k < indices.length; k++) {
        const prev = indices[(k + indices.length - 1) % indices.length];
        const curr = indices[k];
        const next = indices[(k + 1) % indices.length];
        const a = projected[prev];
        const b = projected[curr];
        const c = projected[next];
        if (cross2(a, b, c) <= 1e-9) continue;
        let ear = true;
        for (const idx of indices) {
          if (idx === prev || idx === curr || idx === next) continue;
          if (pointInTriangle(projected[idx], a, b, c)) {
            ear = false;
            break;
          }
        }
        if (ear) {
          triangles.push([points[prev], points[curr], points[next]]);
          indices.splice(k, 1);
          clipped = true;
          break;
        }
      }
      if (!clipped) break;
    }

    if (indices.length >= 3) {
      for (let i = 1; i < indices.length - 1; i++) {
        triangles.push([points[indices[0]], points[indices[i]], points[indices[i + 1]]]);
      }
    }

    return triangles;
  }

  /* ------------------------------------------------------------------ */
  /* App state + camera                                                  */
  /* ------------------------------------------------------------------ */
  const camera = {
    yaw: -0.86,
    pitch: 0.36,
    distance: 23,
    target: { x: 0, y: 0, z: 2.5 }
  };

  const state = {
    shape: 'cuboid',
    dims: { w: 8, d: 6, h: 5, s: 10, edge: 6 },
    custom: null,
    tetra: { mode: 'regular', ab: 6, ac: 6, ad: 6 },
    derivedDefinitions: [],
    model: null,
    tool: 'linePlane',
    lineA: 0,
    lineB: 6,
    distanceA: 0,
    distanceB: 6,
    planeAKey: 'face:base',
    planeBKey: 'face:side-0',
    customA: [0, 2, 6],
    customB: [0, 1, 4],
    inspect: { kind: 'face', id: 'base' },
    nextSlot: 'lineA',
    nextPlaneSlot: 'A',
    hoverVertex: null,
    hoverFace: null,
    toggles: {
      labels: true,
      grid: true,
      hiddenEdges: true,
      spin: false,
      derivedGuides: true
    },
    photo: null,
    exampleId: 'cuboid',
    source: 'example',
    questionHtml: 'The cuboid <em>ABCDEFGH</em> has <em>AB</em> = 8, <em>BC</em> = 6 and <em>CG</em> = 5. Find the angle between the line <em>AG</em> and the plane <em>ABCD</em>.',
    analysis: null
  };

  const photoLab = {
    image: null,
    dataUrl: null,
    name: '',
    points: [],
    kind: 'prism',
    height: 6,
    regularise: true
  };

  let canvasW = 1;
  let canvasH = 1;
  let canvasDpr = 1;
  let renderQueued = false;
  let lastFrameTime = 0;
  let lastFocusedElement = null;

  function buildModelForState() {
    if (state.shape === 'triprism') {
      return buildTriangularPrism(state.dims.w, state.dims.d, state.dims.h);
    }
    if (state.shape === 'pyramid') {
      return buildPyramid(state.dims.s, state.dims.h);
    }
    if (state.shape === 'tetrahedron') {
      return state.tetra.mode === 'right'
        ? buildRightTetrahedron(state.tetra.ab, state.tetra.ac, state.tetra.ad)
        : buildRegularTetrahedron(state.dims.edge);
    }
    if (state.shape === 'custom' && state.custom) {
      return buildCustomModel(state.custom.base, state.custom.kind, state.custom.height);
    }
    return buildCuboid(state.dims.w, state.dims.d, state.dims.h);
  }

  function defaultLineForModel() {
    const n = state.model.vertices.length;
    if (state.shape === 'pyramid') return [0, 4];
    if (state.shape === 'tetrahedron') {
      return state.tetra.mode === 'right' ? [1, 3] : [0, 3];
    }
    if (state.shape === 'triprism') return [0, Math.min(5, n - 1)];
    if (state.shape === 'custom') {
      if (state.custom && state.custom.kind === 'pyramid') {
        return [0, state.custom.base.length];
      }
      const baseCount = state.custom ? state.custom.base.length : 4;
      return [0, baseCount + Math.ceil(baseCount / 2)];
    }
    return [0, Math.min(6, n - 1)];
  }

  function resetSelectionsForModel() {
    const n = state.model.vertices.length;
    const baseFace = state.model.faces.find(f => f.role === 'base') || state.model.faces[0];
    const sideFace = state.model.faces.find(f => f.role === 'side') || state.model.faces[1] || baseFace;
    state.planeAKey = baseFace ? `face:${baseFace.id}` : 'custom';
    state.planeBKey = sideFace ? `face:${sideFace.id}` : 'custom';
    const defaults = defaultLineForModel();
    state.lineA = defaults[0];
    state.lineB = defaults[1];
    state.distanceA = 0;
    const firstOtherPoint = state.model.vertices.findIndex((vertex, index) => index > 0 && !vertex.derived);
    state.distanceB = firstOtherPoint >= 0 ? firstOtherPoint : Math.min(1, n - 1);
    state.inspect = { kind: 'face', id: baseFace ? baseFace.id : '' };
    const coreIndices = state.model.vertices
      .map((vertex, index) => (vertex.derived ? null : index))
      .filter(index => index !== null);
    state.customA = [coreIndices[0] || 0, coreIndices[2] || coreIndices[1] || 0, coreIndices[Math.min(6, coreIndices.length - 1)] || 0];
    state.customB = [coreIndices[0] || 0, coreIndices[1] || 0, coreIndices[Math.min(4, coreIndices.length - 1)] || 0];
    state.nextSlot = 'lineA';
    state.nextPlaneSlot = 'A';
  }

  function sanitizeSelections() {
    if (!state.model) return;
    const n = state.model.vertices.length;
    if (!Number.isInteger(state.lineA) || state.lineA < 0 || state.lineA >= n) state.lineA = 0;
    if (!Number.isInteger(state.lineB) || state.lineB < 0 || state.lineB >= n) state.lineB = Math.min(1, n - 1);
    if (!Number.isInteger(state.distanceA) || state.distanceA < 0 || state.distanceA >= n) state.distanceA = 0;
    if (!Number.isInteger(state.distanceB) || state.distanceB < 0 || state.distanceB >= n) state.distanceB = Math.min(1, n - 1);

    const validKeys = new Set(getPlanePresets().map(p => p.key));
    state.planeAKey = state.planeAKey === 'custom' || validKeys.has(state.planeAKey)
      ? state.planeAKey
      : (getPlanePresets()[0] ? getPlanePresets()[0].key : 'custom');
    state.planeBKey = state.planeBKey === 'custom' || validKeys.has(state.planeBKey)
      ? state.planeBKey
      : (getPlanePresets()[1] ? getPlanePresets()[1].key : state.planeAKey);

    const clampTriple = (triple) => triple.map(i => clamp(Number.isFinite(i) ? i : 0, 0, n - 1));
    state.customA = clampTriple(state.customA);
    state.customB = clampTriple(state.customB);

    if (!state.inspect) state.inspect = { kind: 'face', id: '' };
    if (state.inspect.kind === 'point' && (state.inspect.index < 0 || state.inspect.index >= n)) {
      state.inspect = { kind: 'face', id: state.model.faces[0] ? state.model.faces[0].id : '' };
    }
    if (state.inspect.kind === 'face' && !state.model.faces.some(f => f.id === state.inspect.id)) {
      state.inspect = { kind: 'face', id: state.model.faces[0] ? state.model.faces[0].id : '' };
    }
  }

  function updateCameraTarget() {
    if (!state.model) return;
    camera.target = { ...state.model.bbox.center };
  }

  function autoFrame() {
    if (!state.model) return;
    updateCameraTarget();
    camera.distance = clamp(state.model.radius * 2.75 + 4.3, 16, 70);
  }

  function buildModelWithExtras() {
    let model = buildModelForState();
    if (state.derivedDefinitions && state.derivedDefinitions.length) {
      const result = addDerivedPoints(model, state.derivedDefinitions);
      state.derivedWarnings = result.warnings;
      model = result.model;
    } else {
      state.derivedWarnings = [];
    }
    return model;
  }

  function rebuildModel(options = {}) {
    state.model = buildModelWithExtras();
    sanitizeSelections();
    if (options.frame) {
      autoFrame();
    } else {
      updateCameraTarget();
    }
    state.analysis = computeAnalysis();
    requestRender();
    updateCaption();
    updateQuestionBanner();
    renderDerivedPoints();
  }

  function resetCamera() {
    camera.yaw = -0.86;
    camera.pitch = 0.36;
    autoFrame();
    setActiveView('iso');
    requestRender();
  }

  /* ------------------------------------------------------------------ */
  /* Plane + analysis maths                                              */
  /* ------------------------------------------------------------------ */
  function getPlanePresets(model = state.model) {
    if (!model) return [];
    const faces = model.faces.map(face => ({
      key: `face:${face.id}`,
      name: face.name,
      verts: face.verts,
      kind: 'face',
      role: face.role,
      id: face.id
    }));
    const diagonals = (model.diagonalPlanes || []).map(plane => ({
      key: plane.key,
      name: plane.name,
      verts: plane.verts,
      kind: 'diagonal',
      role: 'diagonal',
      id: plane.id
    }));
    return faces.concat(diagonals);
  }

  function planePresetLabel(preset) {
    if (preset.kind === 'diagonal') return `${preset.name} · diagonal plane`;
    if (preset.role === 'base') return `${preset.name} · base plane`;
    if (preset.role === 'top') return `${preset.name} · top plane`;
    return `${preset.name} · side face`;
  }

  function makePlaneFromPoints(points, name, key, kind) {
    if (!points || points.length < 3) return { error: 'Choose three non-collinear points to make a plane.' };
    const a = points[0];
    const b = points[1];
    const c = points[2];
    const raw = V.cross(V.sub(b, a), V.sub(c, a));
    if (V.len(raw) < 1e-6) {
      return { error: 'Those three points lie on a straight line, so they do not define a unique plane.' };
    }
    let n = V.norm(raw);
    const centroid = state.model ? state.model.centroid : { x: 0, y: 0, z: 0 };
    if (V.dot(n, V.sub(centroid, a)) > 0) n = V.mul(n, -1);
    const d = V.dot(n, a);
    return {
      plane: {
        name,
        key,
        kind,
        points,
        n,
        d,
        point: a,
        center: average(points)
      }
    };
  }

  function resolvePlane(key, customPoints) {
    const presets = getPlanePresets();
    if (key === 'custom') {
      const safePoints = (customPoints || []).map(i => state.model.vertices[i] ? state.model.vertices[i].p : null).filter(Boolean);
      if (safePoints.length < 3) return { error: 'Choose three points to define the plane.' };
      const name = (customPoints || []).map(i => state.model.vertices[i] ? state.model.vertices[i].label : '?').join('');
      return makePlaneFromPoints(safePoints, name, 'custom', 'custom');
    }
    const preset = presets.find(p => p.key === key) || presets[0];
    if (!preset) return { error: 'No plane is available for this solid.' };
    const points = preset.verts.map(i => state.model.vertices[i].p);
    return makePlaneFromPoints(points, preset.name, preset.key, preset.kind);
  }

  function footOnPlane(point, plane) {
    const signed = V.dot(V.sub(point, plane.point), plane.n);
    return V.sub(point, V.mul(plane.n, signed));
  }

  function computeLinePlane() {
    if (!state.model) return { mode: 'linePlane', error: 'No model loaded.' };
    const A = state.model.vertices[state.lineA];
    const B = state.model.vertices[state.lineB];
    if (!A || !B) return { mode: 'linePlane', error: 'Choose two vertices for the line.' };
    if (state.lineA === state.lineB) {
      return { mode: 'linePlane', error: 'A line needs two different endpoints.' };
    }
    const planeResult = resolvePlane(state.planeAKey, state.customA);
    if (planeResult.error) return { mode: 'linePlane', error: planeResult.error };
    const plane = planeResult.plane;
    const P = A.p;
    const Q = B.p;
    const d = V.sub(Q, P);
    const length = V.len(d);
    if (length < 1e-8) return { mode: 'linePlane', error: 'The two endpoints are at the same place.' };

    const n = plane.n;
    const signedP = V.dot(V.sub(P, plane.point), n);
    const signedQ = V.dot(V.sub(Q, plane.point), n);
    const perpendicular = Math.abs(V.dot(d, n));
    const projection = Math.sqrt(Math.max(0, length * length - perpendicular * perpendicular));
    const angleRad = Math.atan2(perpendicular, projection);
    const angleDeg = deg(angleRad);

    const footP = V.sub(P, V.mul(n, signedP));
    const footQ = V.sub(Q, V.mul(n, signedQ));
    const rawProjectionDir = V.norm(V.sub(d, V.mul(n, V.dot(d, n))));
    let lineDir = V.norm(d);
    let projDir = rawProjectionDir;
    let anchor = null;
    let anchorKind = 'translated';

    if (Math.abs(signedP) < 0.002) {
      anchor = P;
      lineDir = V.norm(V.sub(Q, P));
      projDir = V.norm(V.sub(footQ, P));
      anchorKind = 'endpoint';
    } else if (Math.abs(signedQ) < 0.002) {
      anchor = Q;
      lineDir = V.norm(V.sub(P, Q));
      projDir = V.norm(V.sub(footP, Q));
      anchorKind = 'endpoint';
    } else {
      const denominator = signedQ - signedP;
      const t = Math.abs(denominator) > 1e-9 ? -signedP / denominator : 2;
      if (t >= 0 && t <= 1) {
        anchor = V.add(P, V.mul(d, t));
        const far = Math.abs(signedP) >= Math.abs(signedQ) ? P : Q;
        lineDir = V.norm(V.sub(far, anchor));
        projDir = rawProjectionDir;
        anchorKind = 'intersection';
      } else {
        anchor = Math.abs(signedP) <= Math.abs(signedQ) ? footP : footQ;
        lineDir = V.norm(d);
        projDir = rawProjectionDir;
        anchorKind = 'translated';
      }
    }

    if (V.len(projDir) < 1e-8) {
      return {
        mode: 'linePlane',
        error: 'This line is perpendicular to the plane. The angle is exactly 90°.',
        plane,
        line: { a: A, b: B, P, Q, name: `${A.label}${B.label}` },
        angleDeg: 90,
        perpendicular,
        projection: 0,
        hypotenuse: length,
        feet: [],
        perpendicularSegments: [{ from: P, to: footP }, { from: Q, to: footQ }],
        projectionSegment: null,
        anchor,
        lineDir,
        projDir: { x: 0, y: 0, z: 0 },
        anchorKind,
        perpOnly: true
      };
    }

    if (V.dot(lineDir, projDir) < 0) {
      projDir = V.mul(projDir, -1);
    }
    if (V.dot(lineDir, projDir) < 0) {
      lineDir = V.mul(lineDir, -1);
    }

    const radius = Math.max(1.05, state.model.radius * 0.27);
    const rightAngleSize = Math.min(0.52, Math.max(0.3, radius * 0.42));
    const upDir = V.mul(n, Math.sign(signedQ) || 1);
    const planeDirAtFoot = V.len(V.sub(footQ, footP)) > 1e-8
      ? V.norm(V.sub(footQ, footP))
      : projDir;

    const coincidentVertexLabel = (point) => {
      let nearest = null;
      state.model.vertices.forEach(vertex => {
        const d = V.dist(vertex.p, point);
        if (d < 0.06 && (!nearest || d < nearest.distance)) {
          nearest = { label: vertex.label, distance: d };
        }
      });
      return nearest ? nearest.label : '';
    };
    const baseCenterLabel = (point) => {
      if (!['pyramid', 'customPyramid', 'tetrahedron'].includes(state.model.kind)) return '';
      const baseFace = state.model.faces.find(face => face.role === 'base');
      if (!baseFace) return '';
      const center = average(baseFace.verts.map(i => state.model.vertices[i].p));
      return V.dist(center, point) < 0.06 ? 'O' : '';
    };
    const footALabel = coincidentVertexLabel(footP) || baseCenterLabel(footP) || `${A.label}′`;
    const footQLabel = coincidentVertexLabel(footQ) || baseCenterLabel(footQ) || `${B.label}′`;

    const feet = [];
    if (V.dist(footP, P) > 0.04 && !coincidentVertexLabel(footP)) {
      feet.push({ point: footP, label: footALabel, color: 'blue' });
    }
    if (V.dist(footQ, Q) > 0.04 && !coincidentVertexLabel(footQ)) {
      feet.push({ point: footQ, label: footQLabel, color: 'blue' });
    }

    return {
      mode: 'linePlane',
      error: null,
      plane,
      line: { a: A, b: B, P, Q, name: `${A.label}${B.label}` },
      angleDeg,
      angleRad,
      perpendicular,
      projection,
      hypotenuse: length,
      feet,
      footP,
      footQ,
      footALabel,
      footQLabel,
      signedP,
      signedQ,
      perpendicularSegments: [
        ...(V.dist(footP, P) > 0.02 ? [{ from: P, to: footP, footLabel: footALabel }] : []),
        ...(V.dist(footQ, Q) > 0.02 ? [{ from: Q, to: footQ, footLabel: footQLabel }] : [])
      ],
      projectionSegment: V.dist(footP, footQ) > 0.02 ? { from: footP, to: footQ } : null,
      anchor,
      anchorKind,
      lineDir,
      projDir,
      arcRadius: radius,
      rightAngle: V.dist(footQ, Q) > 0.02 && V.dist(footQ, footP) > 0.02
        ? { foot: footQ, up: upDir, planeDir: planeDirAtFoot, size: rightAngleSize }
        : null,
      perpOnly: false
    };
  }

  function findCollinearEdge(pointOnLine, lineDir) {
    if (!state.model) return '';
    for (const [a, b] of state.model.edges) {
      const A = state.model.vertices[a];
      const B = state.model.vertices[b];
      const edgeVec = V.sub(B.p, A.p);
      const edgeLen = V.len(edgeVec);
      if (edgeLen < 1e-8) continue;
      const edgeDir = V.mul(edgeVec, 1 / edgeLen);
      if (Math.abs(V.dot(edgeDir, lineDir)) > 0.9995 &&
          linePointDistance(A.p, pointOnLine, lineDir) < 0.025) {
        return `${A.label}${B.label}`;
      }
    }
    return '';
  }

  function computePlanePlane() {
    const resA = resolvePlane(state.planeAKey, state.customA);
    const resB = resolvePlane(state.planeBKey, state.customB);
    if (resA.error || resB.error) {
      return { mode: 'planePlane', error: resA.error || resB.error };
    }
    const planeA = resA.plane;
    const planeB = resB.plane;
    const nA = planeA.n;
    const nB = planeB.n;
    const rawCross = V.cross(nA, nB);
    const crossLen = V.len(rawCross);
    const dotNormals = clamp(V.dot(nA, nB), -1, 1);
    const angleRad = Math.acos(Math.abs(dotNormals));
    const angleDeg = deg(angleRad);

    if (crossLen < 1e-6) {
      const pointB = planeB.points[0];
      const dist = Math.abs(V.dot(V.sub(pointB, planeA.point), nA));
      if (dist < 1e-5) {
        return { mode: 'planePlane', error: 'Those two selections describe the same plane.' };
      }
      return {
        mode: 'planePlane',
        error: null,
        parallel: true,
        planeA,
        planeB,
        angleDeg: 0,
        angleRad: 0,
        intersection: null,
        u1: null,
        u2: null,
        samePlane: false
      };
    }

    const L = rawCross;
    const l2 = V.dot(L, L);
    const dA = planeA.d;
    const dB = planeB.d;
    const p0 = V.add(
      V.mul(V.cross(nB, L), dA / l2),
      V.mul(V.cross(L, nA), dB / l2)
    );
    const centerT = V.dot(V.sub(state.model.centroid, p0), L) / l2;
    const intersectionPoint = V.add(p0, V.mul(L, centerT));
    const intersectionDir = V.norm(L);

    let u1 = V.norm(V.cross(nA, intersectionDir));
    let u2 = V.norm(V.cross(nB, intersectionDir));
    if (V.dot(u1, u2) < 0) u2 = V.mul(u2, -1);
    if (V.len(u1) < 1e-8 || V.len(u2) < 1e-8) {
      return { mode: 'planePlane', error: 'The intersection line could not be constructed.' };
    }

    const lineLabel = findCollinearEdge(intersectionPoint, intersectionDir);
    const extent = Math.max(6, state.model.radius * 1.35);
    const rayLength = clamp(state.model.radius * 0.58, 2.2, 6.2);
    const arcRadius = rayLength * 0.9;

    return {
      mode: 'planePlane',
      error: null,
      parallel: false,
      samePlane: false,
      planeA,
      planeB,
      angleDeg,
      angleRad,
      intersection: {
        point: intersectionPoint,
        dir: intersectionDir,
        from: V.add(intersectionPoint, V.mul(intersectionDir, -extent)),
        to: V.add(intersectionPoint, V.mul(intersectionDir, extent)),
        label: lineLabel
      },
      u1,
      u2,
      rayLength,
      arcRadius
    };
  }

  function computeDistance() {
    if (!state.model) return { mode: 'distance', error: 'No model loaded.' };
    const A = state.model.vertices[state.distanceA];
    const B = state.model.vertices[state.distanceB];
    if (!A || !B) return { mode: 'distance', error: 'Choose two vertices.' };
    if (state.distanceA === state.distanceB) {
      return { mode: 'distance', error: 'Choose two different vertices.', A, B };
    }
    const delta = V.sub(B.p, A.p);
    const length = V.len(delta);
    return {
      mode: 'distance',
      error: null,
      A,
      B,
      name: `${A.label}${B.label}`,
      delta,
      length
    };
  }

  function computeInspect() {
    if (!state.model) return { mode: 'inspect', error: 'No model loaded.' };
    if (state.inspect && state.inspect.kind === 'point') {
      const vertex = state.model.vertices[state.inspect.index];
      if (!vertex) return { mode: 'inspect', error: 'Choose a vertex to inspect.' };
      const adjacentFaces = state.model.faces.filter(face => face.verts.includes(state.inspect.index));
      const adjacentEdges = state.model.edges
        .filter(edge => edge[0] === state.inspect.index || edge[1] === state.inspect.index)
        .map(edge => {
          const other = edge[0] === state.inspect.index ? edge[1] : edge[0];
          return state.model.vertices[other].label;
        });
      return { mode: 'inspect', kind: 'point', vertex, adjacentFaces, adjacentEdges, error: null };
    }
    const face = state.model.faces.find(f => f.id === (state.inspect && state.inspect.id)) || state.model.faces[0];
    if (!face) return { mode: 'inspect', error: 'Choose a face to inspect.' };
    const planeResult = resolvePlane(`face:${face.id}`, []);
    return {
      mode: 'inspect',
      kind: 'face',
      face,
      plane: planeResult.plane || null,
      error: planeResult.error || null
    };
  }

  function computeAnalysis() {
    if (state.tool === 'distance') return computeDistance();
    if (state.tool === 'planePlane') return computePlanePlane();
    if (state.tool === 'inspect') return computeInspect();
    return computeLinePlane();
  }

  /* ------------------------------------------------------------------ */
  /* Canvas refs + projection                                            */
  /* ------------------------------------------------------------------ */
  const sceneCanvas = $('#sceneCanvas');
  const sceneCtx = sceneCanvas.getContext('2d');
  const stageEl = $('#stage');
  const workbenchBody = $('#workbenchBody');
  const workbenchTitle = $('#workbenchTitle');
  const dimensionControls = $('#dimensionControls');
  const dimensionNote = $('#dimensionNote');
  const modelCaption = $('#modelCaption');
  const questionText = $('#questionText');

  function requestRender() {
    if (renderQueued) return;
    renderQueued = true;
    requestAnimationFrame(() => {
      renderQueued = false;
      drawScene();
    });
  }

  function resizeSceneCanvas() {
    const rect = sceneCanvas.getBoundingClientRect();
    canvasW = Math.max(1, rect.width);
    canvasH = Math.max(1, rect.height);
    canvasDpr = Math.min(window.devicePixelRatio || 1, 2.25);
    const pixelW = Math.max(1, Math.round(canvasW * canvasDpr));
    const pixelH = Math.max(1, Math.round(canvasH * canvasDpr));
    if (sceneCanvas.width !== pixelW || sceneCanvas.height !== pixelH) {
      sceneCanvas.width = pixelW;
      sceneCanvas.height = pixelH;
    }
    sceneCtx.setTransform(canvasDpr, 0, 0, canvasDpr, 0, 0);
    requestRender();
  }

  function cameraBasis() {
    const cp = Math.cos(camera.pitch);
    const position = {
      x: camera.target.x + camera.distance * cp * Math.cos(camera.yaw),
      y: camera.target.y + camera.distance * cp * Math.sin(camera.yaw),
      z: camera.target.z + camera.distance * Math.sin(camera.pitch)
    };
    const forward = V.norm(V.sub(camera.target, position));
    let right = V.cross(forward, { x: 0, y: 0, z: 1 });
    if (V.len(right) < 1e-7) right = { x: 1, y: 0, z: 0 };
    right = V.norm(right);
    const up = V.norm(V.cross(right, forward));
    return { position, forward, right, up };
  }

  function projectPoint(point, basis) {
    const rel = V.sub(point, basis.position);
    const depth = V.dot(rel, basis.forward);
    if (depth <= 0.18) return null;
    const focal = Math.min(canvasW, canvasH) * 1.08;
    return {
      x: canvasW * 0.5 + V.dot(rel, basis.right) * focal / depth,
      y: canvasH * 0.5 - V.dot(rel, basis.up) * focal / depth,
      depth
    };
  }

  function rayTriangle(origin, direction, a, b, c) {
    const edge1 = V.sub(b, a);
    const edge2 = V.sub(c, a);
    const h = V.cross(direction, edge2);
    const det = V.dot(edge1, h);
    if (Math.abs(det) < 1e-9) return null;
    const invDet = 1 / det;
    const s = V.sub(origin, a);
    const u = invDet * V.dot(s, h);
    if (u < -1e-7 || u > 1 + 1e-7) return null;
    const q = V.cross(s, edge1);
    const v = invDet * V.dot(direction, q);
    if (v < -1e-7 || u + v > 1 + 1e-7) return null;
    return invDet * V.dot(edge2, q);
  }

  function isPointHidden(point, basis) {
    const ray = V.sub(point, basis.position);
    const length = V.len(ray);
    if (length < 1e-6) return false;
    const dir = V.mul(ray, 1 / length);
    for (const face of state.model.faces) {
      for (const tri of face.tris) {
        const hit = rayTriangle(basis.position, dir, tri[0], tri[1], tri[2]);
        if (hit !== null && hit > 0.003 && hit < length - 0.025) return true;
      }
    }
    return false;
  }

  function isEdgeHidden(a, b, basis) {
    let hiddenSamples = 0;
    for (const t of [0.28, 0.5, 0.72]) {
      const sample = V.lerp(a, b, t);
      if (isPointHidden(sample, basis)) hiddenSamples++;
    }
    return hiddenSamples >= 2;
  }

  /* ------------------------------------------------------------------ */
  /* Scene drawing                                                       */
  /* ------------------------------------------------------------------ */
  function drawScene() {
    if (!state.model) return;
    sceneCtx.clearRect(0, 0, canvasW, canvasH);
    if (canvasW < 10 || canvasH < 10) return;
    sceneCtx._labelRects = [];

    const banner = $('#questionBanner');
    if (banner && !banner.classList.contains('is-hidden')) {
      const bannerRect = banner.getBoundingClientRect();
      const canvasRect = sceneCanvas.getBoundingClientRect();
      if (bannerRect.width > 0 && bannerRect.height > 0) {
        sceneCtx._labelRects.push({
          left: bannerRect.left - canvasRect.left,
          right: bannerRect.right - canvasRect.left,
          top: bannerRect.top - canvasRect.top,
          bottom: bannerRect.bottom - canvasRect.top
        });
      }
    }

    const basis = cameraBasis();
    const model = state.model;

    if (state.toggles.grid) drawFloorGrid(basis);
    drawFaces(basis);
    drawActivePlaneFills(basis);
    drawEdges(basis);
    drawDerivedGuides(basis);
    drawConstruction(basis);
    drawPlaneLabels(basis);
    drawVerticesAndLabels(basis);
    drawHover(basis);
    drawAxisTriad(basis);
  }

  function drawFloorGrid(basis) {
    const extent = Math.ceil(Math.max(12, state.model.radius * 2.4) / 2) * 2;
    const z = -0.015;
    sceneCtx.save();
    sceneCtx.lineWidth = 1;
    for (let i = -extent; i <= extent; i += 2) {
      const isAxis = i === 0;
      sceneCtx.strokeStyle = isAxis ? 'rgba(215, 242, 226, .105)' : 'rgba(215, 242, 226, .038)';
      drawSegment3D(
        { x: i, y: -extent, z },
        { x: i, y: extent, z },
        basis,
        { color: sceneCtx.strokeStyle, width: 1, dash: [] }
      );
      drawSegment3D(
        { x: -extent, y: i, z },
        { x: extent, y: i, z },
        basis,
        { color: sceneCtx.strokeStyle, width: 1, dash: [] }
      );
    }
    sceneCtx.restore();
  }

  function drawFaces(basis) {
    const visibleFaces = [];
    state.model.faces.forEach((face, index) => {
      const screen = face.verts.map(i => projectPoint(state.model.vertices[i].p, basis));
      if (screen.some(p => !p)) return;
      const depth = screen.reduce((sum, p) => sum + p.depth, 0) / screen.length;
      visibleFaces.push({ face, index, screen, depth });
    });
    visibleFaces.sort((a, b) => b.depth - a.depth);

    for (const item of visibleFaces) {
      const { face, index, screen } = item;
      const color = FACE_COLORS[index % FACE_COLORS.length];
      const xs = screen.map(p => p.x);
      const ys = screen.map(p => p.y);
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      const minY = Math.min(...ys);
      const maxY = Math.max(...ys);

      sceneCtx.beginPath();
      screen.forEach((p, i) => {
        if (i === 0) sceneCtx.moveTo(p.x, p.y);
        else sceneCtx.lineTo(p.x, p.y);
      });
      sceneCtx.closePath();

      const gradient = sceneCtx.createLinearGradient(minX, minY, maxX, maxY);
      gradient.addColorStop(0, toRgba(color, 0.13));
      gradient.addColorStop(0.6, toRgba(color, 0.055));
      gradient.addColorStop(1, toRgba(color, 0.025));
      sceneCtx.fillStyle = gradient;
      sceneCtx.fill();
    }
  }

  function planePatchPoints(plane) {
    const n = plane.n;
    let reference = Math.abs(n.z) < 0.82 ? { x: 0, y: 0, z: 1 } : { x: 1, y: 0, z: 0 };
    let u = V.sub(reference, V.mul(n, V.dot(reference, n)));
    if (V.len(u) < 1e-7) {
      reference = { x: 0, y: 1, z: 0 };
      u = V.sub(reference, V.mul(n, V.dot(reference, n)));
    }
    u = V.norm(u);
    const v = V.norm(V.cross(n, u));
    const extent = clamp(state.model.radius * 1.45, 4.5, 13);
    const c = plane.center;
    return [
      V.add(c, V.add(V.mul(u, -extent), V.mul(v, -extent))),
      V.add(c, V.add(V.mul(u, extent), V.mul(v, -extent))),
      V.add(c, V.add(V.mul(u, extent), V.mul(v, extent))),
      V.add(c, V.add(V.mul(u, -extent), V.mul(v, extent)))
    ];
  }

  function activePlanes() {
    const analysis = state.analysis;
    if (!analysis) return [];
    if (analysis.mode === 'linePlane' && analysis.plane) {
      return [{ plane: analysis.plane, color: PLANE_COLORS.teal, alpha: 0.16, label: false }];
    }
    if (analysis.mode === 'planePlane') {
      const result = [];
      if (analysis.planeA) result.push({ plane: analysis.planeA, color: PLANE_COLORS.teal, alpha: 0.15, label: false });
      if (analysis.planeB) result.push({ plane: analysis.planeB, color: PLANE_COLORS.coral, alpha: 0.13, label: false });
      return result;
    }
    if (analysis.mode === 'inspect' && analysis.kind === 'face' && analysis.plane) {
      return [{ plane: analysis.plane, color: PLANE_COLORS.acid, alpha: 0.15, label: true }];
    }
    return [];
  }

  function drawActivePlaneFills(basis) {
    const planes = activePlanes();
    const labels = [];
    planes.forEach((item, index) => {
      const { plane, color, alpha, label } = item;
      const isCustom = plane.kind === 'custom';
      const points = isCustom ? planePatchPoints(plane) : plane.points;
      const screen = points.map(p => projectPoint(p, basis));
      if (screen.some(p => !p)) return;

      sceneCtx.save();
      sceneCtx.beginPath();
      screen.forEach((p, i) => {
        if (i === 0) sceneCtx.moveTo(p.x, p.y);
        else sceneCtx.lineTo(p.x, p.y);
      });
      sceneCtx.closePath();
      sceneCtx.fillStyle = toRgba(color, alpha * (index === 0 ? 1 : 0.8));
      sceneCtx.fill();

      // Fine parallel hatching gives the plane a surface without hiding the solid.
      const xs = screen.map(p => p.x);
      const ys = screen.map(p => p.y);
      const minX = Math.min(...xs) - 12;
      const maxX = Math.max(...xs) + 12;
      const minY = Math.min(...ys) - 12;
      const maxY = Math.max(...ys) + 12;
      sceneCtx.clip();
      sceneCtx.strokeStyle = toRgba(color, 0.09);
      sceneCtx.lineWidth = 1;
      for (let x = minX - (maxY - minY); x < maxX + (maxY - minY); x += 11) {
        sceneCtx.beginPath();
        sceneCtx.moveTo(x, maxY);
        sceneCtx.lineTo(x + (maxY - minY), minY);
        sceneCtx.stroke();
      }
      sceneCtx.restore();

      sceneCtx.save();
      sceneCtx.beginPath();
      screen.forEach((p, i) => {
        if (i === 0) sceneCtx.moveTo(p.x, p.y);
        else sceneCtx.lineTo(p.x, p.y);
      });
      sceneCtx.closePath();
      sceneCtx.strokeStyle = toRgba(color, 0.58);
      sceneCtx.lineWidth = 1.25;
      sceneCtx.setLineDash(isCustom ? [5, 4] : []);
      sceneCtx.stroke();
      sceneCtx.restore();

      if (label) {
        const center = projectPoint(plane.center, basis);
        if (center) labels.push({ x: center.x, y: center.y, text: `plane ${plane.name}`, color });
      }
    });
    sceneCtx._planeLabels = labels;
  }

  function drawEdges(basis) {
    const hidden = [];
    const visible = [];
    for (const [aIndex, bIndex] of state.model.edges) {
      const a = state.model.vertices[aIndex].p;
      const b = state.model.vertices[bIndex].p;
      const pa = projectPoint(a, basis);
      const pb = projectPoint(b, basis);
      if (!pa || !pb) continue;
      const isHidden = isEdgeHidden(a, b, basis);
      (isHidden ? hidden : visible).push({ a, b });
    }

    if (state.toggles.hiddenEdges) {
      hidden.forEach(edge => {
        drawSegment3D(edge.a, edge.b, basis, {
          color: 'rgba(239, 245, 234, .18)',
          width: 1,
          dash: [4, 4]
        });
      });
    }

    visible.forEach(edge => {
      drawSegment3D(edge.a, edge.b, basis, {
        color: 'rgba(241, 247, 236, .68)',
        width: 1.35,
        dash: []
      });
    });
  }

  function drawDerivedGuides(basis) {
    if (!state.toggles.derivedGuides || !state.model.derived) return;
    state.model.derived.forEach(item => {
      item.guides.forEach(guide => {
        drawSegment3D(guide.from, guide.to, basis, {
          color: 'rgba(121, 169, 255, .32)',
          width: 1.1,
          dash: [4, 4]
        });
      });
    });
  }

  function drawConstruction(basis) {
    const analysis = state.analysis;
    if (!analysis) return;

    if (analysis.mode === 'linePlane') {
      if (analysis.error && !analysis.line) return;
      const { P, Q } = analysis.line;
      drawSegment3D(P, Q, basis, {
        color: 'rgba(216, 255, 106, .98)',
        width: 2.25,
        dash: [],
        shadow: 'rgba(216, 255, 106, .42)',
        shadowBlur: 8
      });

      if (analysis.projectionSegment) {
        drawSegment3D(analysis.projectionSegment.from, analysis.projectionSegment.to, basis, {
          color: 'rgba(126, 174, 255, .9)',
          width: 1.9,
          dash: [6, 5]
        });
      }

      analysis.perpendicularSegments.forEach(segment => {
        drawSegment3D(segment.from, segment.to, basis, {
          color: 'rgba(244, 139, 112, .85)',
          width: 1.35,
          dash: [4, 4]
        });
      });

      if (analysis.feet) {
        analysis.feet.forEach(foot => {
          const screen = projectPoint(foot.point, basis);
          if (!screen) return;
          drawFootMarker(screen, foot.color);
        });
      }

      if (analysis.rightAngle) {
        drawRightAngle(analysis.rightAngle, basis);
      }

      if (!analysis.perpOnly && analysis.anchor && V.len(analysis.projDir) > 0.001) {
        const theta = Math.acos(clamp(V.dot(analysis.lineDir, analysis.projDir), -1, 1));
        drawAngleWedge3D(analysis.anchor, analysis.lineDir, analysis.projDir, analysis.arcRadius, theta, basis, 'rgba(216, 255, 106, .11)');
        drawArc3D(analysis.anchor, analysis.lineDir, analysis.projDir, analysis.arcRadius, theta, basis, {
          color: 'rgba(216, 255, 106, .9)',
          width: 1.45
        });
        const badge = angleBadgePosition(analysis.anchor, analysis.lineDir, analysis.projDir, analysis.arcRadius, theta, basis);
        if (badge) {
          drawPill(badge.x, badge.y, `θ ${fmtFixed(analysis.angleDeg, 1)}°`, {
            bg: '#d8ff6a',
            fg: '#15201c',
            font: '700 10px "Segoe UI", sans-serif',
            border: 'rgba(21,32,28,.18)',
            padX: 7,
            padY: 4
          });
        }
      }
    }

    if (analysis.mode === 'planePlane') {
      if (analysis.error) return;
      if (analysis.parallel) return;
      const inter = analysis.intersection;
      drawSegment3D(inter.from, inter.to, basis, {
        color: 'rgba(216, 255, 106, .95)',
        width: 2.1,
        dash: [8, 5],
        shadow: 'rgba(216, 255, 106, .3)',
        shadowBlur: 7
      });

      const O = inter.point;
      const end1 = V.add(O, V.mul(analysis.u1, analysis.rayLength));
      const end2 = V.add(O, V.mul(analysis.u2, analysis.rayLength));
      drawSegment3D(O, end1, basis, {
        color: 'rgba(96, 231, 190, .98)',
        width: 2.2,
        dash: [],
        shadow: 'rgba(96, 231, 190, .3)',
        shadowBlur: 6
      });
      drawSegment3D(O, end2, basis, {
        color: 'rgba(255, 139, 110, .98)',
        width: 2.2,
        dash: [],
        shadow: 'rgba(255, 139, 110, .3)',
        shadowBlur: 6
      });

      drawAngleWedge3D(O, analysis.u1, analysis.u2, analysis.arcRadius, analysis.angleRad, basis, 'rgba(216, 255, 106, .1)');
      drawArc3D(O, analysis.u1, analysis.u2, analysis.arcRadius, analysis.angleRad, basis, {
        color: 'rgba(216, 255, 106, .9)',
        width: 1.45
      });
      const badge = angleBadgePosition(O, analysis.u1, analysis.u2, analysis.arcRadius, analysis.angleRad, basis);
      if (badge) {
        drawPill(badge.x, badge.y, `β ${fmtFixed(analysis.angleDeg, 1)}°`, {
          bg: '#d8ff6a',
          fg: '#15201c',
          font: '700 10px "Segoe UI", sans-serif',
          border: 'rgba(21,32,28,.18)',
          padX: 7,
          padY: 4
        });
      }
    }

    if (analysis.mode === 'distance') {
      if (analysis.error) return;
      drawSegment3D(analysis.A.p, analysis.B.p, basis, {
        color: 'rgba(216, 255, 106, .98)',
        width: 2.1,
        dash: [],
        shadow: 'rgba(216, 255, 106, .38)',
        shadowBlur: 8
      });
      const mid = V.lerp(analysis.A.p, analysis.B.p, 0.5);
      const midScreen = projectPoint(mid, basis);
      if (midScreen) {
        drawPill(midScreen.x, midScreen.y - 16, `${analysis.name} = ${fmtFixed(analysis.length, 2)}`, {
          bg: '#d8ff6a',
          fg: '#15201c',
          font: '700 10px "Segoe UI", sans-serif',
          border: 'rgba(21,32,28,.18)',
          padX: 7,
          padY: 4
        });
      }
    }
  }

  function drawPlaneLabels(basis) {
    const labels = sceneCtx._planeLabels || [];
    labels.forEach(item => {
      const color = item.color;
      drawPill(item.x, item.y, item.text, {
        bg: 'rgba(8, 17, 13, .78)',
        fg: toRgba(color, 0.95),
        font: '650 8px "Segoe UI", sans-serif',
        border: toRgba(color, 0.35),
        padX: 6,
        padY: 3,
        radius: 5,
        dot: color
      });
    });
  }

  function placeLabel(desiredX, desiredY, text, options = {}) {
    const metrics = measurePill(text, options);
    const offsets = [
      [0, 0], [0, 17], [0, -17], [22, 0], [-22, 0],
      [19, 15], [-19, 15], [19, -15], [-19, -15],
      [0, 33], [0, -33], [34, 0], [-34, 0],
      [0, 51], [0, -51], [51, 0], [-51, 0],
      [0, 68], [0, -68], [68, 0], [-68, 0],
      [38, -34], [-38, -34], [38, 34], [-38, 34]
    ];
    let fallback = null;
    for (const [ox, oy] of offsets) {
      const x = desiredX + ox;
      const y = desiredY + oy;
      const rect = {
        left: x - metrics.width / 2,
        right: x + metrics.width / 2,
        top: y - metrics.height / 2,
        bottom: y + metrics.height / 2
      };
      const inside = rect.left > 4 && rect.top > 4 && rect.right < canvasW - 4 && rect.bottom < canvasH - 4;
      if (!inside) continue;
      if (!fallback) fallback = { x, y };
      const overlaps = (sceneCtx._labelRects || []).some(existing => rectsOverlap(rect, existing, 3));
      if (!overlaps) return { x, y };
    }
    return fallback || { x: desiredX, y: desiredY };
  }

  function drawVerticesAndLabels(basis) {
    if (!state.model) return;
    const analysis = state.analysis;
    const selected = new Set();
    if (analysis) {
      if (analysis.mode === 'linePlane' && analysis.line) {
        selected.add(analysis.line.a.label);
        selected.add(analysis.line.b.label);
      }
      if (analysis.mode === 'distance' && analysis.A && analysis.B) {
        selected.add(analysis.A.label);
        selected.add(analysis.B.label);
      }
      if (analysis.mode === 'inspect' && analysis.kind === 'point') {
        selected.add(analysis.vertex.label);
      }
    }

    const centerScreen = projectPoint(state.model.centroid, basis);
    const labelsToDraw = [];

    state.model.vertices.forEach((vertex, index) => {
      const screen = projectPoint(vertex.p, basis);
      if (!screen) return;
      const isSelected = selected.has(vertex.label);
      const isHovered = state.hoverVertex === index;
      const isDerived = Boolean(vertex.derived);
      const hidden = isPointHidden(vertex.p, basis);
      const markerRadius = isSelected ? 4.2 : (isDerived ? 3.1 : 2.8);

      sceneCtx.save();
      sceneCtx.globalAlpha = hidden ? 0.38 : 1;
      if (isDerived && !isSelected) {
        sceneCtx.save();
        sceneCtx.translate(screen.x, screen.y);
        sceneCtx.rotate(Math.PI / 4);
        sceneCtx.fillStyle = 'rgba(121, 169, 255, .95)';
        sceneCtx.strokeStyle = 'rgba(9, 18, 14, .85)';
        sceneCtx.lineWidth = 1.1;
        sceneCtx.fillRect(-2.8, -2.8, 5.6, 5.6);
        sceneCtx.strokeRect(-2.8, -2.8, 5.6, 5.6);
        sceneCtx.restore();
      } else {
        sceneCtx.beginPath();
        sceneCtx.arc(screen.x, screen.y, markerRadius, 0, Math.PI * 2);
        sceneCtx.fillStyle = isSelected ? '#d8ff6a' : 'rgba(244, 248, 240, .9)';
        sceneCtx.fill();
        sceneCtx.lineWidth = 1.2;
        sceneCtx.strokeStyle = 'rgba(9, 18, 14, .85)';
        sceneCtx.stroke();
      }

      if (isSelected || isHovered) {
        sceneCtx.beginPath();
        sceneCtx.arc(screen.x, screen.y, isSelected ? 9 : 7, 0, Math.PI * 2);
        sceneCtx.strokeStyle = isSelected
          ? 'rgba(216, 255, 106, .45)'
          : (isDerived ? 'rgba(121, 169, 255, .45)' : 'rgba(216, 255, 106, .3)');
        sceneCtx.lineWidth = 1;
        sceneCtx.stroke();
      }
      sceneCtx.restore();

      if (state.toggles.labels) {
        labelsToDraw.push({
          vertex,
          screen,
          selected: isSelected,
          hidden,
          centerScreen,
          index,
          derived: isDerived
        });
      }
    });

    labelsToDraw.forEach(item => {
      const { vertex, screen, selected, hidden, centerScreen, derived } = item;
      let dx = 0;
      let dy = -1;
      if (centerScreen) {
        dx = screen.x - centerScreen.x;
        dy = screen.y - centerScreen.y;
        const len = Math.hypot(dx, dy);
        if (len > 4) {
          dx /= len;
          dy /= len;
        } else {
          dx = 0;
          dy = -1;
        }
      }
      const offset = selected ? 20 : 16;
      const options = {
        bg: selected ? '#d8ff6a' : (derived ? 'rgba(15, 29, 44, .9)' : 'rgba(8, 17, 13, .82)'),
        fg: selected ? '#15201c' : (derived ? '#d8e9ff' : 'rgba(245, 248, 241, .88)'),
        font: '700 10px "Segoe UI", sans-serif',
        border: selected ? 'rgba(21,32,28,.22)' : (derived ? 'rgba(121,169,255,.55)' : 'rgba(255,255,255,.13)'),
        padX: 5,
        padY: 3,
        radius: 5,
        alpha: hidden && !selected ? 0.68 : 1
      };
      const placed = placeLabel(screen.x + dx * offset, screen.y + dy * offset, vertex.label, options);
      const leaderLength = Math.hypot(placed.x - screen.x, placed.y - screen.y);
      if (leaderLength > 23) {
        sceneCtx.save();
        sceneCtx.beginPath();
        sceneCtx.moveTo(screen.x, screen.y);
        sceneCtx.lineTo(placed.x, placed.y);
        sceneCtx.strokeStyle = selected
          ? 'rgba(216,255,106,.5)'
          : (derived ? 'rgba(121,169,255,.35)' : 'rgba(240,245,236,.22)');
        sceneCtx.lineWidth = 1;
        sceneCtx.setLineDash([2, 3]);
        sceneCtx.stroke();
        sceneCtx.restore();
      }
      drawPill(placed.x, placed.y, vertex.label, options);
    });

    if (analysis && analysis.mode === 'linePlane' && analysis.feet) {
      analysis.feet.forEach(foot => {
        const screen = projectPoint(foot.point, basis);
        if (!screen) return;
        const options = {
          bg: 'rgba(10, 23, 19, .78)',
          fg: 'rgba(146, 187, 255, .96)',
          font: '600 8px "Segoe UI", sans-serif',
          border: 'rgba(126,174,255,.28)',
          padX: 4,
          padY: 2,
          radius: 4
        };
        const placed = placeLabel(screen.x + 10, screen.y - 9, foot.label, options);
        drawPill(placed.x, placed.y, foot.label, options);
      });
    }
  }

  function drawHover(basis) {
    if (state.hoverFace !== null && state.hoverFace !== undefined) {
      const face = state.model.faces[state.hoverFace];
      if (face) {
        const screen = face.verts.map(i => projectPoint(state.model.vertices[i].p, basis));
        if (screen.every(Boolean)) {
          sceneCtx.beginPath();
          screen.forEach((p, i) => {
            if (i === 0) sceneCtx.moveTo(p.x, p.y);
            else sceneCtx.lineTo(p.x, p.y);
          });
          sceneCtx.closePath();
          sceneCtx.fillStyle = 'rgba(216, 255, 106, .055)';
          sceneCtx.fill();
          sceneCtx.strokeStyle = 'rgba(216, 255, 106, .28)';
          sceneCtx.lineWidth = 1;
          sceneCtx.stroke();
        }
      }
    }

    if (state.hoverVertex !== null && state.hoverVertex !== undefined) {
      const vertex = state.model.vertices[state.hoverVertex];
      if (vertex) {
        const screen = projectPoint(vertex.p, basis);
        if (screen) {
          sceneCtx.beginPath();
          sceneCtx.arc(screen.x, screen.y, 9, 0, Math.PI * 2);
          sceneCtx.strokeStyle = 'rgba(216, 255, 106, .45)';
          sceneCtx.lineWidth = 1.1;
          sceneCtx.stroke();
        }
      }
    }
  }

  function drawAxisTriad(basis) {
    if (canvasW < 520 || canvasH < 380) return;
    const ox = canvasW - 42;
    const oy = 86;
    const size = 19;
    const axes = [
      { v: { x: 1, y: 0, z: 0 }, color: 'rgba(246, 120, 93, .74)', label: 'x' },
      { v: { x: 0, y: 1, z: 0 }, color: 'rgba(121, 169, 255, .74)', label: 'y' },
      { v: { x: 0, y: 0, z: 1 }, color: 'rgba(216, 255, 106, .74)', label: 'z' }
    ];

    sceneCtx.save();
    sceneCtx.beginPath();
    sceneCtx.arc(ox, oy, 2.4, 0, Math.PI * 2);
    sceneCtx.fillStyle = 'rgba(240, 246, 235, .55)';
    sceneCtx.fill();

    axes.forEach(axis => {
      const dx = V.dot(axis.v, basis.right) * size;
      const dy = -V.dot(axis.v, basis.up) * size;
      sceneCtx.beginPath();
      sceneCtx.moveTo(ox, oy);
      sceneCtx.lineTo(ox + dx, oy + dy);
      sceneCtx.strokeStyle = axis.color;
      sceneCtx.lineWidth = 1.2;
      sceneCtx.stroke();
      sceneCtx.fillStyle = axis.color;
      sceneCtx.font = '700 7px "Cascadia Mono", Consolas, monospace';
      sceneCtx.textAlign = 'center';
      sceneCtx.textBaseline = 'middle';
      sceneCtx.fillText(axis.label, ox + dx * 1.23, oy + dy * 1.23);
    });
    sceneCtx.restore();
  }

  function drawSegment3D(a, b, basis, options = {}) {
    const pa = projectPoint(a, basis);
    const pb = projectPoint(b, basis);
    if (!pa || !pb) return;
    sceneCtx.save();
    sceneCtx.beginPath();
    sceneCtx.moveTo(pa.x, pa.y);
    sceneCtx.lineTo(pb.x, pb.y);
    sceneCtx.strokeStyle = options.color || 'rgba(255,255,255,.6)';
    sceneCtx.lineWidth = options.width || 1;
    sceneCtx.lineCap = 'round';
    sceneCtx.setLineDash(options.dash || []);
    if (options.shadow) {
      sceneCtx.shadowColor = options.shadow;
      sceneCtx.shadowBlur = options.shadowBlur || 6;
    }
    sceneCtx.stroke();
    sceneCtx.restore();
  }

  function drawAngleWedge3D(anchor, u, v, radius, theta, basis, fillStyle) {
    if (!Number.isFinite(theta) || theta < 0.02) return;
    const actual = Math.acos(clamp(V.dot(u, v), -1, 1));
    if (actual < 0.02) return;
    const points = [anchor];
    const steps = 22;
    const sinTheta = Math.sin(actual);
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const a = Math.sin((1 - t) * actual) / sinTheta;
      const b = Math.sin(t * actual) / sinTheta;
      points.push(V.add(anchor, V.mul(V.add(V.mul(u, a), V.mul(v, b)), radius)));
    }
    const screen = points.map(p => projectPoint(p, basis));
    if (screen.some(p => !p)) return;
    sceneCtx.save();
    sceneCtx.beginPath();
    screen.forEach((p, i) => {
      if (i === 0) sceneCtx.moveTo(p.x, p.y);
      else sceneCtx.lineTo(p.x, p.y);
    });
    sceneCtx.closePath();
    sceneCtx.fillStyle = fillStyle;
    sceneCtx.fill();
    sceneCtx.restore();
  }

  function drawArc3D(anchor, u, v, radius, angle, basis, options = {}) {
    if (!Number.isFinite(angle) || angle < 0.02) return;
    const dot = clamp(V.dot(u, v), -1, 1);
    const theta = Math.acos(dot);
    if (theta < 0.02) return;
    const points = [];
    const steps = 26;
    const sinTheta = Math.sin(theta);
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const a = Math.sin((1 - t) * theta) / sinTheta;
      const b = Math.sin(t * theta) / sinTheta;
      points.push(V.add(anchor, V.mul(V.add(V.mul(u, a), V.mul(v, b)), radius)));
    }
    const screen = points.map(p => projectPoint(p, basis));
    if (screen.some(p => !p)) return;
    sceneCtx.save();
    sceneCtx.beginPath();
    screen.forEach((p, i) => {
      if (i === 0) sceneCtx.moveTo(p.x, p.y);
      else sceneCtx.lineTo(p.x, p.y);
    });
    sceneCtx.strokeStyle = options.color || 'rgba(216,255,106,.9)';
    sceneCtx.lineWidth = options.width || 1.4;
    sceneCtx.lineCap = 'round';
    sceneCtx.stroke();
    sceneCtx.restore();
  }

  function arcMidpoint(anchor, u, v, radius, theta) {
    const dot = clamp(V.dot(u, v), -1, 1);
    const actual = Math.acos(dot);
    if (actual < 0.001) return anchor;
    const t = 0.5;
    const a = Math.sin((1 - t) * actual) / Math.sin(actual);
    const b = Math.sin(t * actual) / Math.sin(actual);
    return V.add(anchor, V.mul(V.add(V.mul(u, a), V.mul(v, b)), radius));
  }

  function angleBadgePosition(anchor, u, v, radius, theta, basis) {
    const midPoint = arcMidpoint(anchor, u, v, radius, theta);
    const mid = projectPoint(midPoint, basis);
    const origin = projectPoint(anchor, basis);
    if (!mid) return null;
    if (!origin) return { x: mid.x, y: mid.y - 12 };
    let dx = mid.x - origin.x;
    let dy = mid.y - origin.y;
    const len = Math.hypot(dx, dy);
    if (len < 1) return { x: mid.x, y: mid.y - 12 };
    dx /= len;
    dy /= len;
    return {
      x: clamp(mid.x + dx * 31, 34, canvasW - 34),
      y: clamp(mid.y + dy * 31 - 5, 22, canvasH - 22)
    };
  }

  function drawRightAngle(marker, basis) {
    const { foot, up, planeDir, size } = marker;
    const A = V.add(foot, V.mul(up, size));
    const B = V.add(A, V.mul(planeDir, size));
    const C = V.add(foot, V.mul(planeDir, size));
    const path = [A, B, C];
    const screen = path.map(p => projectPoint(p, basis));
    if (screen.some(p => !p)) return;
    sceneCtx.save();
    sceneCtx.beginPath();
    screen.forEach((p, i) => {
      if (i === 0) sceneCtx.moveTo(p.x, p.y);
      else sceneCtx.lineTo(p.x, p.y);
    });
    sceneCtx.strokeStyle = 'rgba(255, 244, 212, .74)';
    sceneCtx.lineWidth = 1.1;
    sceneCtx.stroke();
    sceneCtx.restore();
  }

  function drawFootMarker(screen, colorKey) {
    const color = colorKey === 'coral' ? 'rgba(255, 139, 110, .95)' : 'rgba(126, 174, 255, .95)';
    sceneCtx.save();
    sceneCtx.beginPath();
    sceneCtx.arc(screen.x, screen.y, 3.2, 0, Math.PI * 2);
    sceneCtx.fillStyle = 'rgba(8, 18, 14, .9)';
    sceneCtx.fill();
    sceneCtx.strokeStyle = color;
    sceneCtx.lineWidth = 1.2;
    sceneCtx.stroke();
    sceneCtx.restore();
  }

  function measurePill(text, options = {}) {
    const font = options.font || '650 9px "Segoe UI", sans-serif';
    const padX = options.padX === undefined ? 6 : options.padX;
    const padY = options.padY === undefined ? 3 : options.padY;
    const dot = options.dot || null;
    sceneCtx.save();
    sceneCtx.font = font;
    const textWidth = sceneCtx.measureText(text).width;
    sceneCtx.restore();
    return {
      width: textWidth + padX * 2 + (dot ? 8 : 0),
      height: parseInt(font.match(/(\d+(?:\.\d+)?)px/)?.[1] || '10', 10) + padY * 2 + 1,
      font,
      padX,
      padY
    };
  }

  function rectsOverlap(a, b, padding = 3) {
    return a.left < b.right + padding && a.right > b.left - padding &&
      a.top < b.bottom + padding && a.bottom > b.top - padding;
  }

  function drawPill(x, y, text, options = {}) {
    const metrics = measurePill(text, options);
    const padX = metrics.padX;
    const padY = metrics.padY;
    const radius = options.radius === undefined ? 6 : options.radius;
    const dot = options.dot || null;
    const width = metrics.width;
    const height = metrics.height;
    const left = x - width / 2;
    const top = y - height / 2;

    if (sceneCtx._labelRects) {
      sceneCtx._labelRects.push({
        left,
        right: left + width,
        top,
        bottom: top + height
      });
    }

    sceneCtx.save();
    sceneCtx.font = metrics.font;
    sceneCtx.globalAlpha = options.alpha === undefined ? 1 : options.alpha;
    roundRect(sceneCtx, left, top, width, height, radius);
    sceneCtx.fillStyle = options.bg || 'rgba(8,17,13,.82)';
    sceneCtx.fill();
    if (options.border) {
      sceneCtx.strokeStyle = options.border;
      sceneCtx.lineWidth = 1;
      sceneCtx.stroke();
    }
    if (dot) {
      sceneCtx.beginPath();
      sceneCtx.arc(left + padX + 2.5, y, 2.2, 0, Math.PI * 2);
      sceneCtx.fillStyle = toRgba(dot, 0.9);
      sceneCtx.fill();
    }
    sceneCtx.fillStyle = options.fg || 'rgba(245,248,241,.9)';
    sceneCtx.textAlign = 'center';
    sceneCtx.textBaseline = 'middle';
    sceneCtx.fillText(text, x + (dot ? 4 : 0), y + 0.2);
    sceneCtx.restore();
  }

  /* ------------------------------------------------------------------ */
  /* Captions, hints, and tool state                                     */
  /* ------------------------------------------------------------------ */
  const TOOL_TITLES = {
    inspect: 'Explore',
    distance: 'Length',
    linePlane: 'Line ↔ Plane',
    planePlane: 'Plane ↔ Plane'
  };

  function renderDerivedPoints() {
    const section = $('#derivedSection');
    const list = $('#derivedList');
    const count = $('#derivedCount');
    if (!section || !list || !count) return;
    const points = state.model && state.model.derived ? state.model.derived : [];
    if (!points.length) {
      section.hidden = true;
      list.innerHTML = '';
      count.textContent = '0';
      return;
    }
    section.hidden = false;
    count.textContent = String(points.length);
    const warning = state.derivedWarnings && state.derivedWarnings.length
      ? `<div class="derived-warning-mini">${escapeHtml(state.derivedWarnings[0])}</div>`
      : '';
    list.innerHTML = points.map(point => `<button class="derived-row" type="button" data-derived-label="${escapeHtml(point.label)}">
      <span class="derived-badge">${escapeHtml(point.label)}</span>
      <span class="derived-copy">
        <strong>Point ${escapeHtml(point.label)}</strong>
        <small>${escapeHtml(point.definitionText || 'Named point')}</small>
        ${point.warning ? `<span class="derived-warning-mini">${escapeHtml(point.warning)}</span>` : ''}
      </span>
    </button>`).join('') + warning;
  }

  function updateCaption() {
    if (!state.model) return;
    const d = state.dims;
    let text = '';
    if (state.shape === 'cuboid') {
      text = `Cuboid · AB ${fmt(d.w, 1)} × BC ${fmt(d.d, 1)} × CG ${fmt(d.h, 1)}`;
    } else if (state.shape === 'triprism') {
      text = `Triangular prism · AB ${fmt(d.w, 1)} × base depth ${fmt(d.d, 1)} × height ${fmt(d.h, 1)}`;
    } else if (state.shape === 'pyramid') {
      text = `Square pyramid · base ${fmt(d.s, 1)} × height ${fmt(d.h, 1)}`;
    } else if (state.shape === 'tetrahedron') {
      text = state.tetra.mode === 'right'
        ? `Right tetrahedron · AB ${fmt(state.tetra.ab, 1)} × AC ${fmt(state.tetra.ac, 1)} × AD ${fmt(state.tetra.ad, 1)}`
        : `Regular tetrahedron · edge ${fmt(d.edge, 1)}`;
    } else if (state.shape === 'custom' && state.custom) {
      const n = state.custom.base.length;
      const label = state.custom.label || (state.custom.kind === 'pyramid' ? 'Photo pyramid' : 'Photo prism');
      text = state.custom.caption || `${label} · base ${fmt(state.custom.width, 1)} × ${fmt(state.custom.depth, 1)} × height ${fmt(state.custom.height, 1)} · ${n} corners`;
    }
    modelCaption.textContent = text;
  }

  function updateQuestionBanner() {
    if (!questionText) return;
    refreshExampleQuestion();
    questionText.innerHTML = state.questionHtml || 'Explore the figure. Choose a tool, then click vertices or faces to see the geometry.';
    const walkthrough = $('#loadWalkthroughBtn');
    if (walkthrough) walkthrough.hidden = !state.exampleId && state.source !== 'text';
    const badge = $('#questionBadge');
    if (badge) {
      badge.textContent = state.exampleId
        ? 'HKDSE style'
        : (state.source === 'text' ? 'Question text' : (state.shape === 'custom' ? 'Photo model' : 'Explore mode'));
    }
  }

  function updateStageHint() {
    const hint = $('#stageHintText');
    if (!hint) return;
    let text = '';
    if (state.tool === 'linePlane') {
      text = state.nextSlot === 'lineA'
        ? 'Click a vertex for the line’s first point · drag to orbit'
        : 'Click a second vertex · or click a face to change the plane';
    } else if (state.tool === 'distance') {
      text = `Click the ${state.nextSlot === 'distanceA' ? 'first' : 'second'} vertex · drag to orbit`;
    } else if (state.tool === 'planePlane') {
      text = `Click a face for plane ${state.nextPlaneSlot} · or use the selects`;
    } else {
      text = 'Click a vertex or face to inspect it · drag to orbit';
    }
    hint.textContent = text;
  }

  function syncToolUI() {
    $$('.tool-button').forEach(button => {
      const active = button.dataset.tool === state.tool;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    workbenchTitle.textContent = TOOL_TITLES[state.tool] || 'Workbench';
    updateStageHint();
    requestRender();
  }

  function setTool(tool) {
    state.tool = tool;
    if (tool === 'linePlane') state.nextSlot = 'lineA';
    if (tool === 'distance') state.nextSlot = 'distanceA';
    if (tool === 'planePlane') {
      state.nextPlaneSlot = 'A';
      if (state.planeAKey === state.planeBKey) {
        const side = getPlanePresets().find(p => p.key !== state.planeAKey && p.role === 'side');
        if (side) state.planeBKey = side.key;
      }
    }
    if (tool === 'inspect' && (!state.inspect || !state.inspect.kind)) {
      state.inspect = { kind: 'face', id: state.model.faces[0]?.id || '' };
    }
    state.analysis = computeAnalysis();
    state.hoverVertex = null;
    state.hoverFace = null;
    syncToolUI();
    renderWorkbench();
  }

  function setActiveView(name) {
    $$('.view-button').forEach(button => {
      button.classList.toggle('is-active', button.dataset.view === name);
    });
  }

  function setView(name) {
    const views = {
      iso: { yaw: -0.86, pitch: 0.36 },
      front: { yaw: -Math.PI / 2, pitch: 0.04 },
      top: { yaw: -Math.PI / 2, pitch: 1.42 },
      side: { yaw: 0, pitch: 0.04 }
    };
    const view = views[name];
    if (!view) return;
    camera.yaw = view.yaw;
    camera.pitch = view.pitch;
    setActiveView(name);
    requestRender();
  }

  function alignToAnglePlane() {
    const analysis = state.analysis && state.analysis.mode === 'linePlane'
      ? state.analysis
      : computeLinePlane();
    if (!analysis || analysis.error || analysis.perpOnly) {
      showToast('The line and its projection must make a visible angle first.');
      return;
    }
    const normal = V.norm(V.cross(analysis.lineDir, analysis.projDir));
    if (V.len(normal) < 0.01) {
      showToast('The angle is 0°, so there is no separate angle plane to view.');
      return;
    }
    // Look along the normal of the plane that contains the line and its
    // projection. The angle θ is then shown without foreshortening.
    camera.yaw = Math.atan2(-normal.y, -normal.x);
    camera.pitch = clamp(Math.asin(clamp(-normal.z, -1, 1)), -1.35, 1.35);
    if (Math.abs(camera.pitch) < 0.08) camera.pitch = 0.08;
    setActiveView('');
    requestRender();
    showToast('Camera aligned to the angle plane. θ is now face-on.');
  }

  /* ------------------------------------------------------------------ */
  /* Workbench UI                                                        */
  /* ------------------------------------------------------------------ */
  function pointOptions(selected) {
    return state.model.vertices.map((vertex, index) => (
      `<option value="${index}" ${index === selected ? 'selected' : ''}>${vertex.label}</option>`
    )).join('');
  }

  function planeOptions(selected) {
    return getPlanePresets().map(preset => (
      `<option value="${preset.key}" ${preset.key === selected ? 'selected' : ''}>${planePresetLabel(preset)}</option>`
    )).join('') + `<option value="custom" ${selected === 'custom' ? 'selected' : ''}>Custom · choose 3 points</option>`;
  }

  function customPlaneFields(prefix, points) {
    return `<div class="custom-plane-fields">
      ${[0, 1, 2].map(i => `<div class="field">
        <label class="field-label" for="${prefix}-${i}">Point ${i + 1}</label>
        <select id="${prefix}-${i}" data-field="${prefix}-${i}">${pointOptions(points[i])}</select>
      </div>`).join('')}
    </div>`;
  }

  function emptyAnalysis(message, icon = 'help') {
    return `<div class="empty-analysis">
      <div class="empty-icon">
        ${icon === 'line'
          ? '<svg viewBox="0 0 22 22" fill="none"><path d="M4 17 18 5M4 17l.3-4M4 17l4-.3M18 5l-.3 4M18 5l-4 .3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>'
          : '<svg viewBox="0 0 22 22" fill="none"><circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="1.3"/><path d="M11 7.4v4.4l3 1.7" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>'}
      </div>
      <strong>Choose a little more</strong>
      <p>${message}</p>
    </div>`;
  }

  function renderWorkbench() {
    if (!state.model) return;
    const analysis = state.analysis || computeAnalysis();
    if (state.tool === 'linePlane') renderLinePlaneWorkbench(analysis);
    else if (state.tool === 'planePlane') renderPlanePlaneWorkbench(analysis);
    else if (state.tool === 'distance') renderDistanceWorkbench(analysis);
    else renderInspectWorkbench(analysis);
    updateStageHint();
  }

  function renderLinePlaneWorkbench(analysis) {
    const lineA = state.lineA;
    const lineB = state.lineB;
    const validResult = analysis && !analysis.error;
    const perpResult = analysis && analysis.perpOnly && Number.isFinite(analysis.angleDeg);
    const planeName = analysis && analysis.plane ? analysis.plane.name : '—';
    const lineName = analysis && analysis.line ? analysis.line.name : '—';
    const showCustom = state.planeAKey === 'custom';

    let resultMarkup = '';
    if (validResult || perpResult) {
      const angle = analysis.angleDeg;
      resultMarkup = `<div class="result-card">
        <div class="result-kicker">Angle between line and plane</div>
        <div class="result-value">${fmtFixed(angle, 1)}<small>°</small></div>
        <div class="result-sub"><b>∠(${lineName}, plane ${planeName})</b> · ${fmtFixed(angle, 2)}° to 2 d.p.</div>
      </div>`;
    } else {
      resultMarkup = `<div class="result-card">
        <div class="result-kicker">Build the angle</div>
        <div class="result-value" style="font-size:32px; color:rgba(241,245,236,.55)">—</div>
        <div class="result-sub">${analysis?.error || 'Choose two points and a plane.'}</div>
      </div>`;
    }

    let workingMarkup = '';
    if (validResult || perpResult) {
      const A = analysis.line.a;
      const B = analysis.line.b;
      const opp = analysis.perpendicular;
      const adj = analysis.projection;
      const hyp = analysis.hypotenuse;
      const angle = analysis.angleDeg;
      const footA = analysis.footALabel || `${A.label}′`;
      const footB = analysis.footQLabel || `${B.label}′`;
      let projectionText = `Drop a perpendicular from each endpoint to the plane. The feet are ${footA} and ${footB}; the projection of <strong>${lineName}</strong> is <strong>${footA}${footB}</strong>.`;
      if (Math.abs(analysis.signedP) < 0.002 && Math.abs(analysis.signedQ) < 0.002) {
        projectionText = `<strong>${lineName}</strong> already lies in plane ${planeName}, so its projection is itself. The line makes a <strong>0°</strong> angle with the plane.`;
      } else if (Math.abs(analysis.signedP) < 0.002) {
        projectionText = `<strong>${A.label}</strong> is already on the plane. Drop a perpendicular from <strong>${B.label}</strong> to meet the plane at <strong>${footB}</strong>. The projection of <strong>${lineName}</strong> is <strong>${A.label}${footB}</strong>.`;
      } else if (Math.abs(analysis.signedQ) < 0.002) {
        projectionText = `<strong>${B.label}</strong> is already on the plane. Drop a perpendicular from <strong>${A.label}</strong> to meet the plane at <strong>${footA}</strong>. The projection of <strong>${lineName}</strong> is <strong>${B.label}${footA}</strong>.`;
      }

      workingMarkup = `<div class="working">
        <div class="working-title">The construction</div>
        <ol class="step-list">
          <li class="step-item">
            <span class="step-marker">1</span>
            <div class="step-copy">
              <strong>Project the line onto plane ${planeName}</strong>
              <p>${projectionText}</p>
              <div class="math-line"><span class="math-tag">PROJECTION</span><span>${fmtFixed(adj, 2)} units</span></div>
            </div>
          </li>
          <li class="step-item">
            <span class="step-marker">2</span>
            <div class="step-copy">
              <strong>Spot the right triangle</strong>
              <p>The perpendicular component is one leg, the projection is the other, and <strong>${lineName}</strong> is the hypotenuse.</p>
              <div class="math-line"><span class="math-tag">OPPOSITE</span><span>${fmtFixed(opp, 2)}</span><span class="math-tag">HYPOTENUSE</span><span>${fmtFixed(hyp, 2)}</span></div>
              ${(!perpResult && angle > 0.2)
                ? '<button class="inline-view-button" type="button" data-action="view-angle-plane"><svg viewBox="0 0 16 16" fill="none"><path d="M2.5 8s2-3.2 5.5-3.2S13.5 8 13.5 8 11.5 11.2 8 11.2 2.5 8 2.5 8Z" stroke="currentColor" stroke-width="1.3"/><circle cx="8" cy="8" r="1.7" fill="currentColor"/></svg>See this angle face-on</button>'
                : ''}
            </div>
          </li>
          <li class="step-item">
            <span class="step-marker">3</span>
            <div class="step-copy">
              <strong>Solve for θ</strong>
              ${adj > 0.0001
                ? `<div class="math-line"><span>tan θ =</span><span class="math-frac"><span>${fmtFixed(opp, 2)}</span><span>${fmtFixed(adj, 2)}</span></span><span>= ${fmtFixed(opp / adj, 4)}</span></div>
                   <div class="math-line"><span>θ = tan<sup>−1</sup>(${fmtFixed(opp / adj, 4)}) = <strong>${fmtFixed(angle, 2)}°</strong></span></div>`
                : `<div class="math-line"><span>θ = 90° because ${lineName} is perpendicular to plane ${planeName}.</span></div>`}
              <div class="answer-note">
                <svg viewBox="0 0 18 18" fill="none"><path d="m9 2 1.6 4.4L15 8l-4.4 1.6L9 14l-1.6-4.4L3 8l4.4-1.6L9 2Z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>
                <span>Answer: <strong>${fmtFixed(angle, 1)}°</strong> (1 d.p.), or <strong>${fmtFixed(angle, 3)}°</strong> to 3 d.p.${perpResult ? ' The line is perpendicular to the plane.' : ''}</span>
              </div>
            </div>
          </li>
        </ol>
      </div>`;
    } else {
      workingMarkup = emptyAnalysis(analysis?.error || 'Pick two vertices for the line and a plane to begin.');
    }

    workbenchBody.innerHTML = `
      <p class="tool-intro">An angle between a line and a plane is the angle between the line and its <strong>projection</strong> on that plane.</p>

      <div class="work-step">
        <div class="work-step-head">
          <span class="work-step-num">1</span>
          <strong>Choose the line</strong>
          <small>two vertices</small>
        </div>
        <div class="field-row">
          <div class="field">
            <label class="field-label" for="line-a">From</label>
            <select id="line-a" data-field="lineA">${pointOptions(lineA)}</select>
          </div>
          <span class="field-arrow" aria-hidden="true">
            <svg viewBox="0 0 16 16" fill="none"><path d="M2.5 8h10m-3.5-3.5L12.5 8 9 11.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </span>
          <div class="field">
            <label class="field-label" for="line-b">To</label>
            <select id="line-b" data-field="lineB">${pointOptions(lineB)}</select>
          </div>
        </div>
      </div>

      <div class="work-step">
        <div class="work-step-head">
          <span class="work-step-num">2</span>
          <strong>Choose the plane</strong>
          <small>click a face too</small>
        </div>
        <div class="field">
          <select data-field="planeA" aria-label="Plane for line–plane angle">${planeOptions(state.planeAKey)}</select>
        </div>
        ${showCustom ? customPlaneFields('customA', state.customA) : ''}
        ${analysis?.error ? `<p class="mini-error">${analysis.error}</p>` : ''}
      </div>

      ${resultMarkup}
      ${workingMarkup}
    `;
  }

  function renderPlanePlaneWorkbench(analysis) {
    const valid = analysis && !analysis.error;
    const planeAName = analysis?.planeA?.name || '—';
    const planeBName = analysis?.planeB?.name || '—';
    const lineLabel = analysis?.intersection?.label;
    const showCustomA = state.planeAKey === 'custom';
    const showCustomB = state.planeBKey === 'custom';

    let resultMarkup = '';
    if (valid) {
      resultMarkup = `<div class="result-card">
        <div class="result-kicker">Angle between the planes</div>
        <div class="result-value">${fmtFixed(analysis.angleDeg, 1)}<small>°</small></div>
        <div class="result-sub"><b>∠(plane ${planeAName}, plane ${planeBName})</b>${analysis.parallel ? ' · the planes are parallel' : ` · ${fmtFixed(analysis.angleDeg, 2)}° to 2 d.p.`}</div>
      </div>`;
    } else {
      resultMarkup = `<div class="result-card">
        <div class="result-kicker">Build the dihedral angle</div>
        <div class="result-value" style="font-size:32px; color:rgba(241,245,236,.55)">—</div>
        <div class="result-sub">${analysis?.error || 'Choose two planes.'}</div>
      </div>`;
    }

    let workingMarkup = '';
    if (valid) {
      if (analysis.parallel) {
        workingMarkup = `<div class="working">
          <div class="working-title">The construction</div>
          <div class="work-card">
            <p>The two planes do not meet, so the angle between them is <strong>0°</strong>. Parallel planes have the same direction everywhere.</p>
          </div>
        </div>`;
      } else {
        workingMarkup = `<div class="working">
          <div class="working-title">The construction</div>
          <ol class="step-list">
            <li class="step-item">
              <span class="step-marker">1</span>
              <div class="step-copy">
                <strong>Find the intersection line</strong>
                <p>The planes meet along ${lineLabel ? `<strong>line ${lineLabel}</strong>` : 'the highlighted line'}. That line is the hinge of the dihedral angle.</p>
              </div>
            </li>
            <li class="step-item">
              <span class="step-marker">2</span>
              <div class="step-copy">
                <strong>Cut perpendicular to the hinge</strong>
                <p>Through a point O on the intersection line, draw one line in each plane, both perpendicular to the hinge. The two coloured rays in the model are that cross-section.</p>
                <button class="inline-view-button" type="button" data-action="view-cross-section">
                  <svg viewBox="0 0 16 16" fill="none"><path d="M2.5 8s2-3.2 5.5-3.2S13.5 8 13.5 8 11.5 11.2 8 11.2 2.5 8 2.5 8Z" stroke="currentColor" stroke-width="1.3"/><circle cx="8" cy="8" r="1.7" fill="currentColor"/></svg>
                  Align the camera to this cross-section
                </button>
              </div>
            </li>
            <li class="step-item">
              <span class="step-marker">3</span>
              <div class="step-copy">
                <strong>Measure between the rays</strong>
                <p>The angle between those two perpendicular rays is the angle between the planes.</p>
                <div class="math-line"><span>β = <strong>${fmtFixed(analysis.angleDeg, 2)}°</strong></span></div>
                <div class="answer-note">
                  <svg viewBox="0 0 18 18" fill="none"><path d="m9 2 1.6 4.4L15 8l-4.4 1.6L9 14l-1.6-4.4L3 8l4.4-1.6L9 2Z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>
                  <span>Answer: <strong>${fmtFixed(analysis.angleDeg, 1)}°</strong> (1 d.p.), or <strong>${fmtFixed(analysis.angleDeg, 3)}°</strong> to 3 d.p.</span>
                </div>
              </div>
            </li>
          </ol>
        </div>`;
      }
    } else {
      workingMarkup = emptyAnalysis(analysis?.error || 'Choose two planes to construct the dihedral angle.');
    }

    workbenchBody.innerHTML = `
      <p class="tool-intro">For two intersecting planes, find the <strong>line of intersection</strong>, then cut a cross-section perpendicular to it.</p>

      <div class="work-step">
        <div class="work-step-head">
          <span class="work-step-num">1</span>
          <strong>First plane</strong>
          <small>teal</small>
        </div>
        <div class="field">
          <select data-field="planeA" aria-label="First plane">${planeOptions(state.planeAKey)}</select>
        </div>
        ${showCustomA ? customPlaneFields('customA', state.customA) : ''}
      </div>

      <div class="work-step">
        <div class="work-step-head">
          <span class="work-step-num">2</span>
          <strong>Second plane</strong>
          <small>coral</small>
        </div>
        <div class="field">
          <select data-field="planeB" aria-label="Second plane">${planeOptions(state.planeBKey)}</select>
        </div>
        ${showCustomB ? customPlaneFields('customB', state.customB) : ''}
        ${analysis?.error ? `<p class="mini-error">${analysis.error}</p>` : ''}
      </div>

      ${resultMarkup}
      ${workingMarkup}
    `;
  }

  function renderDistanceWorkbench(analysis) {
    const valid = analysis && !analysis.error;
    let resultMarkup = `<div class="result-card">
      <div class="result-kicker">Distance between two points</div>
      <div class="result-value" style="font-size:32px; color:rgba(241,245,236,.55)">—</div>
      <div class="result-sub">${analysis?.error || 'Choose two vertices.'}</div>
    </div>`;
    if (valid) {
      resultMarkup = `<div class="result-card">
        <div class="result-kicker">Distance in space</div>
        <div class="result-value">${fmtFixed(analysis.length, 2)}</div>
        <div class="result-sub"><b>|${analysis.name}|</b> · the straight-line distance between the points</div>
      </div>`;
    }

    let workingMarkup = '';
    if (valid) {
      workingMarkup = `<div class="working">
        <div class="working-title">Why it works</div>
        <div class="work-card">
          <p>Subtract the coordinates to get the three perpendicular changes, then apply Pythagoras in 3D.</p>
          <div class="math-line"><span class="math-tag">Δx</span><span>${fmtFixed(analysis.delta.x, 2)}</span><span class="math-tag">Δy</span><span>${fmtFixed(analysis.delta.y, 2)}</span><span class="math-tag">Δz</span><span>${fmtFixed(analysis.delta.z, 2)}</span></div>
          <div class="math-line"><span>|${analysis.name}| = √((${fmtFixed(analysis.delta.x, 2)})² + (${fmtFixed(analysis.delta.y, 2)})² + (${fmtFixed(analysis.delta.z, 2)})²) = <strong>${fmtFixed(analysis.length, 2)}</strong></span></div>
        </div>
      </div>`;
    } else {
      workingMarkup = emptyAnalysis(analysis?.error || 'Choose two different vertices.', 'line');
    }

    workbenchBody.innerHTML = `
      <p class="tool-intro">Measure a straight-line distance in space. The highlighted segment is drawn directly between the two points.</p>

      <div class="work-step">
        <div class="work-step-head">
          <span class="work-step-num">1</span>
          <strong>Choose two points</strong>
          <small>the endpoints</small>
        </div>
        <div class="field-row">
          <div class="field">
            <label class="field-label" for="dist-a">From</label>
            <select id="dist-a" data-field="distanceA">${pointOptions(state.distanceA)}</select>
          </div>
          <span class="field-arrow" aria-hidden="true">
            <svg viewBox="0 0 16 16" fill="none"><path d="M2.5 8h10m-3.5-3.5L12.5 8 9 11.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </span>
          <div class="field">
            <label class="field-label" for="dist-b">To</label>
            <select id="dist-b" data-field="distanceB">${pointOptions(state.distanceB)}</select>
          </div>
        </div>
      </div>

      ${resultMarkup}
      ${workingMarkup}
      ${valid ? `<div class="coordinate-grid" style="margin-top:10px">
        <div class="coord-card"><span>${analysis.A.label} · coordinates</span><strong>(${fmtFixed(analysis.A.p.x, 1)}, ${fmtFixed(analysis.A.p.y, 1)}, ${fmtFixed(analysis.A.p.z, 1)})</strong></div>
        <div class="coord-card"><span>${analysis.B.label} · coordinates</span><strong>(${fmtFixed(analysis.B.p.x, 1)}, ${fmtFixed(analysis.B.p.y, 1)}, ${fmtFixed(analysis.B.p.z, 1)})</strong></div>
      </div>` : ''}
    `;
  }

  function renderInspectWorkbench(analysis) {
    let detail = '';
    if (analysis?.kind === 'point' && analysis.vertex) {
      const v = analysis.vertex;
      detail = `<div class="selected-detail">
        <h3>Point ${v.label}</h3>
        <p>Coordinates in the model: <strong>(${fmtFixed(v.p.x, 2)}, ${fmtFixed(v.p.y, 2)}, ${fmtFixed(v.p.z, 2)})</strong></p>
      </div>
      <div class="coordinate-grid" style="margin-bottom:14px">
        <div class="coord-card"><span>X · sideways</span><strong>${fmtFixed(v.p.x, 2)}</strong></div>
        <div class="coord-card"><span>Y · depth</span><strong>${fmtFixed(v.p.y, 2)}</strong></div>
        <div class="coord-card"><span>Z · height</span><strong>${fmtFixed(v.p.z, 2)}</strong></div>
        <div class="coord-card"><span>Connected to</span><strong>${analysis.adjacentEdges.length ? analysis.adjacentEdges.join(', ') : '—'}</strong></div>
      </div>
      <div class="work-step">
        <div class="work-step-head"><span class="work-step-num">↗</span><strong>Faces through ${v.label}</strong></div>
        <div class="face-list">${analysis.adjacentFaces.map(face => `<button class="face-pill" type="button" data-face-id="${face.id}">${face.name}</button>`).join('')}</div>
      </div>`;
    } else if (analysis?.kind === 'face' && analysis.face) {
      const face = analysis.face;
      const plane = analysis.plane;
      detail = `<div class="selected-detail">
        <h3>Plane ${face.name}</h3>
        <p>${face.role === 'base' ? 'The base plane of the solid.' : face.role === 'top' ? 'The top plane of the solid.' : 'A side face of the solid.'} ${plane ? `Its normal points in (${fmtFixed(plane.n.x, 2)}, ${fmtFixed(plane.n.y, 2)}, ${fmtFixed(plane.n.z, 2)}).` : ''}</p>
      </div>
      <div class="coordinate-grid" style="margin-bottom:14px">
        ${face.verts.map((i, index) => {
          const v = state.model.vertices[i];
          return `<div class="coord-card"><span>Corner ${index + 1} · ${v.label}</span><strong>(${fmtFixed(v.p.x, 1)}, ${fmtFixed(v.p.y, 1)}, ${fmtFixed(v.p.z, 1)})</strong></div>`;
        }).join('')}
      </div>`;
    } else {
      detail = emptyAnalysis(analysis?.error || 'Click a vertex or face in the 3D view.');
    }

    const faceChips = state.model.faces.map(face => {
      const active = analysis?.kind === 'face' && analysis.face?.id === face.id;
      return `<button class="face-pill ${active ? 'is-active' : ''}" type="button" data-face-id="${face.id}">${face.name}</button>`;
    }).join('');

    workbenchBody.innerHTML = `
      <p class="tool-intro">Explore the solid before choosing a measurement. Click any point or face — or pick one from the list.</p>
      ${detail}
      <div class="work-step">
        <div class="work-step-head">
          <span class="work-step-num">◇</span>
          <strong>Faces in this solid</strong>
          <small>${state.model.faces.length} faces</small>
        </div>
        <div class="face-list">${faceChips}</div>
      </div>
      <div class="work-step" style="margin-top:16px">
        <div class="work-step-head"><span class="work-step-num">→</span><strong>Ready to measure?</strong></div>
        <div class="face-list">
          <button class="plane-chip" type="button" data-action="tool-linePlane">Line ↔ plane</button>
          <button class="plane-chip" type="button" data-action="tool-planePlane">Plane ↔ plane</button>
          <button class="plane-chip" type="button" data-action="tool-distance">Length</button>
        </div>
      </div>
    `;
  }

  function handleWorkbenchChange(event) {
    const select = event.target.closest('select[data-field]');
    if (!select) return;
    const field = select.dataset.field;
    if (field === 'lineA' || field === 'lineB') {
      state[field] = Number(select.value);
      state.nextSlot = field === 'lineA' ? 'lineB' : 'lineA';
    } else if (field === 'distanceA' || field === 'distanceB') {
      state[field] = Number(select.value);
      state.nextSlot = field === 'distanceA' ? 'distanceB' : 'distanceA';
    } else if (field === 'planeA' || field === 'planeB') {
      if (field === 'planeA') state.planeAKey = select.value;
      else state.planeBKey = select.value;
      state.nextPlaneSlot = field === 'planeA' ? 'B' : 'A';
    } else if (field.startsWith('customA-')) {
      const index = Number(field.split('-')[1]);
      state.customA[index] = Number(select.value);
    } else if (field.startsWith('customB-')) {
      const index = Number(field.split('-')[1]);
      state.customB[index] = Number(select.value);
    }
    state.analysis = computeAnalysis();
    requestRender();
    renderWorkbench();
  }

  function handleWorkbenchClick(event) {
    const actionButton = event.target.closest('[data-action]');
    if (actionButton) {
      const action = actionButton.dataset.action;
      if (action === 'tool-linePlane') setTool('linePlane');
      else if (action === 'tool-planePlane') setTool('planePlane');
      else if (action === 'tool-distance') setTool('distance');
      else if (action === 'view-cross-section') alignToCrossSection();
      else if (action === 'view-angle-plane') alignToAnglePlane();
      return;
    }
    const faceButton = event.target.closest('[data-face-id]');
    if (faceButton) {
      state.inspect = { kind: 'face', id: faceButton.dataset.faceId };
      if (state.tool !== 'inspect') state.tool = 'inspect';
      state.analysis = computeAnalysis();
      syncToolUI();
      renderWorkbench();
      requestRender();
    }
  }

  /* ------------------------------------------------------------------ */
  /* Dimensions + example questions                                      */
  /* ------------------------------------------------------------------ */
  const EXAMPLE_QUESTIONS = {
    cuboid: () => `The cuboid <em>ABCDEFGH</em> has <em>AB</em> = ${fmt(state.dims.w, 1)}, <em>BC</em> = ${fmt(state.dims.d, 1)} and <em>CG</em> = ${fmt(state.dims.h, 1)}. Find the angle between the line <em>AG</em> and the plane <em>ABCD</em>.`,
    pyramidSlant: () => `The right pyramid <em>VABCD</em> has a square base of side ${fmt(state.dims.s, 1)} and vertical height ${fmt(state.dims.h, 1)}. Find the angle between <em>VA</em> and the plane <em>ABCD</em>.`,
    pyramidDihedral: () => `The right pyramid <em>VABCD</em> has a square base of side ${fmt(state.dims.s, 1)} and vertical height ${fmt(state.dims.h, 1)}. Find the angle between the plane <em>VAB</em> and the base plane <em>ABCD</em>.`
  };

  function refreshExampleQuestion() {
    if (state.exampleId && EXAMPLE_QUESTIONS[state.exampleId]) {
      state.questionHtml = EXAMPLE_QUESTIONS[state.exampleId]();
    }
  }

  function renderDimensions() {
    if (!state.model) return;
    if (state.shape === 'tetrahedron' && state.tetra.mode === 'right') {
      const defs = [
        { key: 'tetraAB', label: 'Edge AB', meta: 'x-axis', value: state.tetra.ab },
        { key: 'tetraAC', label: 'Edge AC', meta: 'y-axis', value: state.tetra.ac },
        { key: 'tetraAD', label: 'Edge AD', meta: 'z-axis', value: state.tetra.ad }
      ];
      dimensionControls.innerHTML = defs.map(def => {
        const pct = ((def.value - 1) / 29) * 100;
        return `<div class="dim-row">
          <div class="dim-top">
            <label class="dim-label" for="dim-${def.key}">${def.label} <span>${def.meta}</span></label>
            <output class="dim-value" id="dim-${def.key}-value">${fmt(def.value, 1)}</output>
          </div>
          <input class="range" id="dim-${def.key}" data-dim="${def.key}" type="range" min="1" max="30" step="0.1" value="${clamp(def.value, 1, 30)}" style="--range-fill:${clamp(pct, 0, 100)}%">
        </div>`;
      }).join('');
      dimensionNote.textContent = 'A right tetrahedron with AB, AC and AD mutually perpendicular at A.';
      return;
    }
    if (state.shape === 'custom' && state.custom) {
      const n = state.custom.base.length;
      const value = state.custom.height;
      const baseW = state.custom.width;
      const baseD = state.custom.depth;
      const fromPhoto = state.custom.origin !== 'text';
      const pctH = ((value - 1) / 29) * 100;
      const pctW = ((baseW - 2) / 28) * 100;
      const pctD = ((baseD - 2) / 28) * 100;
      dimensionControls.innerHTML = `
        <div class="dim-row">
          <div class="dim-top">
            <label class="dim-label" for="dim-custom-h">Height <span>h</span></label>
            <output class="dim-value" id="dim-custom-value">${fmt(value, 1)}</output>
          </div>
          <input class="range" id="dim-custom-h" data-dim="h" type="range" min="1" max="30" step="0.1" value="${value}" style="--range-fill:${pctH}%">
        </div>
        <div class="dim-row">
          <div class="dim-top">
            <label class="dim-label" for="dim-custom-w">Base width <span>X</span></label>
            <output class="dim-value" id="dim-custom-w-value">${fmt(baseW, 1)}</output>
          </div>
          <input class="range" id="dim-custom-w" data-dim="customW" type="range" min="2" max="30" step="0.1" value="${clamp(baseW, 2, 30)}" style="--range-fill:${clamp(pctW, 0, 100)}%">
        </div>
        <div class="dim-row">
          <div class="dim-top">
            <label class="dim-label" for="dim-custom-d">Base depth <span>Y</span></label>
            <output class="dim-value" id="dim-custom-d-value">${fmt(baseD, 1)}</output>
          </div>
          <input class="range" id="dim-custom-d" data-dim="customD" type="range" min="2" max="30" step="0.1" value="${clamp(baseD, 2, 30)}" style="--range-fill:${clamp(pctD, 0, 100)}%">
        </div>
        <div class="coord-card" style="margin-top:2px">
          <span>${fromPhoto ? 'Base traced from photo' : 'Base from question text'}</span>
          <strong>${n} corners · resizable base</strong>
        </div>`;
      dimensionNote.textContent = fromPhoto
        ? 'The base is scaled from your trace. Match the question dimensions before comparing angles.'
        : 'The base is scaled from the question. Height and base extents remain editable.';
      return;
    }

    const info = SHAPE_INFO[state.shape] || SHAPE_INFO.cuboid;
    dimensionControls.innerHTML = info.dims.map(def => {
      const value = state.dims[def.key];
      const pct = ((value - def.min) / (def.max - def.min)) * 100;
      return `<div class="dim-row">
        <div class="dim-top">
          <label class="dim-label" for="dim-${def.key}">${def.label} <span>${def.meta}</span></label>
          <output class="dim-value" id="dim-${def.key}-value">${fmt(value, 1)}</output>
        </div>
        <input class="range" id="dim-${def.key}" data-dim="${def.key}" type="range" min="${def.min}" max="${def.max}" step="${def.step}" value="${value}" style="--range-fill:${pct}%">
      </div>`;
    }).join('');
    dimensionNote.textContent = info.note;
  }

  function updateRangeFill(input) {
    const min = Number(input.min);
    const max = Number(input.max);
    const value = Number(input.value);
    input.style.setProperty('--range-fill', `${((value - min) / (max - min)) * 100}%`);
  }

  function handleDimensionInput(event) {
    const input = event.target.closest('input[data-dim]');
    if (!input) return;
    const value = Number(input.value);
    if (state.shape === 'custom' && state.custom) {
      const field = input.dataset.dim;
      if (field === 'h') {
        state.custom.height = value;
        state.custom.caption = '';
        state.dims.h = value;
        const output = $('#dim-custom-value');
        if (output) output.textContent = fmt(value, 1);
      } else if (field === 'customW') {
        state.custom.width = clamp(value, 2, 30);
        state.custom.caption = '';
        const output = $('#dim-custom-w-value');
        if (output) output.textContent = fmt(state.custom.width, 1);
        rescaleCustomBase();
      } else if (field === 'customD') {
        state.custom.depth = clamp(value, 2, 30);
        state.custom.caption = '';
        const output = $('#dim-custom-d-value');
        if (output) output.textContent = fmt(state.custom.depth, 1);
        rescaleCustomBase();
      }
    } else if (state.shape === 'tetrahedron' && state.tetra.mode === 'right') {
      const field = input.dataset.dim;
      if (field === 'tetraAB') state.tetra.ab = value;
      if (field === 'tetraAC') state.tetra.ac = value;
      if (field === 'tetraAD') state.tetra.ad = value;
      const output = $(`#dim-${field}-value`);
      if (output) output.textContent = fmt(value, 1);
    } else {
      state.dims[input.dataset.dim] = value;
      const output = $(`#dim-${input.dataset.dim}-value`);
      if (output) output.textContent = fmt(value, 1);
    }
    updateRangeFill(input);
    rebuildModel();
    state.analysis = computeAnalysis();
    renderWorkbench();
    requestRender();
  }

  function rescaleCustomBase() {
    if (!state.custom) return;
    const custom = state.custom;
    const sx = custom.width / custom.originWidth;
    const sy = custom.depth / custom.originDepth;
    custom.base = custom.originalBase.map(point => ({
      x: point.x * sx,
      y: point.y * sy
    }));
  }

  function setShape(shape) {
    if (shape === state.shape && shape !== 'custom') {
      // Re-clicking the active template still gives a clean reset.
    }
    state.shape = shape;
    state.custom = null;
    state.exampleId = null;
    state.source = null;
    state.derivedDefinitions = [];
    if (shape === 'cuboid') state.dims = { ...state.dims, w: 8, d: 6, h: 5 };
    if (shape === 'triprism') state.dims = { ...state.dims, w: 8, d: 6, h: 5 };
    if (shape === 'pyramid') state.dims = { ...state.dims, s: 10, h: 12 };
    if (shape === 'tetrahedron') {
      state.dims = { ...state.dims, edge: 6 };
      state.tetra = { mode: 'regular', ab: 6, ac: 6, ad: 6 };
    }
    state.tool = 'inspect';
    rebuildModel({ frame: true });
    resetSelectionsForModel();
    state.analysis = computeAnalysis();
    state.questionHtml = `Explore this ${SHAPE_INFO[shape]?.name.toLowerCase() || 'solid'}. Pick a tool, then click vertices or faces to see the geometry.`;
    updateQuestionBanner();
    $$('.solid-card').forEach(card => {
      const active = card.dataset.shape === shape;
      card.classList.toggle('is-active', active);
      card.setAttribute('aria-pressed', String(active));
    });
    renderDimensions();
    syncToolUI();
    renderWorkbench();
    setActiveView('iso');
    requestRender();
  }

  /* ------------------------------------------------------------------ */
  /* Canvas picking + camera interaction                                 */
  /* ------------------------------------------------------------------ */
  function canvasPoint(event) {
    const rect = sceneCanvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function vertexAt(x, y, basis) {
    let best = null;
    state.model.vertices.forEach((vertex, index) => {
      const screen = projectPoint(vertex.p, basis);
      if (!screen) return;
      const d = Math.hypot(screen.x - x, screen.y - y);
      if (d <= 18 && (!best || d < best.distance || (Math.abs(d - best.distance) < 0.5 && screen.depth < best.depth))) {
        best = { index, screen, distance: d, depth: screen.depth };
      }
    });
    return best;
  }

  function faceAt(x, y, basis) {
    let best = null;
    state.model.faces.forEach((face, index) => {
      const screen = face.verts.map(i => projectPoint(state.model.vertices[i].p, basis));
      if (screen.some(p => !p)) return;
      if (!pointsInsidePolygon(x, y, screen)) return;
      const depth = average(screen).depth;
      if (!best || depth < best.depth) {
        best = { face, index, depth };
      }
    });
    return best;
  }

  function updateHover(x, y) {
    if (!state.model) return;
    const basis = cameraBasis();
    const vertex = vertexAt(x, y, basis);
    const face = vertex ? null : faceAt(x, y, basis);
    const nextVertex = vertex ? vertex.index : null;
    const nextFace = face ? face.index : null;
    if (nextVertex !== state.hoverVertex || nextFace !== state.hoverFace) {
      state.hoverVertex = nextVertex;
      state.hoverFace = nextFace;
      sceneCanvas.classList.toggle('is-picking', Boolean(nextVertex || nextFace));
      requestRender();
    }
  }

  function chooseVertex(index) {
    if (state.tool === 'linePlane') {
      if (state.nextSlot === 'lineA') {
        if (index === state.lineB) {
          showToast('That point is already the other endpoint. Choose a different first point.');
          return;
        }
        state.lineA = index;
        state.nextSlot = 'lineB';
      } else {
        if (index === state.lineA) {
          showToast('A line needs two different endpoints.');
          return;
        }
        state.lineB = index;
        state.nextSlot = 'lineA';
      }
    } else if (state.tool === 'distance') {
      if (state.nextSlot === 'distanceA') {
        if (index === state.distanceB) {
          showToast('That point is already the other endpoint.');
          return;
        }
        state.distanceA = index;
        state.nextSlot = 'distanceB';
      } else {
        if (index === state.distanceA) {
          showToast('Choose two different endpoints.');
          return;
        }
        state.distanceB = index;
        state.nextSlot = 'distanceA';
      }
    } else if (state.tool === 'inspect') {
      state.inspect = { kind: 'point', index };
    }
  }

  function chooseFace(face) {
    if (!face) return;
    if (state.tool === 'linePlane') {
      state.planeAKey = `face:${face.id}`;
    } else if (state.tool === 'planePlane') {
      if (state.nextPlaneSlot === 'A') {
        state.planeAKey = `face:${face.id}`;
        state.nextPlaneSlot = 'B';
      } else {
        state.planeBKey = `face:${face.id}`;
        state.nextPlaneSlot = 'A';
      }
    } else if (state.tool === 'inspect') {
      state.inspect = { kind: 'face', id: face.id };
    }
  }

  function handleCanvasClick(x, y) {
    if (!state.model) return;
    const basis = cameraBasis();
    const vertex = vertexAt(x, y, basis);
    if (vertex) {
      chooseVertex(vertex.index);
    } else {
      const face = faceAt(x, y, basis);
      if (face) {
        chooseFace(face.face);
      } else {
        return;
      }
    }
    state.analysis = computeAnalysis();
    renderWorkbench();
    updateStageHint();
    requestRender();
  }

  const activePointers = new Map();
  let dragState = null;

  function beginDrag(event) {
    const point = { x: event.clientX, y: event.clientY };
    activePointers.set(event.pointerId, point);
    if (activePointers.size === 1) {
      dragState = {
        mode: event.button === 2 || event.shiftKey ? 'pan' : 'orbit',
        startX: event.clientX,
        startY: event.clientY,
        lastX: event.clientX,
        lastY: event.clientY,
        moved: false,
        pointerId: event.pointerId
      };
      sceneCanvas.classList.add('is-dragging');
    } else if (activePointers.size === 2) {
      const pointers = Array.from(activePointers.values());
      const distance = Math.hypot(pointers[0].x - pointers[1].x, pointers[0].y - pointers[1].y);
      dragState = {
        mode: 'pinch',
        startDistance: camera.distance,
        initialPinch: distance,
        moved: true,
        pointerId: event.pointerId
      };
    }
  }

  function moveDrag(event) {
    if (!activePointers.has(event.pointerId)) return;
    activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (!dragState) return;

    if (dragState.mode === 'pinch' && activePointers.size >= 2) {
      const pointers = Array.from(activePointers.values());
      const distance = Math.hypot(pointers[0].x - pointers[1].x, pointers[0].y - pointers[1].y);
      if (dragState.initialPinch > 0 && distance > 0) {
        camera.distance = clamp(dragState.startDistance * dragState.initialPinch / distance, 8, 80);
        requestRender();
      }
      return;
    }

    const dx = event.clientX - dragState.lastX;
    const dy = event.clientY - dragState.lastY;
    dragState.lastX = event.clientX;
    dragState.lastY = event.clientY;
    if (Math.hypot(event.clientX - dragState.startX, event.clientY - dragState.startY) > 4) {
      dragState.moved = true;
    }

    if (dragState.mode === 'orbit') {
      camera.yaw -= dx * 0.0075;
      camera.pitch = clamp(camera.pitch + dy * 0.0065, -1.42, 1.42);
      setActiveView('');
      requestRender();
    } else if (dragState.mode === 'pan') {
      const basis = cameraBasis();
      const factor = camera.distance / (Math.min(canvasW, canvasH) * 1.08);
      camera.target = V.sub(camera.target, V.mul(basis.right, dx * factor));
      camera.target = V.add(camera.target, V.mul(basis.up, dy * factor));
      setActiveView('');
      requestRender();
    }
  }

  function endDrag(event, cancelled = false) {
    const wasClick = dragState && !dragState.moved && dragState.mode !== 'pinch' && !cancelled && event.button === 0;
    activePointers.delete(event.pointerId);
    if (activePointers.size === 0) {
      dragState = null;
      sceneCanvas.classList.remove('is-dragging');
    } else if (activePointers.size === 1) {
      dragState = null;
      sceneCanvas.classList.remove('is-dragging');
    }
    if (wasClick) {
      const point = canvasPoint(event);
      handleCanvasClick(point.x, point.y);
    }
    if (event.pointerType !== 'mouse') {
      state.hoverVertex = null;
      state.hoverFace = null;
      sceneCanvas.classList.remove('is-picking');
      requestRender();
    }
  }

  function bindCanvasInteractions() {
    sceneCanvas.addEventListener('pointerdown', event => {
      if (event.button !== 0 && event.button !== 1 && event.button !== 2) return;
      event.preventDefault();
      sceneCanvas.setPointerCapture(event.pointerId);
      beginDrag(event);
    });

    sceneCanvas.addEventListener('pointermove', event => {
      if (activePointers.has(event.pointerId)) {
        moveDrag(event);
        return;
      }
      if (event.pointerType === 'mouse') {
        const point = canvasPoint(event);
        updateHover(point.x, point.y);
      }
    });

    sceneCanvas.addEventListener('pointerup', event => {
      endDrag(event, false);
      try { sceneCanvas.releasePointerCapture(event.pointerId); } catch (error) { /* noop */ }
    });
    sceneCanvas.addEventListener('pointercancel', event => endDrag(event, true));
    sceneCanvas.addEventListener('pointerleave', () => {
      if (!dragState && state.hoverVertex !== null) {
        state.hoverVertex = null;
        state.hoverFace = null;
        sceneCanvas.classList.remove('is-picking');
        requestRender();
      }
    });
    sceneCanvas.addEventListener('wheel', event => {
      event.preventDefault();
      camera.distance = clamp(camera.distance * Math.exp(event.deltaY * 0.0011), 8, 80);
      requestRender();
    }, { passive: false });
    sceneCanvas.addEventListener('contextmenu', event => event.preventDefault());
    sceneCanvas.addEventListener('dblclick', () => resetCamera());
  }

  /* ------------------------------------------------------------------ */
  /* Toast                                                               */
  /* ------------------------------------------------------------------ */
  let toastTimer = null;

  function showToast(message) {
    const toast = $('#toast');
    const text = $('#toastText');
    if (!toast || !text) return;
    text.textContent = message;
    toast.classList.add('is-visible');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.classList.remove('is-visible'), 2600);
  }

  /* ------------------------------------------------------------------ */
  /* Modals                                                              */
  /* ------------------------------------------------------------------ */
  const modalIds = {
    photo: 'photoModal',
    text: 'textModal',
    examples: 'examplesModal',
    help: 'helpModal'
  };

  function openModal(name) {
    const modal = document.getElementById(modalIds[name]);
    if (!modal) return;
    lastFocusedElement = document.activeElement;
    modal.classList.add('is-open');
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open');
    window.setTimeout(() => {
      const closeButton = modal.querySelector('.modal-close');
      if (closeButton) closeButton.focus({ preventScroll: true });
    }, 40);
  }

  function closeModal(name) {
    const modal = document.getElementById(modalIds[name]);
    if (!modal) return;
    modal.classList.remove('is-open');
    modal.setAttribute('aria-hidden', 'true');
    if (!document.querySelector('.modal.is-open')) {
      document.body.classList.remove('modal-open');
    }
    if (lastFocusedElement && typeof lastFocusedElement.focus === 'function') {
      lastFocusedElement.focus({ preventScroll: true });
    }
  }

  function closeAllModals() {
    Object.keys(modalIds).forEach(name => closeModal(name));
  }

  function handleGlobalKeydown(event) {
    const openModalElement = document.querySelector('.modal.is-open');
    if (event.key === 'Escape' && openModalElement) {
      const name = Object.keys(modalIds).find(key => modalIds[key] === openModalElement.id);
      if (name) closeModal(name);
      return;
    }

    if (event.key === 'Tab' && openModalElement) {
      const focusable = Array.from(openModalElement.querySelectorAll(
        'button:not([disabled]), select:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
      )).filter(element => element.offsetParent !== null);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
      return;
    }

    if (openModalElement) return;
    const tag = document.activeElement?.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;

    if (event.key === 'r' || event.key === 'R') {
      resetCamera();
    } else if (event.key === 'g' || event.key === 'G') {
      const toggle = $('#toggleGrid');
      if (toggle) {
        toggle.checked = !toggle.checked;
        toggle.dispatchEvent(new Event('change', { bubbles: true }));
      }
    } else if (event.key === 'l' || event.key === 'L') {
      const toggle = $('#toggleLabels');
      if (toggle) {
        toggle.checked = !toggle.checked;
        toggle.dispatchEvent(new Event('change', { bubbles: true }));
      }
    } else if (event.key === '?' || (event.key === '/' && event.shiftKey)) {
      openModal('help');
    }
  }

  /* ------------------------------------------------------------------ */
  /* Photo Lab                                                           */
  /* ------------------------------------------------------------------ */
  const photoCanvas = $('#photoCanvas');
  const photoCtx = photoCanvas.getContext('2d');
  let photoW = 1;
  let photoH = 1;
  let photoDpr = 1;
  let photoView = { dx: 0, dy: 0, dw: 1, dh: 1 };

  function photoInputRef() {
    return $('#photoInput');
  }

  function updatePhotoSteps() {
    const valid = photoTraceValid();
    const hasImage = Boolean(photoLab.image);
    const step1 = $('#photoStep1');
    const step2 = $('#photoStep2');
    const step3 = $('#photoStep3');
    [step1, step2, step3].forEach(step => step.classList.remove('is-active', 'is-done'));
    if (!hasImage) {
      step1.classList.add('is-active');
      return;
    }
    step1.classList.add('is-done');
    if (!valid) {
      step2.classList.add('is-active');
    } else {
      step2.classList.add('is-done');
      step3.classList.add('is-active');
    }
  }

  function photoTraceValid() {
    if (photoLab.points.length < 3) return false;
    const area = Math.abs(polygonArea(photoLab.points));
    if (area < 0.0004) return false;
    return !polygonSelfIntersects(photoLab.points);
  }

  function polygonArea(points) {
    let area = 0;
    for (let i = 0; i < points.length; i++) {
      const a = points[i];
      const b = points[(i + 1) % points.length];
      area += a.x * b.y - b.x * a.y;
    }
    return area / 2;
  }

  function segmentsIntersect(a, b, c, d) {
    const cross = (p, q, r) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
    const d1 = cross(a, b, c);
    const d2 = cross(a, b, d);
    const d3 = cross(c, d, a);
    const d4 = cross(c, d, b);
    return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
      ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
  }

  function polygonSelfIntersects(points) {
    if (points.length < 4) return false;
    for (let i = 0; i < points.length; i++) {
      const a = points[i];
      const b = points[(i + 1) % points.length];
      for (let j = i + 1; j < points.length; j++) {
        if (Math.abs(i - j) <= 1) continue;
        if (i === 0 && j === points.length - 1) continue;
        const c = points[j];
        const d = points[(j + 1) % points.length];
        if (segmentsIntersect(a, b, c, d)) return true;
      }
    }
    return false;
  }

  function resizePhotoCanvas() {
    if (!photoLab.image || !$('#photoModal').classList.contains('is-open')) return;
    const wrap = $('#photoCanvasWrap');
    const rect = wrap.getBoundingClientRect();
    if (rect.width < 4 || rect.height < 4) return;
    photoW = rect.width;
    photoH = rect.height;
    photoDpr = Math.min(window.devicePixelRatio || 1, 2.25);
    photoCanvas.width = Math.max(1, Math.round(photoW * photoDpr));
    photoCanvas.height = Math.max(1, Math.round(photoH * photoDpr));
    photoCtx.setTransform(photoDpr, 0, 0, photoDpr, 0, 0);
    drawPhotoCanvas();
  }

  function computePhotoView() {
    if (!photoLab.image) return { dx: 0, dy: 0, dw: 1, dh: 1 };
    const imageAspect = photoLab.image.width / photoLab.image.height;
    const areaAspect = photoW / photoH;
    let dw;
    let dh;
    if (imageAspect > areaAspect) {
      dw = photoW;
      dh = dw / imageAspect;
    } else {
      dh = photoH;
      dw = dh * imageAspect;
    }
    return {
      dx: (photoW - dw) / 2,
      dy: (photoH - dh) / 2,
      dw,
      dh
    };
  }

  function drawPhotoCanvas() {
    if (!photoLab.image) return;
    photoCtx.clearRect(0, 0, photoW, photoH);
    photoView = computePhotoView();

    photoCtx.save();
    photoCtx.fillStyle = 'rgba(0,0,0,.3)';
    photoCtx.fillRect(0, 0, photoW, photoH);
    photoCtx.drawImage(photoLab.image, photoView.dx, photoView.dy, photoView.dw, photoView.dh);
    photoCtx.restore();

    // A very light rule-of-thirds overlay makes tracing feel more deliberate.
    photoCtx.save();
    photoCtx.strokeStyle = 'rgba(255,255,255,.065)';
    photoCtx.lineWidth = 1;
    for (let i = 1; i < 3; i++) {
      const x = photoView.dx + (photoView.dw * i) / 3;
      const y = photoView.dy + (photoView.dh * i) / 3;
      photoCtx.beginPath();
      photoCtx.moveTo(x, photoView.dy);
      photoCtx.lineTo(x, photoView.dy + photoView.dh);
      photoCtx.stroke();
      photoCtx.beginPath();
      photoCtx.moveTo(photoView.dx, y);
      photoCtx.lineTo(photoView.dx + photoView.dw, y);
      photoCtx.stroke();
    }
    photoCtx.restore();

    const screenPoints = photoLab.points.map(p => ({
      x: photoView.dx + p.x * photoView.dw,
      y: photoView.dy + p.y * photoView.dh
    }));

    if (screenPoints.length > 1) {
      photoCtx.save();
      photoCtx.beginPath();
      screenPoints.forEach((p, i) => {
        if (i === 0) photoCtx.moveTo(p.x, p.y);
        else photoCtx.lineTo(p.x, p.y);
      });
      if (screenPoints.length >= 3) {
        photoCtx.closePath();
        photoCtx.fillStyle = 'rgba(216, 255, 106, .08)';
        photoCtx.fill();
      }
      photoCtx.strokeStyle = 'rgba(216, 255, 106, .85)';
      photoCtx.lineWidth = 1.6;
      photoCtx.setLineDash(screenPoints.length >= 3 ? [] : [5, 4]);
      photoCtx.stroke();
      photoCtx.restore();
    }

    screenPoints.forEach((p, i) => {
      photoCtx.save();
      photoCtx.beginPath();
      photoCtx.arc(p.x, p.y, 11, 0, Math.PI * 2);
      photoCtx.fillStyle = '#d8ff6a';
      photoCtx.fill();
      photoCtx.strokeStyle = 'rgba(8, 17, 13, .9)';
      photoCtx.lineWidth = 1.5;
      photoCtx.stroke();
      photoCtx.fillStyle = '#15201c';
      photoCtx.font = '700 9px "Segoe UI", sans-serif';
      photoCtx.textAlign = 'center';
      photoCtx.textBaseline = 'middle';
      photoCtx.fillText(BASE_LETTERS[i] || String(i + 1), p.x, p.y + 0.2);
      photoCtx.restore();
    });
  }

  function updatePhotoTraceUI() {
    const count = photoLab.points.length;
    const valid = photoTraceValid();
    const countEl = $('#traceCount');
    if (countEl) countEl.textContent = String(count);
    const undo = $('#undoTraceBtn');
    const clear = $('#clearTraceBtn');
    if (undo) undo.disabled = count === 0;
    if (clear) clear.disabled = count === 0;
    const quality = $('#traceQuality');
    if (quality) {
      quality.classList.remove('is-good', 'is-warn');
      let text = '';
      if (count === 0) {
        text = 'Waiting for your first corner';
      } else if (count < 3) {
        text = `Add ${3 - count} more ${3 - count === 1 ? 'corner' : 'corners'}`;
      } else if (polygonSelfIntersects(photoLab.points)) {
        quality.classList.add('is-warn');
        text = 'The outline crosses itself — undo a point';
      } else if (Math.abs(polygonArea(photoLab.points)) < 0.0004) {
        quality.classList.add('is-warn');
        text = 'The corners are nearly in a line — spread them out';
      } else {
        quality.classList.add('is-good');
        text = `Base outline ready · ${count} corners`;
      }
      quality.querySelector('span:last-child').textContent = text;
    }
    const build = $('#buildPhotoModelBtn');
    if (build) build.disabled = !valid;
    updatePhotoSteps();
  }

  function applyPhotoUI() {
    const hasImage = Boolean(photoLab.image);
    const drop = $('#photoDrop');
    const canvasWrap = $('#photoCanvasWrap');
    const fileRow = $('#photoFileRow');
    const tip = $('#photoTip');
    const traceTools = $('#traceTools');
    const buildOptions = $('#buildOptions');
    if (drop) drop.hidden = hasImage;
    if (canvasWrap) canvasWrap.hidden = !hasImage;
    if (fileRow) fileRow.hidden = !hasImage;
    if (tip) tip.hidden = hasImage;
    if (traceTools) traceTools.hidden = !hasImage;
    if (buildOptions) buildOptions.hidden = !hasImage;
    if (hasImage) {
      $('#photoFileName').textContent = photoLab.name || 'question.jpg';
    }
    updatePhotoTraceUI();
    if (hasImage) {
      requestAnimationFrame(() => {
        resizePhotoCanvas();
        updatePhotoTraceUI();
      });
    }
  }

  function setPhotoImage(dataUrl, name, resetTrace = true) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => {
        photoLab.image = image;
        photoLab.dataUrl = dataUrl;
        photoLab.name = name || 'question.jpg';
        if (resetTrace) photoLab.points = [];
        applyPhotoUI();
        resolve(image);
      };
      image.onerror = () => reject(new Error('The image could not be opened. Try a JPG or PNG photo.'));
      image.src = dataUrl;
    });
  }

  function showPhotoError(message) {
    const box = $('#photoError');
    const text = $('#photoErrorText');
    if (text) text.textContent = message;
    if (box) box.hidden = false;
  }

  function hidePhotoError() {
    const box = $('#photoError');
    if (box) box.hidden = true;
  }

  function handlePhotoFile(file) {
    hidePhotoError();
    if (!file) return;
    if (!file.size) {
      showPhotoError('That file appears to be empty. Choose a photo or take a screenshot instead.');
      return;
    }
    if (file.size > 60 * 1024 * 1024) {
      showPhotoError('That photo is larger than 60 MB. Try a screenshot or a smaller version of the image.');
      return;
    }

    const name = file.name || 'camera-photo.jpg';
    const lowerName = name.toLowerCase();
    const lowerType = (file.type || '').toLowerCase();
    const looksHeic = /\.(heic|heif)$/.test(lowerName) ||
      lowerType.includes('heic') || lowerType.includes('heif');

    // Object URLs avoid a huge base64 round-trip and work even when a device
    // reports an empty MIME type (which happens with some camera apps).
    let objectUrl;
    try {
      objectUrl = URL.createObjectURL(file);
    } catch (error) {
      showPhotoError('That photo could not be read. Try taking a screenshot of the question and uploading that.');
      return;
    }

    setPhotoImage(objectUrl, name, true)
      .then(() => {
        hidePhotoError();
        const regularise = $('#regulariseBase');
        if (regularise) regularise.checked = true;
        photoLab.regularise = true;
        showToast('Photo loaded. Trace the base corners next.');
      })
      .catch(() => {
        try { URL.revokeObjectURL(objectUrl); } catch (error) { /* noop */ }
        const message = looksHeic
          ? 'This looks like an iPhone HEIC/HEIF photo, which this browser cannot decode. On iPhone, use Settings → Camera → Formats → Most Compatible, or share/export the photo as a JPG, then try again.'
          : 'The browser could not decode this image. Try exporting it as JPG or PNG, or take a screenshot of the question and upload that.';
        showPhotoError(message);
        showToast('Image could not be opened. See the tip above the photo area.');
      });
  }

  function openPhotoLab(options = {}) {
    if (!options.skipReference && !photoLab.image && state.photo?.dataUrl) {
      setPhotoImage(state.photo.dataUrl, state.photo.name, false)
        .then(() => hidePhotoError())
        .catch(() => showPhotoError('The pinned reference image could not be reopened. Please upload it again.'));
    }
    applyPhotoUI();
    openModal('photo');
    requestAnimationFrame(() => {
      resizePhotoCanvas();
      updatePhotoTraceUI();
    });
  }

  function sampleDiagramData() {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="700" viewBox="0 0 900 700">
      <rect width="900" height="700" fill="#f8f4e9"/>
      <rect x="36" y="30" width="828" height="640" rx="4" fill="#fffdf8" stroke="#d8d2c2"/>
      <text x="78" y="92" font-family="Georgia, serif" font-size="26" fill="#15201c">The cuboid ABCDEFGH has AB = 8, BC = 6</text>
      <text x="78" y="128" font-family="Georgia, serif" font-size="26" fill="#15201c">and CG = 5. Find the angle between the line AG</text>
      <text x="78" y="164" font-family="Georgia, serif" font-size="26" fill="#15201c">and the plane ABCD.</text>
      <g stroke="#15201c" stroke-width="2.2" fill="none" stroke-linejoin="round">
        <path d="M170 470 500 560 760 450 430 370Z" fill="#e8f2ea"/>
        <path d="M170 270 500 360 760 250 430 170Z" fill="#eef4e9"/>
        <path d="M170 470V270M500 560V360M760 450V250M430 370V170" stroke-dasharray="7 7" stroke-opacity=".55"/>
        <path d="M170 270 500 360 760 250 430 170 170 270Z"/>
        <path d="M170 470 170 270M500 560 500 360M760 450 760 250M430 370 430 170" stroke-opacity=".85"/>
      </g>
      <g font-family="Arial, sans-serif" font-size="23" font-weight="700" fill="#15201c">
        <text x="148" y="507">A</text><text x="510" y="586">B</text><text x="772" y="478">C</text><text x="414" y="403">D</text>
        <text x="148" y="262">E</text><text x="510" y="351">F</text><text x="772" y="243">G</text><text x="414" y="160">H</text>
      </g>
      <g fill="#d8ff6a" stroke="#15201c" stroke-width="2">
        <circle cx="170" cy="470" r="7"/><circle cx="500" cy="560" r="7"/><circle cx="760" cy="450" r="7"/><circle cx="430" cy="370" r="7"/>
      </g>
    </svg>`;
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }

  async function loadSampleDiagram() {
    try {
      await setPhotoImage(sampleDiagramData(), 'sample-cuboid.svg', true);
      hidePhotoError();
      photoLab.points = [
        { x: 170 / 900, y: 470 / 700 },
        { x: 500 / 900, y: 560 / 700 },
        { x: 760 / 900, y: 450 / 700 },
        { x: 430 / 900, y: 370 / 700 }
      ];
      photoLab.kind = 'prism';
      photoLab.height = 5;
      photoLab.regularise = true;
      const regularise = $('#regulariseBase');
      if (regularise) regularise.checked = true;
      const heightInput = $('#photoHeight');
      if (heightInput) heightInput.value = '5';
      const heightValue = $('#photoHeightValue');
      if (heightValue) heightValue.textContent = '5.0';
      $$('.segmented-button[data-photo-shape]').forEach(button => {
        button.classList.toggle('is-active', button.dataset.photoShape === 'prism');
      });
      drawPhotoCanvas();
      updatePhotoTraceUI();
      showToast('Sample loaded with four base corners traced. Press “Build my 3D model”.');
    } catch (error) {
      showToast(error.message);
    }
  }

  function addPhotoPoint(event) {
    if (!photoLab.image) return;
    const rect = photoCanvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    if (x < photoView.dx || x > photoView.dx + photoView.dw ||
        y < photoView.dy || y > photoView.dy + photoView.dh) {
      return;
    }
    if (photoLab.points.length >= 8) {
      showToast('Eight corners is the limit. Build a simpler base or undo a point.');
      return;
    }
    const point = {
      x: clamp((x - photoView.dx) / photoView.dw, 0, 1),
      y: clamp((y - photoView.dy) / photoView.dh, 0, 1)
    };
    const last = photoLab.points[photoLab.points.length - 1];
    if (last && Math.hypot(point.x - last.x, point.y - last.y) < 0.012) return;
    photoLab.points.push(point);
    drawPhotoCanvas();
    updatePhotoTraceUI();
  }

  function setPhotoReference(dataUrl, name) {
    state.photo = { dataUrl, name };
    const thumb = $('#photoThumb');
    const reference = $('#photoReference');
    if (thumb) thumb.src = dataUrl;
    if (reference) reference.classList.add('has-photo');
    reference?.classList.remove('is-empty');
  }

  function clearPhotoReference() {
    state.photo = null;
    const thumb = $('#photoThumb');
    const reference = $('#photoReference');
    if (thumb) thumb.removeAttribute('src');
    if (reference) reference.classList.remove('has-photo');
    reference?.classList.add('is-empty');
  }

  function buildModelFromPhoto() {
    if (!photoLab.image || !photoTraceValid()) return;
    const n = photoLab.points.length;
    const pixelPoints = photoLab.points.map(p => ({
      x: p.x * photoLab.image.width,
      y: p.y * photoLab.image.height
    }));
    const xs = pixelPoints.map(p => p.x);
    const ys = pixelPoints.map(p => p.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const span = Math.max(maxX - minX, maxY - minY);
    if (span < 4) {
      showToast('Trace a larger base outline on the photo.');
      return;
    }
    const scale = 9 / span;
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    let base = pixelPoints.map(p => ({
      x: (p.x - cx) * scale,
      y: -(p.y - cy) * scale
    }));

    if (photoLab.regularise && n === 4) {
      const side1 = Math.hypot(base[1].x - base[0].x, base[1].y - base[0].y);
      const side2 = Math.hypot(base[2].x - base[1].x, base[2].y - base[1].y);
      const side3 = Math.hypot(base[3].x - base[2].x, base[3].y - base[2].y);
      const side4 = Math.hypot(base[0].x - base[3].x, base[0].y - base[3].y);
      let rectW = (side1 + side3) / 2;
      let rectD = (side2 + side4) / 2;
      if (rectW > 0.2 && rectD > 0.2) {
        const rectScale = 9 / Math.max(rectW, rectD);
        rectW = clamp(rectW * rectScale, 2.5, 12);
        rectD = clamp(rectD * rectScale, 2.5, 12);
        base = [
          { x: -rectW / 2, y: -rectD / 2 },
          { x: rectW / 2, y: -rectD / 2 },
          { x: rectW / 2, y: rectD / 2 },
          { x: -rectW / 2, y: rectD / 2 }
        ];
      }
    } else if (photoLab.regularise && n === 3) {
      const sideAB = Math.hypot(base[1].x - base[0].x, base[1].y - base[0].y);
      const baseVec = { x: base[1].x - base[0].x, y: base[1].y - base[0].y };
      const baseLen = Math.hypot(baseVec.x, baseVec.y);
      const depth = baseLen > 0.001
        ? Math.abs((base[2].x - base[0].x) * baseVec.y - (base[2].y - base[0].y) * baseVec.x) / baseLen
        : 0;
      if (sideAB > 0.2 && depth > 0.2) {
        const triScale = 9 / Math.max(sideAB, depth);
        const triW = clamp(sideAB * triScale, 2.5, 12);
        const triD = clamp(depth * triScale, 2.5, 12);
        base = [
          { x: -triW / 2, y: -triD / 2 },
          { x: triW / 2, y: -triD / 2 },
          { x: 0, y: triD / 2 }
        ];
      }
    }

    let area = 0;
    for (let i = 0; i < base.length; i++) {
      const a = base[i];
      const b = base[(i + 1) % base.length];
      area += a.x * b.y - b.x * a.y;
    }
    if (area < 0) base = base.slice().reverse();

    state.shape = 'custom';
    const baseWidth = Math.max(...base.map(p => p.x)) - Math.min(...base.map(p => p.x));
    const baseDepth = Math.max(...base.map(p => p.y)) - Math.min(...base.map(p => p.y));
    state.custom = {
      base,
      kind: photoLab.kind,
      height: photoLab.height,
      label: photoLab.kind === 'pyramid' ? 'Photo pyramid' : 'Photo prism',
      width: Math.max(1.5, baseWidth),
      depth: Math.max(1.5, baseDepth),
      originalBase: base.map(p => ({ ...p })),
      originWidth: Math.max(0.001, baseWidth),
      originDepth: Math.max(0.001, baseDepth),
      origin: 'photo'
    };
    state.dims.h = photoLab.height;
    state.exampleId = null;
    state.source = 'photo';
    state.derivedDefinitions = [];
    state.model = buildCustomModel(base, photoLab.kind, photoLab.height);
    const n2 = state.model.vertices.length;
    state.lineA = 0;
    state.lineB = photoLab.kind === 'pyramid'
      ? n2 - 1
      : n + Math.ceil(n / 2);
    state.planeAKey = 'face:base';
    state.planeBKey = 'face:side-0';
    state.distanceA = 0;
    state.distanceB = n2 - 1;
    state.nextSlot = 'lineA';
    state.nextPlaneSlot = 'A';
    state.inspect = { kind: 'face', id: 'base' };
    state.tool = 'linePlane';
    state.questionHtml = `Your photo model has a ${n}-corner base. Orbit it, pick a line and a plane, then watch the angle construction update.`;
    state.analysis = computeAnalysis();
    autoFrame();
    setPhotoReference(photoLab.dataUrl, photoLab.name);
    updateSolidCards();
    updateCaption();
    renderDimensions();
    syncToolUI();
    renderWorkbench();
    updateQuestionBanner();
    renderDerivedPoints();
    setActiveView('');
    const banner = $('#questionBanner');
    banner?.classList.remove('is-hidden');
    closeModal('photo');
    requestRender();
    showToast(`${photoLab.kind === 'pyramid' ? 'Pyramid' : 'Prism'} built from your photo. Use the base and height sliders to correct the model.`);
    if (window.innerWidth <= 980) {
      window.setTimeout(() => stageEl.scrollIntoView({ behavior: 'smooth', block: 'start' }), 160);
    }
  }

  function skipPhotoAndUseReference() {
    if (photoLab.image) {
      setPhotoReference(photoLab.dataUrl, photoLab.name);
      showToast('Photo pinned beside your model for reference.');
    }
    closeModal('photo');
  }

  function bindPhotoLab() {
    $('#openPhotoBtn')?.addEventListener('click', openPhotoLab);
    $('#leftPhotoBtn')?.addEventListener('click', openPhotoLab);
    $('#miniPhotoBtn')?.addEventListener('click', openPhotoLab);
    $('#captionPhotoBtn')?.addEventListener('click', openPhotoLab);
    $('#choosePhotoBtn')?.addEventListener('click', () => photoInputRef()?.click());
    $('#takePhotoBtn')?.addEventListener('click', () => $('#cameraInput')?.click());
    $('#replacePhotoBtn')?.addEventListener('click', () => photoInputRef()?.click());
    $('#samplePhotoBtn')?.addEventListener('click', loadSampleDiagram);
    $('#photoErrorChoose')?.addEventListener('click', () => photoInputRef()?.click());

    $('#photoInput')?.addEventListener('change', event => {
      handlePhotoFile(event.target.files?.[0]);
      event.target.value = '';
    });
    $('#cameraInput')?.addEventListener('change', event => {
      handlePhotoFile(event.target.files?.[0]);
      event.target.value = '';
    });

    photoCanvas.addEventListener('pointerdown', event => {
      if (event.button !== 0) return;
      event.preventDefault();
      addPhotoPoint(event);
    });

    $('#undoTraceBtn')?.addEventListener('click', () => {
      photoLab.points.pop();
      drawPhotoCanvas();
      updatePhotoTraceUI();
    });
    $('#clearTraceBtn')?.addEventListener('click', () => {
      photoLab.points = [];
      drawPhotoCanvas();
      updatePhotoTraceUI();
    });

    $$('.segmented-button[data-photo-shape]').forEach(button => {
      button.addEventListener('click', () => {
        photoLab.kind = button.dataset.photoShape;
        $$('.segmented-button[data-photo-shape]').forEach(item => {
          item.classList.toggle('is-active', item === button);
        });
      });
    });

    $('#photoHeight')?.addEventListener('input', event => {
      photoLab.height = Number(event.target.value);
      $('#photoHeightValue').textContent = photoLab.height.toFixed(1);
    });

    $('#regulariseBase')?.addEventListener('change', event => {
      photoLab.regularise = event.target.checked;
    });

    $('#buildPhotoModelBtn')?.addEventListener('click', buildModelFromPhoto);
    $('#skipPhotoBtn')?.addEventListener('click', skipPhotoAndUseReference);
    $('#clearPhotoRef')?.addEventListener('click', clearPhotoReference);

    const drop = $('#photoDrop');
    if (drop) {
      ['dragenter', 'dragover'].forEach(type => {
        drop.addEventListener(type, event => {
          event.preventDefault();
          drop.classList.add('is-over');
        });
      });
      ['dragleave', 'drop'].forEach(type => {
        drop.addEventListener(type, event => {
          event.preventDefault();
          drop.classList.remove('is-over');
        });
      });
      drop.addEventListener('drop', event => {
        const file = event.dataTransfer?.files?.[0];
        handlePhotoFile(file);
      });
      drop.addEventListener('click', event => {
        if (event.target.closest('button, a, input')) return;
        photoInputRef()?.click();
      });
    }

    // A photo can be dropped anywhere on the page, not just on the dashed box.
    document.addEventListener('dragover', event => {
      if (!event.dataTransfer) return;
      if (Array.from(event.dataTransfer.types || []).includes('Files')) {
        event.preventDefault();
      }
    });
    document.addEventListener('drop', event => {
      const file = event.dataTransfer?.files?.[0];
      if (!file) return;
      if (event.target.closest?.('#photoDrop')) return;
      event.preventDefault();
      if ($('#textModal').classList.contains('is-open')) {
        scanTextPhoto(file);
        return;
      }
      if (!$('#photoModal').classList.contains('is-open')) openPhotoLab({ skipReference: true });
      handlePhotoFile(file);
    });
    document.addEventListener('paste', event => {
      if ($('#photoModal').classList.contains('is-open') && document.activeElement?.tagName === 'INPUT') return;
      const files = Array.from(event.clipboardData?.files || []);
      let file = files.find(item => item.type.startsWith('image/')) || files[0];
      if (!file) {
        const item = Array.from(event.clipboardData?.items || []).find(entry => entry.kind === 'file' && entry.type.startsWith('image/'));
        if (item) file = item.getAsFile();
      }
      if (!file) return;
      event.preventDefault();
      if ($('#textModal').classList.contains('is-open')) {
        scanTextPhoto(file);
        return;
      }
      if (!$('#photoModal').classList.contains('is-open')) openPhotoLab({ skipReference: true });
      handlePhotoFile(file);
    });

    $$('[data-close-modal="photo"]').forEach(button => {
      button.addEventListener('click', () => closeModal('photo'));
    });
  }

  /* ------------------------------------------------------------------ */
  /* Question Reader                                                     */
  /* ------------------------------------------------------------------ */
  const OCR_SCRIPT_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
  const TEXT_EXAMPLE_QUESTIONS = {
    cuboid: 'The cuboid ABCDEFGH has AB = 8, BC = 6 and CG = 5. Find the angle between the line AG and the plane ABCD.',
    pyramidSlant: 'The right pyramid VABCD has a square base of side 10 and vertical height 12. Find the angle between VA and the plane ABCD.',
    pyramidDihedral: 'The right pyramid VABCD has a square base of side 10 and vertical height 12. Find the angle between the plane VAB and the base plane ABCD.',
    triPrism: 'The triangular prism ABCDEF has AB = 8, BC = 6, CA = 10 and height 12. Find the angle between BD and the plane ABC.',
    tetra: 'The regular tetrahedron ABCD has edge length 6. Find the angle between AD and the plane ABC.',
    namedPoints: 'The cuboid ABCDEFGH has AB = 8, BC = 6 and CG = 5. V is the point on BC. N is the intersection of the diagonals AC and BD. Find the angle between VG and the plane ABCD.'
  };

  let currentTextParse = null;
  let textParseTimer = null;
  let textOcrBusy = false;
  let ocrScriptPromise = null;

  const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, character => HTML_ESCAPES[character]);
  }

  function normalizeQuestionText(raw) {
    return String(raw || '')
      .replace(/[−–—]/g, '-')
      .replace(/[×✕]/g, ' x ')
      .replace(/[∠]/g, 'angle ')
      .replace(/[°]/g, ' degrees ')
      .replace(/\u00a0/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function parseLabelValues(upperText) {
    const values = {};
    const conflicts = [];
    const stopwords = new Set([
      'BY', 'IS', 'IN', 'TO', 'AT', 'AS', 'OF', 'ON', 'OR', 'IF', 'IT', 'WE',
      'HE', 'BE', 'DO', 'SO', 'NO', 'UP', 'US', 'AN', 'CM', 'MM', 'KM', 'MG',
      'ML', 'MR', 'MS', 'OK'
    ]);
    const addValue = (label, value) => {
      if (stopwords.has(label)) return;
      const number = Number(value);
      if (!Number.isFinite(number) || number <= 0) return;
      if (values[label] === undefined) {
        values[label] = number;
      } else if (Math.abs(values[label] - number) > 1e-7) {
        conflicts.push(`${label} appears as both ${values[label]} and ${number}`);
      }
    };

    const equalsPattern = /\b([A-Z]{2})\s*(?:=|:|\bIS\b)\s*(\d+(?:\.\d+)?)/gi;
    let match;
    while ((match = equalsPattern.exec(upperText)) !== null) {
      addValue(match[1], match[2]);
    }

    const unitPattern = /\b([A-Z]{2})\s+(\d+(?:\.\d+)?)\s*(?:CM|MM|M|UNITS?)\b/gi;
    while ((match = unitPattern.exec(upperText)) !== null) {
      addValue(match[1], match[2]);
    }

    return { values, conflicts };
  }

  function firstPairValue(values, labels) {
    for (const label of labels) {
      if (Number.isFinite(values[label])) return values[label];
    }
    return null;
  }

  function parseTriple(text) {
    const match = text.match(
      /(?:dimensions?|measures?|measuring)?\s*(\d+(?:\.\d+)?)\s*(?:cm|mm|m|units?)?\s*(?:by|x)\s*(\d+(?:\.\d+)?)\s*(?:cm|mm|m|units?)?\s*(?:by|x)\s*(\d+(?:\.\d+)?)/i
    );
    return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
  }

  function keywordNumber(text, patterns) {
    for (const pattern of patterns) {
      const match = pattern.exec(text);
      if (match) {
        const value = Number(match[1]);
        if (Number.isFinite(value) && value > 0) return value;
      }
    }
    return null;
  }

  function parseVerticalHeight(text) {
    const matches = Array.from(text.matchAll(/\bheight\b[^.\d]{0,45}?(\d+(?:\.\d+)?)/gi));
    for (const match of matches) {
      const before = text.slice(Math.max(0, match.index - 14), match.index).toLowerCase();
      if (!/slant|lateral|inclined/.test(before)) {
        const value = Number(match[1]);
        if (Number.isFinite(value) && value > 0) return value;
      }
    }
    return null;
  }

  function detectTextSolid(text, upperText) {
    const lower = text.toLowerCase();
    if (/\bcuboid\b|\bcube\b|\brectangular\s+(?:prism|block|box)\b|\b(?:rectangular\s+)?box\b/.test(lower)) {
      return { solid: 'cuboid', unsupported: false };
    }
    if (/\btetrahedron\b/.test(lower)) {
      const right = /right\s+tetrahedron|tri-?rectangular|three\s+mutually\s+perpendicular|mutually\s+perpendicular/.test(lower);
      return { solid: 'tetrahedron', subtype: right ? 'right' : 'regular', unsupported: false };
    }
    if (/\btriangular\s+prism\b/.test(lower) ||
        (/\bprism\b/.test(lower) && /\btriangular\s+base\b/.test(lower))) {
      return { solid: 'triprism', unsupported: false };
    }
    if (/\btriangular\s+pyramid\b/.test(lower) ||
        (/\bpyramid\b/.test(lower) && /\btriangular\s+base\b/.test(lower))) {
      return { solid: 'triPyramid', unsupported: false };
    }
    if (/\brectangular\s+pyramid\b/.test(lower) ||
        (/\bpyramid\b/.test(lower) && /\brectangular\s+base\b/.test(lower))) {
      return { solid: 'rectPyramid', unsupported: false };
    }
    const compactLabels = upperText.replace(/[^A-Z]/g, '');
    const hasFourVertexPyramid = /V[A-D]{4}/.test(compactLabels);
    const hasThreeVertexPyramid = /V[A-C]{3}/.test(compactLabels) && !hasFourVertexPyramid;
    const abBase = text.match(/\bAB\s*=\s*(\d+(?:\.\d+)?)/i);
    const bcBase = text.match(/\b(?:BC|AD)\s*=\s*(\d+(?:\.\d+)?)/i);
    if (/\bpyramid\b/.test(lower) && !/\bsquare\b/.test(lower) && abBase && bcBase &&
        Math.abs(Number(abBase[1]) - Number(bcBase[1])) > 1e-7 && hasFourVertexPyramid) {
      return { solid: 'rectPyramid', unsupported: false };
    }
    if (hasThreeVertexPyramid) {
      return { solid: 'triPyramid', unsupported: false };
    }
    if (/\b(?:square[- ]based\s+)?(?:right\s+)?pyramid\b/.test(lower)) {
      return { solid: 'pyramid', unsupported: false };
    }
    if (/\bprism\b/.test(lower)) {
      return { solid: 'prism', unsupported: true };
    }
    if (/V[A-C]{3}/.test(upperText.replace(/[^A-Z]/g, ''))) {
      return { solid: 'triPyramid', unsupported: false };
    }
    if (/V[A-D]{4}/.test(upperText.replace(/[^A-Z]/g, ''))) {
      return { solid: 'pyramid', unsupported: false };
    }
    if (/[A-H]{8}/.test(upperText.replace(/[^A-Z]/g, ''))) {
      return { solid: 'cuboid', unsupported: false };
    }
    return { solid: null, unsupported: false };
  }

  function extractTextTarget(upperText) {
    const linePlanePatterns = [
      /ANGLE\s+BETWEEN\s+(?:THE\s+)?(?:LINE|EDGE)\s+([A-Z]{2})\s+AND\s+(?:THE\s+)?(?:PLANE|BASE(?:\s+PLANE)?)\s*([A-Z]{2,4}|BASE)/i,
      /ANGLE\s+BETWEEN\s+(?:THE\s+)?(?:LINE|EDGE)\s+([A-Z]{2})\s+AND\s+(?:THE\s+)?([A-Z]{2,4})/i,
      /ANGLE\s+BETWEEN\s+([A-Z]{2})\s+AND\s+(?:THE\s+)?(?:PLANE|BASE(?:\s+PLANE)?)\s*([A-Z]{2,4}|BASE)/i,
      /ANGLE\s+BETWEEN\s+([A-Z]{2})\s+AND\s+(?:THE\s+)?(?:PLANE\s+)?([A-Z]{3,4})/i,
      /ANGLE\s+BETWEEN\s+([A-Z])\s*([A-Z])\s+AND\s+(?:THE\s+)?(?:PLANE\s+)?([A-Z](?:\s*[A-Z]){2,3})/i,
      /ANGLE\s*\(\s*([A-Z]{2})\s*,\s*([A-Z]{2,4})\s*\)/i,
      /ANGLE\s+(?:THAT\s+)?([A-Z]{2})\s+(?:MAKES?|FORMS?)\s+WITH\s+(?:THE\s+)?(?:PLANE\s+)?([A-Z]{3,4})/i,
      /ANGLE\s+([A-Z])\s*([A-Z])\s+(?:MAKES?|FORMS?)\s+WITH\s+(?:THE\s+)?(?:PLANE\s+)?([A-Z](?:\s*[A-Z]){2,3})/i
    ];

    const planePlanePatterns = [
      /ANGLE\s+BETWEEN\s+(?:THE\s+)?PLANES?\s+([A-Z]{2,4}|BASE)\s+AND\s+(?:THE\s+)?(?:PLANE\s+|BASE\s+PLANE\s+|BASE\s+)?([A-Z]{2,4}|BASE)/i,
      /ANGLE\s+BETWEEN\s+(?:THE\s+)?(?:PLANE|FACE)\s+([A-Z]{2,4}|BASE)\s+AND\s+(?:THE\s+)?(?:PLANE\s+|BASE\s+PLANE\s+|FACE\s+|BASE\s+)?([A-Z]{2,4}|BASE)/i,
      /ANGLE\s+BETWEEN\s+(?:THE\s+)?PLANES?\s+([A-Z]{2,4}|BASE)\s+AND\s+([A-Z]{2,4}|BASE)/i,
      /ANGLE\s*\(\s*([A-Z]{3,4})\s*,\s*([A-Z]{3,4})\s*\)/i
    ];

    for (const pattern of planePlanePatterns) {
      const match = upperText.match(pattern);
      if (match) {
        return {
          type: 'planePlane',
          planeA: match[1].toUpperCase(),
          planeB: match[2].toUpperCase(),
          raw: match[0]
        };
      }
    }

    for (const pattern of linePlanePatterns) {
      const match = upperText.match(pattern);
      if (match) {
        const hasSplitLine = match.length > 3 && match[3] !== undefined;
        return {
          type: 'linePlane',
          line: (hasSplitLine ? `${match[1]}${match[2]}` : match[1]).toUpperCase(),
          planeA: (hasSplitLine ? match[3] : match[2]).replace(/\s+/g, '').toUpperCase(),
          raw: match[0]
        };
      }
    }

    const distanceBetween = upperText.match(/DISTANCE\s+(?:BETWEEN|FROM)\s+([A-Z])\s+(?:AND|TO)\s+([A-Z])/i);
    if (distanceBetween) {
      return {
        type: 'distance',
        pointA: distanceBetween[1].toUpperCase(),
        pointB: distanceBetween[2].toUpperCase(),
        raw: distanceBetween[0]
      };
    }
    const lengthOf = upperText.match(/(?:LENGTH\s+OF\s+|FIND\s+(?:THE\s+)?LENGTH\s+OF\s+)([A-Z]{2})(?:\s|$|\.)/i);
    if (lengthOf) {
      return {
        type: 'distance',
        line: lengthOf[1].toUpperCase(),
        raw: lengthOf[0]
      };
    }

    return { type: 'none', raw: '' };
  }

  function resolveTextLine(token, model) {
    const clean = String(token || '').toUpperCase().replace(/[^A-Z]/g, '');
    if (clean.length !== 2) return { error: `“${token}” is not a two-letter line.` };
    const labels = clean.split('');
    const indices = labels.map(label => model.vertices.findIndex(vertex => vertex.label === label));
    if (indices.some(index => index < 0)) {
      return { error: `Line ${clean} uses labels that are not in this model.` };
    }
    return { key: clean, indices, label: clean };
  }

  function resolveTextPlane(token, model) {
    const clean = String(token || '').toUpperCase().replace(/[^A-Z]/g, '');
    if (!clean) return { error: 'A plane label is missing.' };
    if (clean === 'BASE' || clean === 'BASEPLANE') {
      const base = model.faces.find(face => face.role === 'base');
      return base
        ? { key: `face:${base.id}`, name: base.name, indices: base.verts.slice(), label: base.name, custom: null }
        : { error: 'No base plane was found.' };
    }
    if (clean === 'TOP') {
      const top = model.faces.find(face => face.role === 'top');
      return top
        ? { key: `face:${top.id}`, name: top.name, indices: top.verts.slice(), label: top.name, custom: null }
        : { error: 'No top plane was found.' };
    }

    const labels = clean.split('');
    const indices = labels.map(label => model.vertices.findIndex(vertex => vertex.label === label));
    if (indices.some(index => index < 0)) {
      return { error: `Plane ${clean} uses labels that are not in this model.` };
    }

    const sorted = indices.slice().sort((a, b) => a - b).join(',');
    const preset = getPlanePresets(model).find(item => {
      return item.verts.slice().sort((a, b) => a - b).join(',') === sorted;
    });
    if (preset) {
      return {
        key: preset.key,
        name: preset.name,
        indices: preset.verts.slice(),
        label: preset.name,
        custom: null
      };
    }
    if (indices.length >= 3) {
      return {
        key: 'custom',
        name: clean,
        indices: indices.slice(),
        label: clean,
        custom: indices.slice(0, 3)
      };
    }
    return { error: `Plane ${clean} needs at least three points.` };
  }

  function resolveTextTarget(target, model) {
    if (!target || target.type === 'none') return { ...target, resolved: false };
    if (target.type === 'linePlane') {
      const line = resolveTextLine(target.line, model);
      const plane = resolveTextPlane(target.planeA, model);
      if (line.error || plane.error) {
        return { ...target, resolved: false, error: line.error || plane.error };
      }
      return { ...target, resolved: true, lineResult: line, planeAResolved: plane, planeBResolved: null };
    }
    if (target.type === 'planePlane') {
      const planeA = resolveTextPlane(target.planeA, model);
      const planeB = resolveTextPlane(target.planeB, model);
      if (planeA.error || planeB.error) {
        return { ...target, resolved: false, error: planeA.error || planeB.error };
      }
      return { ...target, resolved: true, planeAResolved: planeA, planeBResolved: planeB };
    }
    if (target.type === 'distance') {
      const lineToken = target.line || `${target.pointA}${target.pointB}`;
      const line = resolveTextLine(lineToken, model);
      if (line.error) return { ...target, resolved: false, error: line.error };
      return { ...target, resolved: true, lineResult: line };
    }
    return { ...target, resolved: false };
  }

  function triangleBaseFromSides(ab, bc, ca) {
    if (![ab, bc, ca].every(value => Number.isFinite(value) && value > 0)) return null;
    if (ab + bc <= ca + 1e-7 || ab + ca <= bc + 1e-7 || bc + ca <= ab + 1e-7) return null;
    const c = ab;
    const a = bc;
    const b = ca;
    const cx = (b * b + c * c - a * a) / (2 * c);
    const cySquared = b * b - cx * cx;
    if (cySquared <= 0) return null;
    const raw = [
      { x: 0, y: 0 },
      { x: c, y: 0 },
      { x: cx, y: Math.sqrt(cySquared) }
    ];
    const center = {
      x: (raw[0].x + raw[1].x + raw[2].x) / 3,
      y: (raw[0].y + raw[1].y + raw[2].y) / 3
    };
    return raw.map(point => ({ x: point.x - center.x, y: point.y - center.y }));
  }

  function rectangleBaseFromSides(width, depth) {
    const w = width / 2;
    const d = depth / 2;
    return [
      { x: -w, y: -d },
      { x: w, y: -d },
      { x: w, y: d },
      { x: -w, y: d }
    ];
  }

  function customStateFromSpec(spec) {
    const base = spec.base.map(point => ({ x: point.x, y: point.y }));
    const xs = base.map(point => point.x);
    const ys = base.map(point => point.y);
    const width = Math.max(...xs) - Math.min(...xs);
    const depth = Math.max(...ys) - Math.min(...ys);
    return {
      base,
      kind: spec.kind,
      height: spec.height,
      label: spec.label,
      caption: spec.caption || '',
      width: Math.max(1.5, width),
      depth: Math.max(1.5, depth),
      originalBase: base.map(point => ({ ...point })),
      originWidth: Math.max(0.001, width),
      originDepth: Math.max(0.001, depth),
      origin: 'text'
    };
  }

  function extractPointDefinitions(text) {
    const found = [];
    const source = String(text || '').replace(
      /\b(?:the\s+)?point\s+([A-Z])\s+(?=(?:is|lies|be|divides)\b)/gi,
      '$1 '
    );
    const add = (definition, index) => {
      if (definition && definition.label) found.push({ index, definition });
    };
    const scan = (pattern, build) => {
      for (const match of source.matchAll(pattern)) {
        const definition = build(match);
        if (definition) add(definition, match.index);
      }
    };

    // Midpoint: "M is the midpoint of BC", "the midpoint of BC is M".
    scan(/\b(?:let\s+)?([A-Z])\s+(?:is|be)\s+the\s+mid-?point\s+of\s+([A-Z]{2})\b/gi, match => ({
      label: match[1].toUpperCase(),
      type: 'midpoint',
      a: match[2][0].toUpperCase(),
      b: match[2][1].toUpperCase(),
      text: `midpoint of ${match[2].toUpperCase()}`
    }));
    scan(/\bthe\s+mid-?point\s+of\s+([A-Z]{2})\s+is\s+([A-Z])\b/gi, match => ({
      label: match[2].toUpperCase(),
      type: 'midpoint',
      a: match[1][0].toUpperCase(),
      b: match[1][1].toUpperCase(),
      text: `midpoint of ${match[1].toUpperCase()}`
    }));

    // Intersection: "N is the intersection of AC and BD".
    scan(/\b(?:let\s+)?([A-Z])\s+(?:is|be)\s+(?:the\s+)?(?:(?:point|pt\.?)\s+of\s+)?intersection\s+of\s+(?:the\s+)?(?:diagonals?\s+)?([A-Z]{2})\s+and\s+([A-Z]{2})\b/gi, match => ({
      label: match[1].toUpperCase(),
      type: 'intersection',
      line1: [match[2][0].toUpperCase(), match[2][1].toUpperCase()],
      line2: [match[3][0].toUpperCase(), match[3][1].toUpperCase()],
      text: `intersection of ${match[2].toUpperCase()} and ${match[3].toUpperCase()}`
    }));
    scan(/\b(?:the\s+)?(?:diagonals?\s+)?([A-Z]{2})\s+and\s+([A-Z]{2})\s+(?:intersect|meet)\s+at\s+([A-Z])\b/gi, match => ({
      label: match[3].toUpperCase(),
      type: 'intersection',
      line1: [match[1][0].toUpperCase(), match[1][1].toUpperCase()],
      line2: [match[2][0].toUpperCase(), match[2][1].toUpperCase()],
      text: `intersection of ${match[1].toUpperCase()} and ${match[2].toUpperCase()}`
    }));
    scan(/\b(?:the\s+)?(?:point\s+of\s+)?intersection\s+of\s+(?:the\s+)?(?:diagonals?\s+)?([A-Z]{2})\s+and\s+([A-Z]{2})\s+is\s+([A-Z])\b/gi, match => ({
      label: match[3].toUpperCase(),
      type: 'intersection',
      line1: [match[1][0].toUpperCase(), match[1][1].toUpperCase()],
      line2: [match[2][0].toUpperCase(), match[2][1].toUpperCase()],
      text: `intersection of ${match[1].toUpperCase()} and ${match[2].toUpperCase()}`
    }));

    // Point dividing a segment in a ratio.
    scan(/\b(?:let\s+)?([A-Z])\s+(?:is\s+)?(?:the\s+)?(?:a\s+)?(?:point|pt\.?)\s+on\s+([A-Z]{2})\s*,?\s*(?:such\s+that\s+)?([A-Z])([A-Z])\s*:\s*([A-Z])([A-Z])\s*=\s*(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)\b/gi, match => {
      const label = match[1].toUpperCase();
      const first = `${match[3]}${match[4]}`.toUpperCase();
      const second = `${match[5]}${match[6]}`.toUpperCase();
      let a;
      let b;
      if (first[1] === label && second[0] === label) {
        a = first[0];
        b = second[1];
      } else if (first[0] === label && second[1] === label) {
        a = first[1];
        b = second[0];
      } else {
        return null;
      }
      const m = Number(match[7]);
      const n = Number(match[8]);
      if (m + n <= 0) return null;
      return {
        label,
        type: 'ratio',
        a,
        b,
        t: m / (m + n),
        text: `${first}:${second} = ${fmt(m, 2)}:${fmt(n, 2)} on ${match[2].toUpperCase()}`
      };
    });

    // Distance along a segment: "BV = 3 cm".
    scan(/\b(?:let\s+)?([A-Z])\s+(?:is\s+)?(?:the\s+)?(?:a\s+)?(?:point|pt\.?)\s+on\s+([A-Z]{2})\s+such\s+that\s+([A-Z])([A-Z])\s*=\s*(\d+(?:\.\d+)?)/gi, match => {
      const label = match[1].toUpperCase();
      const segment = `${match[2]}`.toUpperCase();
      const pair = `${match[3]}${match[4]}`.toUpperCase();
      let a;
      let b;
      if (pair[1] === label && (segment[0] === pair[0] || segment[1] === pair[0])) {
        a = pair[0];
        b = segment[0] === pair[0] ? segment[1] : segment[0];
      } else if (pair[0] === label && (segment[0] === pair[1] || segment[1] === pair[1])) {
        a = pair[1];
        b = segment[0] === pair[1] ? segment[1] : segment[0];
      } else {
        return null;
      }
      return {
        label,
        type: 'distance',
        a,
        b,
        distance: Number(match[5]),
        text: `${pair} = ${fmt(Number(match[5]), 2)} on ${segment}`
      };
    });

    // Unspecified point on a segment: place it at the midpoint, with a warning.
    scan(/\b(?:let\s+)?([A-Z])\s+(?:is|be)\s+(?:the\s+)?(?:a\s+)?(?:point|pt\.?)\s+on\s+([A-Z]{2})\b(?!\s+(?:such\s+that|where))/gi, match => ({
      label: match[1].toUpperCase(),
      type: 'ratio',
      a: match[2][0].toUpperCase(),
      b: match[2][1].toUpperCase(),
      t: 0.5,
      assumed: true,
      text: `on ${match[2].toUpperCase()} (midpoint assumed)`
    }));
    scan(/\b([A-Z])\s+is\s+on\s+([A-Z]{2})\b(?!\s+(?:such\s+that|where))/gi, match => ({
      label: match[1].toUpperCase(),
      type: 'ratio',
      a: match[2][0].toUpperCase(),
      b: match[2][1].toUpperCase(),
      t: 0.5,
      assumed: true,
      text: `on ${match[2].toUpperCase()} (midpoint assumed)`
    }));
    scan(/\b([A-Z])\s+lies\s+on\s+([A-Z]{2})\b(?!\s+(?:such\s+that|where))/gi, match => ({
      label: match[1].toUpperCase(),
      type: 'ratio',
      a: match[2][0].toUpperCase(),
      b: match[2][1].toUpperCase(),
      t: 0.5,
      assumed: true,
      text: `on ${match[2].toUpperCase()} (midpoint assumed)`
    }));

    // Segment division written after the point name.
    scan(/\b([A-Z])\s+divides\s+([A-Z]{2})\s+in\s+the\s+ratio\s+(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)/gi, match => {
      const m = Number(match[3]);
      const n = Number(match[4]);
      if (m + n <= 0) return null;
      return {
        label: match[1].toUpperCase(),
        type: 'ratio',
        a: match[2][0].toUpperCase(),
        b: match[2][1].toUpperCase(),
        t: m / (m + n),
        text: `divides ${match[2].toUpperCase()} in the ratio ${fmt(m, 2)}:${fmt(n, 2)}`
      };
    });

    // Centre of a face/base.
    scan(/\b(?:let\s+)?([A-Z])\s+(?:is|be)\s+the\s+(?:centre|center)\s+of\s+(?:the\s+)?(?:base\s+)?([A-Z]{3,4}|base)\b/gi, match => ({
      label: match[1].toUpperCase(),
      type: 'center',
      planeToken: match[2].toUpperCase(),
      text: `centre of ${match[2].toUpperCase()}`
    }));

    // Foot of a perpendicular to a plane.
    scan(/\b(?:let\s+)?([A-Z])\s+(?:is|be)\s+the\s+foot(?:\s+of\s+the\s+perpendicular)?\s+from\s+([A-Z])\s+to\s+(?:the\s+)?plane\s+([A-Z]{3,4})\b/gi, match => ({
      label: match[1].toUpperCase(),
      type: 'footPlane',
      source: match[2].toUpperCase(),
      planeToken: match[3].toUpperCase(),
      text: `foot of perpendicular from ${match[2].toUpperCase()} to plane ${match[3].toUpperCase()}`
    }));

    // Foot of a perpendicular to a line.
    scan(/\b(?:let\s+)?([A-Z])\s+(?:is|be)\s+the\s+foot(?:\s+of\s+the\s+perpendicular)?\s+from\s+([A-Z])\s+to\s+(?:the\s+)?(?:line\s+)?([A-Z]{2})\b/gi, match => ({
      label: match[1].toUpperCase(),
      type: 'footLine',
      source: match[2].toUpperCase(),
      a: match[3][0].toUpperCase(),
      b: match[3][1].toUpperCase(),
      text: `foot of perpendicular from ${match[2].toUpperCase()} to ${match[3].toUpperCase()}`
    }));

    return found
      .sort((a, b) => a.index - b.index)
      .map(item => item.definition);
  }

  function buildParseSpec(spec) {
    if (!spec) return null;
    if (spec.type === 'shape') {
      if (spec.shape === 'cuboid') return buildCuboid(spec.dims.w, spec.dims.d, spec.dims.h);
      if (spec.shape === 'pyramid') return buildPyramid(spec.dims.s, spec.dims.h);
      return null;
    }
    if (spec.type === 'custom') {
      return buildCustomModel(spec.base, spec.kind, spec.height);
    }
    if (spec.type === 'tetrahedron') {
      return spec.mode === 'right'
        ? buildRightTetrahedron(spec.ab, spec.ac, spec.ad)
        : buildRegularTetrahedron(spec.edge);
    }
    return null;
  }

  function parseQuestionText(raw) {
    const original = String(raw || '').trim();
    const normalized = normalizeQuestionText(original);
    const upper = normalized.toUpperCase();
    const lower = normalized.toLowerCase();
    const { solid, unsupported, subtype } = detectTextSolid(normalized, upper);
    const warnings = [];
    const missing = [];

    if (!original) {
      return {
        empty: true, original, normalized, solid: null, subtype: null, unsupported: false,
        dims: null, spec: null, target: { type: 'none' }, warnings, missing,
        complete: false, model: null
      };
    }

    if (!solid) {
      missing.push('solid type');
      return {
        empty: false, original, normalized, solid: null, subtype: null, unsupported: false,
        dims: null, spec: null, target: extractTextTarget(upper), warnings, missing,
        complete: false, model: null
      };
    }

    if (unsupported) {
      warnings.push(
        solid === 'prism'
          ? 'Say “triangular prism” so the base shape is clear, or use the Triangular prism template.'
          : 'This solid is not supported by the text reader yet. Try the template or Photo Lab.'
      );
      return {
        empty: false, original, normalized, solid, subtype, unsupported: true,
        dims: null, spec: null, target: extractTextTarget(upper), warnings, missing,
        complete: false, model: null
      };
    }

    const { values, conflicts } = parseLabelValues(upper);
    conflicts.forEach(conflict => warnings.push(`${conflict}; the first value was used.`));
    const triple = parseTriple(normalized);
    let dims = null;
    let spec = null;

    if (solid === 'cuboid') {
      let w = firstPairValue(values, ['AB', 'CD', 'EF', 'GH']);
      let d = firstPairValue(values, ['BC', 'AD', 'FG', 'EH']);
      let h = firstPairValue(values, ['CG', 'AE', 'BF', 'DH']);
      const length = keywordNumber(lower, [/\blength\s*(?:=|is|:)?\s*(\d+(?:\.\d+)?)/i]);
      const width = keywordNumber(lower, [/\bwidth\s*(?:=|is|:)?\s*(\d+(?:\.\d+)?)/i]);
      const depth = keywordNumber(lower, [/\bdepth\s*(?:=|is|:)?\s*(\d+(?:\.\d+)?)/i, /\bbreadth\s*(?:=|is|:)?\s*(\d+(?:\.\d+)?)/i]);
      const height = keywordNumber(lower, [/\bheight\s*(?:=|is|:)?\s*(\d+(?:\.\d+)?)/i]);
      if (w === null) w = length ?? (triple ? triple[0] : null);
      if (d === null) d = depth ?? width ?? (triple ? triple[1] : null);
      if (h === null) h = height ?? (triple ? triple[2] : null);
      if (/\bcube\b/.test(lower)) {
        const cubeSide = keywordNumber(normalized, [
          /\bside(?:\s+length)?\s*(?:=|is|:)?\s*(\d+(?:\.\d+)?)/i,
          /\bedge(?:\s+length)?\s*(?:=|is|:)?\s*(\d+(?:\.\d+)?)/i
        ]) ?? w ?? d ?? h;
        if (cubeSide !== null) {
          w = cubeSide;
          d = cubeSide;
          h = cubeSide;
        }
      }
      if (w === null) missing.push('width AB');
      if (d === null) missing.push('depth BC');
      if (h === null) missing.push('height CG');
      if (w !== null && d !== null && h !== null) {
        dims = { w, d, h };
        spec = { type: 'shape', shape: 'cuboid', dims };
      }
    } else if (solid === 'pyramid') {
      let side = firstPairValue(values, ['AB', 'BC', 'CD', 'DA']);
      if (side === null) {
        side = keywordNumber(normalized, [
          /\b(?:base\s+side|side\s+of\s+(?:the\s+)?(?:square\s+)?base|base\s+edge|side\s+length)\s*(?:of\s+(?:length\s+)?)?(?:=|is|:)?\s*(\d+(?:\.\d+)?)/i,
          /\bsquare\s+base\s+(?:of|with)?\s*(?:side|edge)\s*(?:length\s+)?(?:=|is|:)?\s*(\d+(?:\.\d+)?)/i,
          /\bbase\s+(?:is\s+)?(?:a\s+)?square\s+(?:of|with)\s+side\s*(\d+(?:\.\d+)?)/i,
          /\bbase(?:\s+[A-Z]{2,4})?\s+(?:of|with)\s+side\s*(?:length\s+)?(?:=|is|:)?\s*(\d+(?:\.\d+)?)/i,
          /\bbase(?:\s+[A-Z]{2,4})?\s+is\s+(?:a\s+)?square\s+(?:of|with)\s+side\s*(\d+(?:\.\d+)?)/i,
          /\b[A-Z]{2,4}\s+is\s+(?:a\s+)?square\s+(?:of|with)\s+side\s*(\d+(?:\.\d+)?)/i,
          /\bsquare\s+base(?:\s+[A-Z]{2,4})?\s+(?:of|with)?\s*(?:side|edge)\s*(?:length\s+)?(?:=|is|:)?\s*(\d+(?:\.\d+)?)/i,
          /\b(?:side|edge)\s+(?:of\s+)?(?:length\s+)?(\d+(?:\.\d+)?)/i,
          /\b[A-Z]{2,4}\s+of\s+side\s*(?:length\s+)?(?:=|is|:)?\s*(\d+(?:\.\d+)?)/i,
          /\bside\s*(?:=|is|:)?\s*(\d+(?:\.\d+)?)/i
        ]);
      }
      if (side === null) {
        const basePair = normalized.match(/\bbase\s*(?:=|is|:)?\s*(\d+(?:\.\d+)?)\s*(?:cm|mm|m|units?)?\s*(?:by|x)\s*(\d+(?:\.\d+)?)/i);
        if (basePair) {
          side = Number(basePair[1]);
          if (Math.abs(Number(basePair[1]) - Number(basePair[2])) > 1e-7) {
            warnings.push('The base dimensions look rectangular; this model uses a square base.');
          }
        }
      }
      let height = firstPairValue(values, ['VO', 'VX', 'VM', 'VN']);
      if (height === null) {
        const pairLabel = Object.keys(values).find(label => label.startsWith('V') && !['VA', 'VB', 'VC', 'VD'].includes(label));
        if (pairLabel) height = values[pairLabel];
      }
      if (height === null) height = parseVerticalHeight(normalized);
      if (side === null) missing.push('base side');
      if (height === null) missing.push('vertical height');
      if (side !== null && height !== null) {
        dims = { s: side, h: height };
        spec = { type: 'shape', shape: 'pyramid', dims };
      }
      if (!/\bsquare\b/.test(lower)) {
        warnings.push('No “square base” was found, so this reader assumes a square base.');
      }
    } else if (solid === 'triprism') {
      let ab = firstPairValue(values, ['AB']);
      let bc = firstPairValue(values, ['BC']);
      let ca = firstPairValue(values, ['CA', 'AC']);
      const equilateral = keywordNumber(normalized, [
        /\bequilateral\s+(?:triangle|base)?\s*(?:of\s+)?(?:side|edge)?\s*(?:length\s+)?(?:=|is|:)?\s*(\d+(?:\.\d+)?)/i,
        /\bequilateral\s+triangular\s+(?:prism|base)\b[^.\d]{0,25}?\b(?:side|edge)\b[^.\d]{0,10}?(\d+(?:\.\d+)?)/i,
        /\bregular\s+(?:triangular\s+)?(?:base|prism)\b[^.\d]{0,20}?\b(?:side|edge)\b[^.\d]{0,10}?(\d+(?:\.\d+)?)/i
      ]);
      if (equilateral !== null) {
        if (ab === null) ab = equilateral;
        if (bc === null) bc = equilateral;
        if (ca === null) ca = equilateral;
      }
      if (ca === null && ab !== null && bc !== null &&
          (/right[- ]angled\s+(?:triangle\s+)?(?:[A-Z]{3}\s+)?(?:at\s+)?B|right[- ]angled\s+at\s+B|angle\s+ABC\s*=\s*90|(?:AB|BA)\s*(?:⊥|is\s+perpendicular\s+to|perpendicular\s+to)\s*(?:BC|CB)|(?:AB|BA)\s+and\s+(?:BC|CB)\s+are\s+perpendicular/i.test(normalized))) {
        ca = Math.sqrt(ab * ab + bc * bc);
      }
      let height = firstPairValue(values, ['AD', 'BE', 'CF']);
      if (height === null) height = parseVerticalHeight(normalized);
      if (ab === null) missing.push('AB');
      if (bc === null) missing.push('BC');
      if (ca === null) missing.push('CA');
      if (height === null) missing.push('prism height');
      if (ab !== null && bc !== null && ca !== null && height !== null) {
        const base = triangleBaseFromSides(ab, bc, ca);
        if (!base) {
          warnings.push('Those three base lengths do not form a triangle. Check AB, BC and CA.');
        } else {
          dims = { ab, bc, ca, h: height, kind: 'triprism' };
          spec = {
            type: 'custom',
            base,
            kind: 'prism',
            height,
            label: 'Triangular prism',
            caption: `Triangular prism · AB ${fmt(ab, 1)} × BC ${fmt(bc, 1)} × CA ${fmt(ca, 1)} × height ${fmt(height, 1)}`
          };
        }
      }
    } else if (solid === 'triPyramid') {
      let ab = firstPairValue(values, ['AB']);
      let bc = firstPairValue(values, ['BC']);
      let ca = firstPairValue(values, ['CA', 'AC']);
      const equilateral = keywordNumber(normalized, [
        /\bequilateral\s+(?:triangle|base)?\s*(?:of\s+)?(?:side|edge)?\s*(?:length\s+)?(?:=|is|:)?\s*(\d+(?:\.\d+)?)/i,
        /\bequilateral\s+triangular\s+(?:pyramid|base)\b[^.\d]{0,25}?\b(?:side|edge)\b[^.\d]{0,10}?(\d+(?:\.\d+)?)/i,
        /\b(?:equilateral|regular)\s+(?:triangular\s+)?(?:base|pyramid)\b[^.\d]{0,20}?\b(?:side|edge)\b[^.\d]{0,10}?(\d+(?:\.\d+)?)/i,
        /\b(?:base\s+side|side\s+of\s+(?:the\s+)?(?:triangular\s+)?base)\s*(?:=|is|:)?\s*(\d+(?:\.\d+)?)/i
      ]);
      if (equilateral !== null) {
        if (ab === null) ab = equilateral;
        if (bc === null) bc = equilateral;
        if (ca === null) ca = equilateral;
      }
      let height = firstPairValue(values, ['VO', 'VX', 'VM', 'VN']);
      if (height === null) height = parseVerticalHeight(normalized);
      if (ab === null) missing.push('AB');
      if (bc === null) missing.push('BC');
      if (ca === null) missing.push('CA');
      if (height === null) missing.push('vertical height');
      if (ab !== null && bc !== null && ca !== null && height !== null) {
        const base = triangleBaseFromSides(ab, bc, ca);
        if (!base) {
          warnings.push('Those three base lengths do not form a triangle. Check AB, BC and CA.');
        } else {
          dims = { ab, bc, ca, h: height, kind: 'triPyramid' };
          spec = {
            type: 'custom',
            base,
            kind: 'pyramid',
            height,
            label: 'Triangular pyramid',
            caption: `Triangular pyramid · AB ${fmt(ab, 1)} × BC ${fmt(bc, 1)} × CA ${fmt(ca, 1)} × height ${fmt(height, 1)}`
          };
        }
      }
      if (!/\b(?:right|regular)\s+(?:triangular\s+)?pyramid\b/.test(lower)) {
        warnings.push('The apex is assumed to be vertically above the centre of the triangular base.');
      }
    } else if (solid === 'rectPyramid') {
      let w = firstPairValue(values, ['AB']);
      let d = firstPairValue(values, ['BC', 'AD']);
      const basePair = normalized.match(/\b(?:rectangular\s+)?base\b[^.\d]{0,30}?(\d+(?:\.\d+)?)\s*(?:cm|mm|m|units?)?\s*(?:by|x)\s*(\d+(?:\.\d+)?)/i);
      if (w === null && basePair) w = Number(basePair[1]);
      if (d === null && basePair) d = Number(basePair[2]);
      let height = firstPairValue(values, ['VO', 'VX', 'VM', 'VN']);
      if (height === null) height = parseVerticalHeight(normalized);
      if (w === null) missing.push('base width AB');
      if (d === null) missing.push('base depth BC');
      if (height === null) missing.push('vertical height');
      if (w !== null && d !== null && height !== null) {
        dims = { w, d, h: height, kind: 'rectPyramid' };
        spec = {
          type: 'custom',
          base: rectangleBaseFromSides(w, d),
          kind: 'pyramid',
          height,
          label: 'Right rectangular pyramid',
          caption: `Right rectangular pyramid · AB ${fmt(w, 1)} × BC ${fmt(d, 1)} × height ${fmt(height, 1)}`
        };
      }
    } else if (solid === 'tetrahedron') {
      if (subtype === 'right') {
        const ab = firstPairValue(values, ['AB']);
        const ac = firstPairValue(values, ['AC']);
        const ad = firstPairValue(values, ['AD']);
        if (ab === null) missing.push('AB');
        if (ac === null) missing.push('AC');
        if (ad === null) missing.push('AD');
        if (ab !== null && ac !== null && ad !== null) {
          dims = { mode: 'right', ab, ac, ad };
          spec = { type: 'tetrahedron', mode: 'right', ab, ac, ad };
        }
      } else {
        const edge = firstPairValue(values, ['AB', 'AC', 'AD', 'BC', 'BD', 'CD']) ??
          keywordNumber(normalized, [
            /\b(?:edge|side)\s*(?:length)?\s*(?:=|is|:)?\s*(\d+(?:\.\d+)?)/i
          ]);
        if (edge === null) missing.push('edge length');
        if (edge !== null) {
          dims = { mode: 'regular', edge };
          spec = { type: 'tetrahedron', mode: 'regular', edge };
        }
        if (!/\bregular\s+tetrahedron\b/.test(lower)) {
          warnings.push('Assuming a regular tetrahedron. If the edges are not all equal, describe it as a right tetrahedron with AB, AC and AD.');
        }
      }
    }

    const target = extractTextTarget(upper);
    const derivedRaw = extractPointDefinitions(normalized);
    derivedRaw.filter(definition => definition.assumed).forEach(definition => {
      warnings.push(`${definition.label} is on ${definition.a}${definition.b} with no ratio; it was placed at the midpoint. Add a ratio to move it.`);
    });
    let model = null;
    let derivedDefinitions = [];
    if (spec) {
      model = buildParseSpec(spec);
      if (model) {
        if (derivedRaw.length) {
          const derived = addDerivedPoints(model, derivedRaw);
          derived.warnings.forEach(warning => warnings.push(warning));
          derivedDefinitions = derived.added;
        }
        const resolved = resolveTextTarget(target, model);
        target.resolved = resolved.resolved;
        target.error = resolved.error || null;
        target.lineResult = resolved.lineResult || null;
        target.planeAResolved = resolved.planeAResolved || null;
        target.planeBResolved = resolved.planeBResolved || null;
        if (resolved.error) warnings.push(resolved.error);
      }
    }

    const complete = Boolean(spec && model);
    if (!complete && missing.length) {
      warnings.push(`Add ${missing.join(', ')} to build an exact model.`);
    }

    return {
      empty: false,
      original,
      normalized,
      solid,
      subtype,
      unsupported,
      dims,
      spec,
      model,
      target,
      derivedDefinitions,
      derivedRaw,
      warnings,
      missing,
      complete
    };
  }

  function solidDisplayName(solid) {
    if (solid === 'cuboid') return 'Cuboid';
    if (solid === 'pyramid') return 'Square-based pyramid';
    if (solid === 'triprism') return 'Triangular prism';
    if (solid === 'triPyramid') return 'Triangular pyramid';
    if (solid === 'rectPyramid') return 'Right rectangular pyramid';
    if (solid === 'tetrahedron') return 'Tetrahedron';
    return 'Unknown solid';
  }

  function targetDisplayHtml(parse) {
    const target = parse.target;
    if (!target || target.type === 'none') {
      return '<span class="parse-muted">No line, plane, or length target detected. The solid will open in Explore mode.</span>';
    }
    if (target.type === 'linePlane') {
      return `Find the angle between line <em>${escapeHtml(target.line)}</em> and plane <em>${escapeHtml(target.planeA)}</em>.`;
    }
    if (target.type === 'planePlane') {
      return `Find the angle between plane <em>${escapeHtml(target.planeA)}</em> and plane <em>${escapeHtml(target.planeB)}</em>.`;
    }
    if (target.type === 'distance') {
      const label = target.line || `${target.pointA}${target.pointB}`;
      return `Find the distance <em>${escapeHtml(label)}</em>.`;
    }
    return '<span class="parse-muted">No target detected.</span>';
  }

  function renderTextParse(parse) {
    const preview = $('#parsePreview');
    const badge = $('#parseBadge');
    const build = $('#buildFromTextBtn');
    if (!preview || !badge || !build) return;

    if (!parse || parse.empty) {
      preview.innerHTML = `<div class="parse-empty">
        <span class="parse-empty-mark">Aa</span>
        <strong>Paste a question to begin</strong>
        <p>Reads cuboids, cubes, triangular prisms, square/rectangular/triangular pyramids and tetrahedra. The parser extracts dimensions, labels, and the requested angle.</p>
      </div>`;
      badge.textContent = 'Waiting';
      badge.className = 'parse-badge';
      build.disabled = true;
      return;
    }

    if (!parse.solid) {
      preview.innerHTML = `<div class="parse-empty">
        <span class="parse-empty-mark">?</span>
        <strong>Solid not recognised</strong>
        <p>Include a solid name such as cuboid, cube, triangular prism, right pyramid, triangular pyramid, rectangular pyramid or tetrahedron. You can always use the templates or Photo Lab.</p>
      </div>`;
      badge.textContent = 'Needs a solid';
      badge.className = 'parse-badge is-warn';
      build.disabled = true;
      return;
    }

    if (parse.unsupported) {
      preview.innerHTML = `<div class="parse-block">
        <div class="parse-block-label">Detected solid <span>not parsed</span></div>
        <div class="parse-solid">${escapeHtml(solidDisplayName(parse.solid))}</div>
        <div class="parse-warning">${escapeHtml(parse.warnings[0] || 'This solid is not supported by the text parser yet.')}</div>
      </div>`;
      badge.textContent = 'Unsupported';
      badge.className = 'parse-badge is-warn';
      build.disabled = true;
      return;
    }

    const dims = parse.dims;
    let dimsHtml = '<div class="parse-muted">No complete set of measurements yet.</div>';
    if (dims) {
      if (parse.solid === 'cuboid') {
        dimsHtml = `<div class="parse-grid">
          <div class="parse-cell"><span>AB · width</span><strong>${fmt(dims.w, 2)}</strong></div>
          <div class="parse-cell"><span>BC · depth</span><strong>${fmt(dims.d, 2)}</strong></div>
          <div class="parse-cell"><span>CG · height</span><strong>${fmt(dims.h, 2)}</strong></div>
          <div class="parse-cell"><span>Source</span><strong>question</strong></div>
        </div>`;
      } else if (parse.solid === 'pyramid') {
        dimsHtml = `<div class="parse-grid">
          <div class="parse-cell"><span>Base side</span><strong>${fmt(dims.s, 2)}</strong></div>
          <div class="parse-cell"><span>Vertical height</span><strong>${fmt(dims.h, 2)}</strong></div>
          <div class="parse-cell"><span>Base</span><strong>square</strong></div>
          <div class="parse-cell"><span>Source</span><strong>question</strong></div>
        </div>`;
      } else if (parse.solid === 'triprism' || parse.solid === 'triPyramid') {
        dimsHtml = `<div class="parse-grid">
          <div class="parse-cell"><span>AB</span><strong>${fmt(dims.ab, 2)}</strong></div>
          <div class="parse-cell"><span>BC</span><strong>${fmt(dims.bc, 2)}</strong></div>
          <div class="parse-cell"><span>CA</span><strong>${fmt(dims.ca, 2)}</strong></div>
          <div class="parse-cell"><span>${parse.solid === 'triPyramid' ? 'Vertical height' : 'Prism height'}</span><strong>${fmt(dims.h, 2)}</strong></div>
        </div>`;
      } else if (parse.solid === 'rectPyramid') {
        dimsHtml = `<div class="parse-grid">
          <div class="parse-cell"><span>AB · width</span><strong>${fmt(dims.w, 2)}</strong></div>
          <div class="parse-cell"><span>BC · depth</span><strong>${fmt(dims.d, 2)}</strong></div>
          <div class="parse-cell"><span>Vertical height</span><strong>${fmt(dims.h, 2)}</strong></div>
          <div class="parse-cell"><span>Base</span><strong>rectangle</strong></div>
        </div>`;
      } else if (parse.solid === 'tetrahedron') {
        dimsHtml = dims.mode === 'right'
          ? `<div class="parse-grid">
              <div class="parse-cell"><span>AB</span><strong>${fmt(dims.ab, 2)}</strong></div>
              <div class="parse-cell"><span>AC</span><strong>${fmt(dims.ac, 2)}</strong></div>
              <div class="parse-cell"><span>AD</span><strong>${fmt(dims.ad, 2)}</strong></div>
              <div class="parse-cell"><span>At A</span><strong>3 ⟂ edges</strong></div>
            </div>`
          : `<div class="parse-grid">
              <div class="parse-cell"><span>Edge length</span><strong>${fmt(dims.edge, 2)}</strong></div>
              <div class="parse-cell"><span>Faces</span><strong>4 equilateral</strong></div>
              <div class="parse-cell"><span>Vertices</span><strong>4</strong></div>
              <div class="parse-cell"><span>Source</span><strong>question</strong></div>
            </div>`;
      }
    }

    const vertexCounts = {
      cuboid: 8,
      pyramid: 5,
      triprism: 6,
      triPyramid: 4,
      rectPyramid: 5,
      tetrahedron: 4
    };
    const displayName = parse.solid === 'tetrahedron' && parse.subtype === 'right'
      ? 'Right tetrahedron'
      : solidDisplayName(parse.solid);

    const warnings = parse.warnings.slice(0, 3).map(warning => `<div class="parse-warning">${escapeHtml(warning)}</div>`).join('');
    const pointDefinitions = (parse.derivedDefinitions && parse.derivedDefinitions.length
      ? parse.derivedDefinitions
      : (parse.derivedRaw || []));
    const pointsHtml = pointDefinitions.length
      ? `<div class="parse-block">
          <div class="parse-block-label">Named points <span>${pointDefinitions.length}</span></div>
          <div class="derived-preview-list">
            ${pointDefinitions.map(definition => `<div class="derived-preview-row">
              <span class="derived-preview-label">${escapeHtml(definition.label)}</span>
              <span>${escapeHtml(definition.text || 'Named point')}</span>
            </div>`).join('')}
          </div>
        </div>`
      : '';
    const success = parse.complete
      ? `<div class="parse-ok">Exact dimensions found. Build the model with these values.</div>`
      : '';

    preview.innerHTML = `
      <div class="parse-block">
        <div class="parse-block-label">Solid <span>${vertexCounts[parse.solid] || '?'} vertices</span></div>
        <div class="parse-solid">${escapeHtml(displayName)}</div>
      </div>
      <div class="parse-block">
        <div class="parse-block-label">Measurements</div>
        ${dimsHtml}
      </div>
      ${pointsHtml}
      <div class="parse-block">
        <div class="parse-block-label">Target</div>
        <div class="parse-target">${targetDisplayHtml(parse)}</div>
      </div>
      ${warnings}
      ${success}
    `;

    if (parse.complete) {
      badge.textContent = 'Ready';
      badge.className = 'parse-badge is-ready';
      build.disabled = false;
    } else {
      badge.textContent = 'Needs numbers';
      badge.className = 'parse-badge is-warn';
      build.disabled = true;
    }
  }

  function updateTextParse() {
    const input = $('#questionInput');
    if (!input) return;
    currentTextParse = parseQuestionText(input.value);
    renderTextParse(currentTextParse);
  }

  function openTextReader() {
    openModal('text');
    updateTextParse();
    window.setTimeout(() => {
      const input = $('#questionInput');
      if (input && !input.value.trim() && window.innerWidth > 760) input.focus();
    }, 80);
  }

  function setTextScanStatus(message, state = 'idle') {
    const status = $('#textScanStatus');
    const text = $('#textScanStatusText');
    if (!status || !text) return;
    if (!message) {
      status.hidden = true;
      status.classList.remove('is-busy', 'is-error');
      return;
    }
    status.hidden = false;
    status.classList.toggle('is-busy', state === 'busy');
    status.classList.toggle('is-error', state === 'error');
    text.textContent = message;
  }

  function loadOcrScript() {
    if (window.Tesseract) return Promise.resolve();
    if (ocrScriptPromise) return ocrScriptPromise;
    ocrScriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = OCR_SCRIPT_URL;
      script.async = true;
      const timeout = window.setTimeout(() => {
        script.remove();
        ocrScriptPromise = null;
        reject(new Error('OCR download timed out.'));
      }, 15000);
      script.onload = () => {
        window.clearTimeout(timeout);
        resolve();
      };
      script.onerror = () => {
        window.clearTimeout(timeout);
        script.remove();
        ocrScriptPromise = null;
        reject(new Error('OCR engine could not be loaded.'));
      };
      document.head.appendChild(script);
    });
    return ocrScriptPromise;
  }

  function cleanOcrText(text) {
    return String(text || '')
      .replace(/\r/g, '')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  async function scanTextPhoto(file) {
    if (!file || textOcrBusy) return;
    textOcrBusy = true;
    const scanButton = $('#scanTextBtn');
    if (scanButton) scanButton.disabled = true;
    setTextScanStatus('Loading OCR engine…', 'busy');

    let objectUrl = null;
    try {
      await loadOcrScript();
      setTextScanStatus('Reading printed text… 0%', 'busy');
      objectUrl = URL.createObjectURL(file);
      const result = await window.Tesseract.recognize(objectUrl, 'eng', {
        logger: message => {
          const percent = message.progress ? ` ${Math.round(message.progress * 100)}%` : '';
          setTextScanStatus(`Reading printed text…${percent}`, 'busy');
        }
      });
      const text = cleanOcrText(result && result.data ? result.data.text : '');
      if (!text) {
        throw new Error('No readable printed text was found in that image.');
      }
      const input = $('#questionInput');
      if (input) {
        input.value = text;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.focus();
        updateTextParse();
      }
      setTextScanStatus('Text scanned. Check the numbers and labels before building.', 'idle');
    } catch (error) {
      const heic = /\.(heic|heif)$/i.test(file.name || '');
      setTextScanStatus(
        heic
          ? 'This looks like a HEIC/HEIF photo, which many browsers cannot decode. Export it as JPG/PNG, or paste the question text instead.'
          : 'Could not read that photo. Check your internet connection and the image quality, or paste the question text instead.',
        'error'
      );
    } finally {
      if (objectUrl) {
        try { URL.revokeObjectURL(objectUrl); } catch (error) { /* noop */ }
      }
      textOcrBusy = false;
      if (scanButton) scanButton.disabled = false;
    }
  }

  function applyTextQuestion(parse) {
    if (!parse || !parse.complete || !parse.spec) {
      showToast('Add the missing measurements first.');
      return;
    }
    state.custom = null;
    state.exampleId = null;
    state.source = 'text';
    const spec = parse.spec;
    if (spec.type === 'shape') {
      state.shape = spec.shape;
      if (spec.shape === 'cuboid') {
        state.dims = { ...state.dims, w: spec.dims.w, d: spec.dims.d, h: spec.dims.h };
      } else {
        state.dims = { ...state.dims, s: spec.dims.s, h: spec.dims.h };
      }
    } else if (spec.type === 'custom') {
      state.shape = 'custom';
      state.custom = customStateFromSpec(spec);
      state.dims = { ...state.dims, h: spec.height };
    } else if (spec.type === 'tetrahedron') {
      state.shape = 'tetrahedron';
      if (spec.mode === 'right') {
        state.tetra = { mode: 'right', ab: spec.ab, ac: spec.ac, ad: spec.ad };
      } else {
        state.tetra = { mode: 'regular', ab: spec.edge, ac: spec.edge, ad: spec.edge };
        state.dims = { ...state.dims, edge: spec.edge };
      }
    }
    state.derivedDefinitions = (parse.derivedDefinitions || []).map(definition => ({ ...definition }));
    state.model = buildModelWithExtras();
    sanitizeSelections();
    resetSelectionsForModel();

    const target = parse.target;
    camera.yaw = -0.86;
    camera.pitch = 0.36;
    if (target && target.resolved) {
      if (target.type === 'linePlane') {
        state.tool = 'linePlane';
        state.lineA = target.lineResult.indices[0];
        state.lineB = target.lineResult.indices[1];
        state.planeAKey = target.planeAResolved.key;
        if (target.planeAResolved.custom) state.customA = target.planeAResolved.custom;
        state.nextSlot = 'lineA';
        if (parse.solid === 'pyramid') {
          camera.yaw = -1.12;
          camera.pitch = 0.31;
        } else {
          camera.yaw = -0.86;
          camera.pitch = 0.36;
        }
      } else if (target.type === 'planePlane') {
        state.tool = 'planePlane';
        state.planeAKey = target.planeAResolved.key;
        state.planeBKey = target.planeBResolved.key;
        if (target.planeAResolved.custom) state.customA = target.planeAResolved.custom;
        if (target.planeBResolved.custom) state.customB = target.planeBResolved.custom;
        state.nextPlaneSlot = 'A';
        camera.yaw = -0.48;
        camera.pitch = 0.3;
      } else if (target.type === 'distance') {
        state.tool = 'distance';
        state.distanceA = target.lineResult.indices[0];
        state.distanceB = target.lineResult.indices[1];
        state.nextSlot = 'distanceA';
        camera.yaw = -0.86;
        camera.pitch = 0.36;
      }
    } else {
      state.tool = 'inspect';
    }

    const displayQuestion = parse.original.length > 520
      ? `${parse.original.slice(0, 517)}…`
      : parse.original;
    state.questionHtml = escapeHtml(displayQuestion).replace(/\n/g, '<br>');
    state.analysis = computeAnalysis();
    autoFrame();
    if (target && target.resolved && target.type === 'linePlane' && parse.solid === 'pyramid') {
      camera.yaw = -1.12;
      camera.pitch = 0.31;
    }
    if (target && target.resolved && target.type === 'planePlane') {
      camera.yaw = -0.48;
      camera.pitch = 0.3;
    }
    updateSolidCards();
    renderDimensions();
    syncToolUI();
    renderWorkbench();
    updateCaption();
    updateQuestionBanner();
    renderDerivedPoints();
    const banner = $('#questionBanner');
    banner?.classList.remove('is-hidden');
    setActiveView('');
    closeModal('text');
    requestRender();
    showToast('Exact model built from the question text.');
    if (window.innerWidth <= 980) {
      window.setTimeout(() => stageEl.scrollIntoView({ behavior: 'smooth', block: 'start' }), 160);
    }
  }

  function bindTextReader() {
    $('#openTextBtn')?.addEventListener('click', openTextReader);
    $('#leftTextBtn')?.addEventListener('click', openTextReader);
    $('#textToPhotoBtn')?.addEventListener('click', () => {
      closeModal('text');
      openPhotoLab();
    });
    $('#scanTextBtn')?.addEventListener('click', () => $('#textPhotoInput')?.click());
    $('#textPhotoInput')?.addEventListener('change', event => {
      const file = event.target.files?.[0];
      event.target.value = '';
      if (file) scanTextPhoto(file);
    });

    const input = $('#questionInput');
    input?.addEventListener('input', () => {
      const status = $('#textScanStatus');
      if (status && status.classList.contains('is-error')) setTextScanStatus('', 'idle');
      window.clearTimeout(textParseTimer);
      textParseTimer = window.setTimeout(updateTextParse, 160);
    });

    $$('[data-question-example]').forEach(button => {
      button.addEventListener('click', () => {
        const key = button.dataset.questionExample;
        if (!TEXT_EXAMPLE_QUESTIONS[key]) return;
        if (input) {
          input.value = TEXT_EXAMPLE_QUESTIONS[key];
          input.focus();
          setTextScanStatus('', 'idle');
          updateTextParse();
        }
      });
    });

    $('#buildFromTextBtn')?.addEventListener('click', () => {
      const input = $('#questionInput');
      currentTextParse = parseQuestionText(input ? input.value : '');
      renderTextParse(currentTextParse);
      applyTextQuestion(currentTextParse);
    });

    $$('[data-close-modal="text"]').forEach(button => {
      button.addEventListener('click', () => closeModal('text'));
    });
  }

  /* ------------------------------------------------------------------ */
  /* Examples                                                            */
  /* ------------------------------------------------------------------ */
  const EXAMPLES = [
    {
      id: 'cuboid',
      tag: 'Cuboid · line & plane',
      title: 'The space diagonal',
      description: 'A cuboid with AB = 8, BC = 6 and CG = 5. See why the angle is not simply 30° or 45°.',
      angle: '≈ 26.6°',
      featured: true,
      graphic: `<svg viewBox="0 0 132 66" fill="none">
        <path d="M18 20 54 8l46 12v30L54 58 18 50V20Z" stroke="currentColor" stroke-width="1.4"/>
        <path d="m18 20 36 16 46-16M54 36v22" stroke="currentColor" stroke-width="1.4"/>
        <path d="m18 20 82 38" stroke="#d8ff6a" stroke-width="1.8"/>
        <path d="m18 50 36 4 46-16" stroke="rgba(126,174,255,.8)" stroke-width="1.4" stroke-dasharray="4 3"/>
        <circle cx="18" cy="20" r="2.6" fill="#d8ff6a"/>
        <circle cx="100" cy="58" r="2.6" fill="#d8ff6a"/>
      </svg>`
    },
    {
      id: 'pyramidSlant',
      tag: 'Pyramid · slant edge',
      title: 'The pyramid slant',
      description: 'A square-based right pyramid. Track the vertical height, the base diagonal and the slant edge.',
      angle: '≈ 59.5°',
      featured: false,
      graphic: `<svg viewBox="0 0 132 66" fill="none">
        <path d="M22 52 62 60l56-15-6-29-44-7-46 43Z" stroke="currentColor" stroke-width="1.4"/>
        <path d="M22 52h96M62 7v53" stroke="currentColor" stroke-width="1.2"/>
        <path d="M22 52 62 9l56 36" stroke="currentColor" stroke-width="1.4"/>
        <path d="m22 52 52 2" stroke="rgba(126,174,255,.8)" stroke-width="1.4" stroke-dasharray="4 3"/>
        <path d="m22 52 40-43" stroke="#d8ff6a" stroke-width="1.8"/>
        <circle cx="22" cy="52" r="2.6" fill="#d8ff6a"/>
        <circle cx="62" cy="9" r="2.6" fill="#d8ff6a"/>
      </svg>`
    },
    {
      id: 'pyramidDihedral',
      tag: 'Pyramid · plane & plane',
      title: 'The roof fold',
      description: 'The angle between a sloping face and the base. Find the hinge, cut across it, then measure.',
      angle: '≈ 67.4°',
      featured: false,
      graphic: `<svg viewBox="0 0 132 66" fill="none">
        <path d="M16 51 65 60l54-13-5-30-44-8-54 42Z" stroke="currentColor" stroke-width="1.4"/>
        <path d="m16 51 54 9M65 9v51M16 51 65 9l54 38" stroke="currentColor" stroke-width="1.3"/>
        <path d="M16 51 65 60" stroke="#d8ff6a" stroke-width="2"/>
        <path d="m42 54 16 2 10-25" stroke="rgba(255,139,110,.9)" stroke-width="1.6" stroke-dasharray="4 3"/>
        <path d="M55 58a17 17 0 0 1 6-5" stroke="#d8ff6a" stroke-width="1.5"/>
      </svg>`
    }
  ];

  function renderExamples() {
    const grid = $('#examplesGrid');
    if (!grid) return;
    grid.innerHTML = EXAMPLES.map((example, index) => `
      <button class="example-card ${example.featured ? 'is-featured' : ''}" type="button" data-example="${example.id}">
        <div class="example-top">
          <span class="example-tag">${example.tag}</span>
          <span class="example-angle">${example.angle}</span>
        </div>
        <div class="example-graphic">${example.graphic}</div>
        <h3>${example.title}</h3>
        <p>${example.description}</p>
        <span class="example-load">Load this figure
          <svg viewBox="0 0 16 16" fill="none"><path d="M2.5 8h10m-3.5-3.5L12.5 8 9 11.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </span>
      </button>
    `).join('');
  }

  function updateSolidCards() {
    $$('.solid-card').forEach(card => {
      const active = card.dataset.shape === state.shape;
      card.classList.toggle('is-active', active);
      card.setAttribute('aria-pressed', String(active));
    });
  }

  function loadExample(id) {
    const example = EXAMPLES.find(item => item.id === id);
    if (!example) return;
    state.custom = null;
    state.exampleId = id;
    state.source = 'example';
    state.derivedDefinitions = [];
    state.dims = { w: 8, d: 6, h: 5, s: 10 };
    if (id === 'cuboid') {
      state.shape = 'cuboid';
      state.dims = { w: 8, d: 6, h: 5, s: 10 };
    } else {
      state.shape = 'pyramid';
      state.dims = { w: 8, d: 6, h: 12, s: 10 };
    }
    state.model = buildModelForState();
    resetSelectionsForModel();
    if (id === 'cuboid') {
      state.tool = 'linePlane';
      state.lineA = 0;
      state.lineB = 6;
      state.planeAKey = 'face:base';
      camera.yaw = -0.86;
      camera.pitch = 0.36;
    } else if (id === 'pyramidSlant') {
      state.tool = 'linePlane';
      state.lineA = 0;
      state.lineB = 4;
      state.planeAKey = 'face:base';
      camera.yaw = -1.12;
      camera.pitch = 0.31;
    } else {
      state.tool = 'planePlane';
      state.planeAKey = 'face:side-0';
      state.planeBKey = 'face:base';
      camera.yaw = -0.48;
      camera.pitch = 0.3;
    }
    state.nextSlot = 'lineA';
    state.nextPlaneSlot = 'A';
    state.analysis = computeAnalysis();
    autoFrame();
    refreshExampleQuestion();
    updateQuestionBanner();
    updateSolidCards();
    renderDimensions();
    syncToolUI();
    renderWorkbench();
    updateCaption();
    renderDerivedPoints();
    const banner = $('#questionBanner');
    banner?.classList.remove('is-hidden');
    setActiveView('iso');
    closeModal('examples');
    requestRender();
    showToast(`Example loaded: ${example.title}`);
    if (window.innerWidth <= 980) {
      window.setTimeout(() => stageEl.scrollIntoView({ behavior: 'smooth', block: 'start' }), 160);
    }
  }

  function bindExamples() {
    $('#examplesNav')?.addEventListener('click', () => {
      renderExamples();
      openModal('examples');
    });
    $('#examplesFootBtn')?.addEventListener('click', () => {
      renderExamples();
      openModal('examples');
    });
    $$('[data-close-modal="examples"]').forEach(button => {
      button.addEventListener('click', () => closeModal('examples'));
    });
    $('#examplesGrid')?.addEventListener('click', event => {
      const card = event.target.closest('[data-example]');
      if (card) loadExample(card.dataset.example);
    });
  }

  /* ------------------------------------------------------------------ */
  /* General bindings + startup                                          */
  /* ------------------------------------------------------------------ */
  function bindControls() {
    $$('.tool-button').forEach(button => {
      button.addEventListener('click', () => setTool(button.dataset.tool));
    });

    $$('.solid-card').forEach(card => {
      card.addEventListener('click', () => setShape(card.dataset.shape));
    });

    dimensionControls.addEventListener('input', handleDimensionInput);
    workbenchBody.addEventListener('change', handleWorkbenchChange);
    workbenchBody.addEventListener('click', handleWorkbenchClick);

    $('#toggleLabels')?.addEventListener('change', event => {
      state.toggles.labels = event.target.checked;
      requestRender();
    });
    $('#toggleGrid')?.addEventListener('change', event => {
      state.toggles.grid = event.target.checked;
      requestRender();
    });
    $('#toggleHidden')?.addEventListener('change', event => {
      state.toggles.hiddenEdges = event.target.checked;
      requestRender();
    });
    $('#toggleDerivedGuides')?.addEventListener('change', event => {
      state.toggles.derivedGuides = event.target.checked;
      requestRender();
    });
    $('#derivedList')?.addEventListener('click', event => {
      const row = event.target.closest('[data-derived-label]');
      if (!row) return;
      const label = row.dataset.derivedLabel;
      const index = state.model.vertices.findIndex(vertex => vertex.label === label && vertex.derived);
      if (index < 0) return;
      state.inspect = { kind: 'point', index };
      state.tool = 'inspect';
      state.analysis = computeAnalysis();
      syncToolUI();
      renderWorkbench();
      requestRender();
    });

    const spinCheckbox = $('#toggleSpin');
    const spinButton = $('#spinBtn');

    function setSpin(value) {
      state.toggles.spin = Boolean(value);
      if (spinCheckbox) spinCheckbox.checked = state.toggles.spin;
      spinButton?.classList.toggle('is-active', state.toggles.spin);
      requestRender();
    }

    spinCheckbox?.addEventListener('change', event => setSpin(event.target.checked));
    spinButton?.addEventListener('click', () => setSpin(!state.toggles.spin));

    $$('.view-button').forEach(button => {
      button.addEventListener('click', () => setView(button.dataset.view));
    });
    $('#resetViewBtn')?.addEventListener('click', resetCamera);

    $('#fullscreenBtn')?.addEventListener('click', async () => {
      try {
        if (!document.fullscreenElement) await stageEl.requestFullscreen();
        else await document.exitFullscreen();
      } catch (error) {
        showToast('Fullscreen is not available in this browser.');
      }
    });

    $('#closeBanner')?.addEventListener('click', () => {
      $('#questionBanner')?.classList.add('is-hidden');
    });

    $('#loadWalkthroughBtn')?.addEventListener('click', () => {
      const workbench = $('#workbench');
      if (!workbench) return;
      workbench.classList.remove('is-flash');
      void workbench.offsetWidth;
      workbench.classList.add('is-flash');
      window.setTimeout(() => workbench.classList.remove('is-flash'), 1800);
      workbench.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      showToast('The full working is live in the Workbench.');
    });

    $$('[data-nav="studio"]').forEach(button => {
      button.addEventListener('click', () => {
        closeAllModals();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    });
    $$('[data-nav="photo"]').forEach(button => {
      button.addEventListener('click', openPhotoLab);
    });
    $$('[data-nav="examples"]').forEach(button => {
      button.addEventListener('click', () => {
        renderExamples();
        openModal('examples');
      });
    });

    $('#helpBtn')?.addEventListener('click', () => openModal('help'));
    $$('[data-close-modal="help"]').forEach(button => {
      button.addEventListener('click', () => closeModal('help'));
    });

    document.addEventListener('keydown', handleGlobalKeydown);
    window.addEventListener('resize', resizeSceneCanvas);
    window.addEventListener('resize', resizePhotoCanvas);

    if ('ResizeObserver' in window) {
      const observer = new ResizeObserver(() => resizeSceneCanvas());
      observer.observe(sceneCanvas);
      const photoObserver = new ResizeObserver(() => resizePhotoCanvas());
      photoObserver.observe($('#photoCanvasWrap'));
    }
  }

  function animate(time) {
    if (!lastFrameTime) lastFrameTime = time;
    const delta = Math.min(48, time - lastFrameTime);
    lastFrameTime = time;
    if (state.toggles.spin) {
      camera.yaw += delta * 0.00023;
      requestRender();
    }
    requestAnimationFrame(animate);
  }

  function init() {
    if (new URLSearchParams(location.search).has('still')) {
      document.documentElement.classList.add('still');
    }
    state.model = buildModelWithExtras();
    sanitizeSelections();
    autoFrame();
    refreshExampleQuestion();
    state.analysis = computeAnalysis();
    bindCanvasInteractions();
    bindControls();
    bindPhotoLab();
    bindTextReader();
    bindExamples();
    renderDimensions();
    syncToolUI();
    renderWorkbench();
    updateCaption();
    updateQuestionBanner();
    updateSolidCards();
    renderDerivedPoints();
    resizeSceneCanvas();
    requestAnimationFrame(animate);
    requestAnimationFrame(() => {
      resizeSceneCanvas();
      updateStageHint();
    });

    // Deep links make it easy to share a figure or reopen the Photo Lab.
    const hash = location.hash.replace(/^#/, '');
    if (hash.startsWith('example=')) {
      window.setTimeout(() => loadExample(hash.split('=')[1]), 80);
    } else if (hash.startsWith('shape=')) {
      window.setTimeout(() => {
        const shape = hash.split('=')[1];
        if (['cuboid', 'triprism', 'pyramid'].includes(shape)) setShape(shape);
      }, 80);
    } else if (hash === 'photo') {
      window.setTimeout(openPhotoLab, 80);
    } else if (hash === 'text') {
      window.setTimeout(openTextReader, 80);
    } else if (hash === 'photoSample') {
      window.setTimeout(async () => {
        openPhotoLab();
        window.setTimeout(loadSampleDiagram, 120);
      }, 80);
    } else if (hash === 'examples') {
      window.setTimeout(() => { renderExamples(); openModal('examples'); }, 80);
    } else if (hash === 'help') {
      window.setTimeout(() => openModal('help'), 80);
    }
  }

  // A deliberately small public surface: useful for deep links and classroom demos.
  window.SolidSight = {
    loadExample,
    setTool,
    setShape,
    openPhotoLab,
    openTextReader,
    resetCamera,
    showToast
  };

  init();
})();
