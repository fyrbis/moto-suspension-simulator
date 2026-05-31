# Norden 901 Suspension Simulator

Interactive single-page HTML simulator for the Husqvarna Norden 901's WP APEX suspension. Change preload, compression, rebound, and rider load, then run scenarios (bump, pothole, washboard, braking, acceleration, jump, cornering) to see how the bike reacts in real time.

## Run

Double-click `index.html`. No build step, no internet required.

## How to use

1. Pick a **scenario** from the top-right dropdown.
2. Tune the **left panel** (rider weight, preload, compression/rebound clicks).
3. Press **Play**. Watch the 2D bike react; read live telemetry on the right.
4. Adjust scenario inputs at the bottom (speed, bump size, decel, jump height).
5. **Restore stock settings** resets all clickers to factory mid-range.

## What the metrics mean

- **Sag** — How much the suspension compresses under static + rider weight. Rear should sit around 30–35% of travel for road riding.
- **fₙ (natural frequency)** — Bounce frequency in Hz. Higher = stiffer feel. Norden ballpark: 2.2–3.0 Hz.
- **ζ (damping ratio)** — 0 = no damping (bouncy), 1 = critical. Real bikes run 0.3–0.5.
- **Dive / Squat** — Predicted front/rear travel use during a steady 1g brake / 0.5g accel.
- **Bottoming flag** — Lights red if either end hits its travel limit during the sim.

## Tuning tips you can confirm in the sim

| Symptom | Try |
|---------|-----|
| Bike sits too low / wallows | Add preload, firm comp |
| Harsh over small bumps | Soften compression |
| Packs down on washboard | Speed up rebound (fewer clicks of rebound) |
| Dives hard under brakes | Firm front compression or stiffer spring |
| Bottoms on jumps | Firm compression, more preload |

## Disclaimers

Spring rates, damping coefficients, and motion ratios are **best-effort estimates**, not factory data. Use this to build intuition — not to copy clicker counts onto your real bike. Always validate sag with a tape measure and trust your own riding feel.

Out of scope: tire compliance, frame flex, real linkage curve, aerodynamics, steering geometry / countersteer.

## Files

- `index.html` — everything (HTML, CSS, JS, physics, render)
- `README.md` — this file
