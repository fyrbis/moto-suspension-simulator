# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Run

No build, no deps, no tests. Open `index.html` in a browser (double-click on Windows).

For headless verification during development, use the gstack `/browse` skill:

```sh
$B goto "file://./index.html"
$B click "#playBtn"
$B js "JSON.stringify({t:sim.t, fUse:sim.zfDyn, peakA:sim.peakA})"
```

## File layout

| File | Lines | Role |
| ---- | ----- | ---- |
| `index.html` | ~250 | HTML structure + modal HTML. Loads the 3 JS files in order. |
| `style.css` | ~120 | All CSS. |
| `physics.js` | ~250 | Constants (`BIKE`, `GUIDES`, `STOCK`, `DT`, `g`), pure/semi-pure functions: `paramsFrom`, `params`, `terrain`, `loads`, `stepWith`, `buildBumpData`, `buildRefData`, `buildIdealData`, `idealSettings`. Also defines `$` helper. |
| `render.js` | ~900 | All canvas drawing: `draw`, `drawGhost`, `drawTerrain`, `drawWheel`, `drawTravelBar`, chart functions, damping modal, analysis modal render functions. |
| `ui.js` | ~300 | Mutable globals (`state`, `sim`, `sim2`, `staticSag*`, `loopMode`, `compareMode`), `recomputeStatics`, `resetSim`, `step`, UI input binding, animation loop, DOMContentLoaded event wiring, boot code. |

Load order matters: `physics.js` → `render.js` → `ui.js`. All globals are shared via browser script scope (no ES modules).

## Architecture

Interactive 2D motorcycle suspension simulator for the Husqvarna Norden 901. One physics model drives one canvas render plus DOM telemetry tiles plus a rolling chart.

**Three coupled layers:**

1. **`state` object** — current slider values (rider load, fork/shock clicks, scenario inputs). UI inputs auto-bind via the `inputs` map; any change calls `recomputeStatics()` and `draw()`.

2. **Physics core** — `params()` derives sprung mass split, damping coefficients from clicks, preload forces. `step(dt)` runs a semi-implicit Euler integrator on a half-car model: two independent quarter-cars (front/rear) sharing weight transfer through `loads(t)`. Asymmetric damping (separate comp/reb coefficients) switched by sign of compression rate. Integrator runs at fixed `DT = 1ms`, sub-stepped from the rAF loop. The `sim` global holds dynamic state (`zfDyn`, `zrDyn`, velocities, peak g, bottoming flag, rolling history).

3. **Rendering** — single `draw()` called every rAF tick.
   - `drawTerrain` paints the ground line, sampling the same bump/washboard profile that `terrain(t)` feeds the integrator. Both use a shared world-x coordinate system; the bike sits at x=0 and the bump moves under it as `sim.t` advances.
   - Bike is drawn directly from `staticSag + zfDyn`/`zrDyn`. Frame attachment points (`frF`, `frR`) are computed from `forkLenU - fComp` and `rearArmU - rComp`. Those two reference lengths are tuned so the static (sagged) pose is level — change one, you must rebalance the other or `recomputeStatics` will report nonzero pitch at rest.
   - Frame, rider, handlebars are placed along a normalized head→tail vector so they reorient correctly when the bike pitches. Front wheel is on the right of the canvas (xF = +wb/2).

**Scenarios** are pure functions: `terrain(t)` returns wheel terrain height + velocity, `loads(t)` returns longitudinal weight transfer forces. The scenario selector flips which contributes. Bump/pothole/washboard drive `yF`, `yR`; brake/accel/corner drive `Ff`, `Fr`. Jump uses a separate airborne branch in `step()` — free-fall until `yAir <= 0`, then injects landing velocity into the sprung mass.

**Tires are modeled** as a real mass-spring-damper between wheel and terrain (`mTire*`, `kTire*`, `cTire*` in `BIKE`; wheel states `ztF`/`ztR` in `sim`). Suspension compression is always `zDyn - zt` (sprung minus wheel) — keep travel checks, displays, and the progressive-spring fraction in that frame, never `sag + zDyn` alone.

**Sign conventions:** the dynamics frame is compression-positive (down): `zfDyn`/`ztF` positive = body/wheel moves down, so brake load `Ff>0` and jump landing `+vAir` compress. `terrain()` returns the *visual* frame (positive = ground rises) and is negated inside `stepWith`. Renderers therefore draw wheels at `-zt`. If you add a vertical quantity, decide its frame explicitly — a mixed frame silently swaps compression/rebound damping for terrain events (this bug existed and was fixed).

**Click convention** matches real clickers: counted OUT from fully closed, 0 clicks = max damping, 30 = min (`clickFrac = (30-c)/30` in `paramsFrom`). Presets, guides, HTML hints, and `idealSettings()` all assume this direction.

## Calibration constants

`BIKE` block at top of `<script>` holds all bike physics constants. These are **calibrated estimates**, not factory data — calibrated so stock + 85kg rider yields ~30% sag both ends and ζ ≈ 0.4. Changing `fK`/`rK` shifts sag immediately; verify `recomputeStatics()` still produces realistic numbers (sag 25-35%, fₙ 1.5-3 Hz, ζ 0.3-0.6) before committing.

Damping click mapping: clicks 0 = max damping, 30 = min. Linear interp between `*Min` and `*Max` per direction.

## Frame geometry constraint

If `forkLenU` and `rearArmU` are not chosen consistently with `rWheelF`, `rWheelR`, static sags, and rake, the bike will render pitched at rest. The relation (post-rake correction):

```text
rWheelF + (forkLenU - sagF) * cos(rake) == rWheelR + rearArmU - sagR
```

must hold (approximately) at stock rider weight. Current values: rWheelF=0.347, rWheelR=0.333, forkLenU=0.50, rearArmU=0.470. Note: rearArmU recalibrated to 0.470 for spec-accurate rake=25.8° (from 0.514→0.472→0.470 as geometry was corrected).
