# Norden 901 Suspension Simulator

Interactive single-page HTML simulator for the Husqvarna Norden 901's WP APEX suspension. Change preload, compression, rebound, and rider load, then run scenarios (bump, pothole, washboard, braking, acceleration, jump, cornering) to see how the bike reacts in real time.

## Run

Double-click `index.html`. No build step, no internet required.

## How to use

1. Pick a **scenario** from the top-right dropdown.
2. Tune the **left panel** (rider weight, preload, compression/rebound clicks). Clickers follow the workshop convention: counted **out** from fully closed, so 0 = hardest, 30 = softest.
3. Press **Play**. Watch the 2D bike react; read live telemetry on the right.
4. Adjust scenario inputs at the bottom (speed, bump size, decel, jump height).
5. **Restore stock settings** resets all clickers to factory mid-range.

## What the metrics mean

- **Sag** — How much the suspension compresses under static + rider weight. Rear should sit around 30–35% of travel for road riding.
- **fₙ (natural frequency)** — Sprung-mass bounce frequency in Hz. Higher = stiffer feel. ADV ballpark: 1.5–2.5 Hz.
- **ζ (damping ratio)** — 0 = no damping (bouncy), 1 = critical. Real bikes run 0.3–0.5.
- **Dive / Squat** — Predicted front/rear travel use during a steady 1g brake / 0.5g accel.
- **Bottoming flag** — Lights red if either end hits its travel limit during the sim.

## Tuning tips you can confirm in the sim

| Symptom | Try |
|---------|-----|
| Bike sits too low / wallows | Add preload, firm comp |
| Harsh over small bumps | Soften compression |
| Packs down on washboard | Speed up rebound (more clicks out) |
| Dives hard under brakes | Firm front compression or stiffer spring |
| Bottoms on jumps | Firm compression, more preload |

## Disclaimers

Spring rates, damping coefficients, and motion ratios are **best-effort estimates**, not factory data. Use this to build intuition — not to copy clicker counts onto your real bike. Always validate sag with a tape measure and trust your own riding feel.

Modeled: quarter-car tire compliance (unsprung mass + tire spring/damper), two-stage (LSC/HSC) damping, chain anti-squat, aero weight transfer, progressive rear rate option. Out of scope: frame flex, real linkage curve, steering geometry / countersteer, tire knobs/traction.

## Files

- `index.html` — page structure and modals
- `style.css` — styling
- `physics.js` — constants, scenario inputs, integrator
- `render.js` — canvas drawing and charts
- `ui.js` — state, UI wiring, animation loop
- `README.md` — this file
