# SolidSight — HKDSE 3D Trig Lab

A no-build, browser-based 3D trigonometry studio for visualising solids, planes, and angles. It is designed for the kind of figure you meet in HKDSE "Applications of trigonometry in 3-dimensional problems".

Open **`index.html`** in a modern browser. There is nothing to install and no server is needed.

## What it does

- **Editable solids** — cuboid, right triangular prism, square-based right pyramid, and regular/right tetrahedron.
- **Real 3D orbit** — drag to turn the solid, scroll or pinch to zoom, right-drag (or Shift-drag) to pan. Preset ISO / FRONT / TOP / SIDE views.
- **Line ↔ Plane** — choose two vertices and a plane. The app draws the line, its projection, perpendiculars, right-angle marker, angle arc, and computes the angle live with a worked solution.
- **Plane ↔ Plane** — choose any two planes (faces, diagonal planes, or a custom 3-point plane). The app finds the intersection line, draws the perpendicular cross-section, and computes the dihedral angle.
- **Length** — select two points to show the straight-line distance and the 3D Pythagoras working.
- **Face-on camera buttons** — "See this angle face-on" and "Align the camera to this cross-section" remove foreshortening, so the angle looks the size it actually is.
- **Photo Lab** — take/upload a photo, trace the base corners, choose prism or pyramid, set the height, then correct the base dimensions with sliders. The photo is pinned beside the model for reference.
- **Question Reader** — paste the wording (or optionally scan printed text from a photo). It extracts exact dimensions, maps labels such as `AG` and `ABCD`, constructs named points such as midpoints and diagonal intersections, and builds the model and requested measurement automatically.
- **Named points** — points defined in the question are placed in 3D with dashed construction guides. They are selectable everywhere: line ends, plane points, distance endpoints, and the sidebar point list.
- **Three HKDSE-style examples** — cuboid space diagonal, pyramid slant edge, and pyramid dihedral angle.
- **Explore mode** — click vertices or faces to inspect coordinates, plane normals, and adjacent faces.

## Question Reader

Open **Question → 3D**, then paste a question such as:

> The cuboid ABCDEFGH has AB = 8, BC = 6 and CG = 5. Find the angle between the line AG and the plane ABCD.

or

> The right pyramid VABCD has a square base of side 10 and vertical height 12. Find the angle between the plane VAB and the base plane ABCD.

Also supported:

> The triangular prism ABCDEF has AB = 8, BC = 6, CA = 10 and height 12. Find the angle between BD and the plane ABC.

> The right tetrahedron ABCD has AB = 3, AC = 4 and AD = 5, with AB, AC and AD mutually perpendicular.

> The regular tetrahedron ABCD has edge length 6. Find the angle between AD and the plane ABC.

The parser detects the solid, extracts dimensions, resolves the line and plane targets, and builds the exact model. You can review its interpretation before pressing **Build exact model**.

- **Text parsing supports:** cuboids / cubes / rectangular boxes, triangular prisms, square / rectangular / triangular right pyramids, and tetrahedra (regular, or right with three mutually perpendicular edges).
- Standard labels are assumed: `A–H` for a cuboid, `ABCDEF` for a triangular prism, `VABC` / `VABCD` for pyramids, and `ABCD` for a tetrahedron.
- If labels or a target are not recognised, the solid is still built and you can choose the measurement manually.
- General tetrahedra with six unrelated edge lengths are not solved; use a regular tetrahedron or a right tetrahedron with AB, AC and AD.
- The parser is deterministic, not generative AI: it extracts the values from your wording rather than inventing geometry. This keeps the measurements trustworthy.
- **Scan a photo** uses the free Tesseract OCR engine from a CDN. It needs an internet connection, works best on printed text, and may misread `∠`, subscripts, or handwritten maths. Always check the extracted text before building. You can also drop or paste a photo while the Question Reader is open to OCR it.

## Named points

The Question Reader also reads point definitions from the wording. For example:

> V is a point on BC. N is the intersection of the diagonals AC and BD.

> M is the midpoint of BC.

> P is a point on BC such that BP:PC = 1:2.

> O is the centre of the base ABCD.

> F is the foot of the perpendicular from V to BC.

These points are added to the 3D model with blue diamond markers, labels, and dashed construction guides. They appear in the **Named points** sidebar and in every point dropdown, so they can be used in line–plane, plane–plane, and length measurements.

If a point is only described as “on BC” with no ratio, the app places it at the midpoint and shows a warning. Add a ratio or distance to the question text to position it exactly. Definitions that conflict with an existing solid corner are ignored with a warning rather than silently changing the solid.

## Photo Lab workflow

1. Open **Photo → 3D**.
2. Take a photo or choose an image.
3. Tap the corners of the **base** in order, going around the outline.
4. Choose **Vertical prism** or **Pyramid** and set the height.
5. Press **Build my 3D model**.
6. Use the **Base width**, **Base depth**, and **Height** sliders to match the dimensions in your question.
7. Use **Line ↔ Plane**, **Plane ↔ Plane**, or **Length** to analyse the model.

The tracing is deliberately manual: it does not pretend to understand a hand-drawn diagram automatically. It turns your traced footprint into a clean, editable prism or pyramid. For a standard cuboid, the **Cuboid** template is the fastest way to enter exact dimensions.

The optional sample diagram lets you try the whole photo workflow even if you do not have a photo handy. You can also drag a photo anywhere onto the page, or paste one with `Ctrl+V` (`Cmd+V` on macOS).

Photo Lab accepts any image your browser can decode (JPG, PNG, WebP, and others), up to 60 MB. Some browsers cannot decode iPhone **HEIC/HEIF** photos. If that happens, Photo Lab shows a specific tip; export the photo as JPG, or on iPhone use **Settings → Camera → Formats → Most Compatible**.

## Camera and keyboard

| Action | Control |
|---|---|
| Orbit | Drag |
| Zoom | Scroll / pinch |
| Pan | Right-drag or Shift-drag |
| Reset camera | `R`, or the reset-view button |
| Toggle grid | `G` |
| Toggle labels | `L` |
| Help | `?` |
| Reset any view | Double-click the stage |

## Files

- `index.html` — page structure and UI
- `styles.css` — visual system and responsive layout
- `app.js` — 3D canvas renderer, geometry, analysis, Question Reader, and Photo Lab

Everything runs locally in the browser. Photos and question text never leave your device. The only optional network request is the OCR engine, and only when you press **Scan a photo** (or drop/paste an image into the Question Reader). There are no external libraries at load time, no web fonts, and no analytics.

## A note on the maths

Angles are calculated from the geometry, not from the drawing. The displayed values are rounded to 1 decimal place in the main result, with a 2–3 d.p. check in the working.

- Line–plane angle: the angle between the line and its orthogonal projection on the plane. The right triangle uses the perpendicular component and the projected length.
- Plane–plane angle: the acute angle between the planes, constructed by cutting a cross-section perpendicular to the line of intersection.
- Distances use the 3D distance formula.
- Plane equations are built from three non-collinear points and oriented outward from the solid for consistent rendering.

## Browser support

Recent versions of Chrome, Edge, Safari, and Firefox with Canvas 2D, Pointer Events, and `ResizeObserver` support. For the best experience on a phone, use the camera/upload flow in portrait orientation.
