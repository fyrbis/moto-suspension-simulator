'use strict';

/* ==========================================================================
   NORDEN 901 SUSPENSION SIMULATOR — Physics constants & pure functions
   Half-car pitch+heave model, semi-implicit Euler, asymmetric comp/reb damping.
   All numbers metric SI internally (kg, m, N, s).
   ========================================================================== */

const $ = id => document.getElementById(id);

const g = 9.81;
const DT = 1/1000; // 1 ms fixed integration step

const BIKE = {
  mass: 218,            // kg wet (204 kg dry + ~14 kg for 19L tank at 0.74 kg/L)
  wb: 1.513,            // wheelbase m (spec: 1513 mm)
  hCg: 0.64,            // CoG height m — typical ADV ≈ 75% of seat height
  biasF: 0.48,          // front static weight share
  hSeat: 0.859,         // m — low seat position (spec: 859/879 mm)

  // Fork geometry — Norden 901 steering head angle 64.2° → rake = 90 - 64.2 = 25.8° from vertical
  rake: 25.8 * Math.PI / 180, // rad — fork rake from vertical
  trail: 0.107,               // m — trail (self-steering, not modelled in pitch-plane dynamics)
  // kF is already the wheel rate (effective vertical rate, includes rake cos² projection)

  // Front fork (calibrated so stock + 85kg rider gives ~30% sag)
  fTravel: 0.220,       // m
  fK: 19000,            // N/m wheel rate (vertical equivalent, ≈19 N/mm)
  fCcompMin: 500,  fCcompMax: 1800,   // Ns/m LSC range (clicks 30→0)
  fCrebMin: 500,   fCrebMax: 2100,
  // Two-stage (LSC / HSC) damping — WP APEX has hydraulic blow-off above knee velocity
  fLSCkneVel: 0.25,     // m/s — low/high speed knee point
  fHSCfactor: 0.36,     // HSC rate as fraction of LSC (above knee)

  // Rear shock at wheel (post motion-ratio)
  rTravel: 0.215,
  rK: 22000,            // N/m wheel rate (~22 N/mm)
  rCcompMin: 600, rCcompMax: 2200,
  rCrebMin: 600,  rCrebMax: 2600,
  rLSCkneVel: 0.22,
  rHSCfactor: 0.38,

  // Preload effect (force offsets equilibrium)
  fPrePerMm: 190,       // N per mm of front preload spacer
  rPrePerTurn: 90,      // N per rear collar turn at wheel (after MR scaling)
  rWheelF: 0.347,       // 21" front wheel rolling radius (rim + 90/90-21 tire)
  rWheelR: 0.333,       // 18" rear wheel rolling radius (rim + 150/70-18 tire)

  // Tire model (quarter-car unsprung mass; consistent with the 30 kg total
  // unsprung split in paramsFrom). Wheel-hop fn ≈ 14 Hz front, 12 Hz rear.
  mTireF: 15,           // kg — front wheel+axle+brakes+lower fork legs
  mTireR: 18,           // kg — rear wheel+axle+sprocket+~half swingarm
  kTireF: 120000,       // N/m radial tire stiffness (21" dirt-biased)
  kTireR: 100000,       // N/m radial tire stiffness (18" touring)
  cTireF: 140,          // Ns/m tire structural damping (ζ≈0.06, mostly elastic)
  cTireR: 150,

  // Anti-squat — chain drive geometry reduces effective weight transfer on acceleration.
  // Calibrated to ~75% (1st gear, stock sprockets). Ignores gear ratio in display formula.
  antiSquatFrac: 0.75,

  // Aerodynamics — Norden 901 ADV with beak fairing, moderate frontal area
  CdA: 0.62,            // m² drag area (Cd × frontal area)
  rhoAir: 1.225,        // kg/m³ air density at sea level
  hAero: 0.65,          // m — height of drag force application (≈fairing centroid)

  // Render geometry — fork compressed length at zero displacement (uncompressed)
  // Must satisfy: rWheelF + (forkLenU - sagF)*cos(rake) ≈ rWheelR + rearArmU - sagR
  forkLenU: 0.500,      // m — fork from axle to crown, at full extension
  rearArmU: 0.470,      // m — rear axle to pivot, at full extension

  // Display strings
  forkName: 'WP APEX 43mm',
  shockName: 'WP APEX shock',
  titleHTML: 'Husqvarna Norden <span class="y">901</span>',
};

/* Two-bike library — assign into BIKE to switch */
const BIKES = {
  norden901: {
    mass: 218, wb: 1.513, hCg: 0.64, biasF: 0.48, hSeat: 0.859,
    rake: 25.8 * Math.PI / 180, trail: 0.107,
    fTravel: 0.220, fK: 19000,
    fCcompMin: 500,  fCcompMax: 1800, fCrebMin: 500,  fCrebMax: 2100,
    fLSCkneVel: 0.25, fHSCfactor: 0.36,
    rTravel: 0.215, rK: 22000,
    rCcompMin: 600, rCcompMax: 2200, rCrebMin: 600, rCrebMax: 2600,
    rLSCkneVel: 0.22, rHSCfactor: 0.38,
    fPrePerMm: 190, rPrePerTurn: 90,
    rWheelF: 0.347, rWheelR: 0.333,
    mTireF: 15, mTireR: 18,
    kTireF: 120000, kTireR: 100000, cTireF: 140, cTireR: 150,
    antiSquatFrac: 0.75,
    CdA: 0.62, rhoAir: 1.225, hAero: 0.65,
    forkLenU: 0.500, rearArmU: 0.470,
    forkName: 'WP APEX 43mm', shockName: 'WP APEX shock',
    titleHTML: 'Husqvarna Norden <span class="y">901</span>',
  },
  desertx: {
    // Ducati DesertX — Marzocchi 46mm USD / Sachs shock, 230/220mm travel
    // Calibrated: stock + 85 kg rider → ~30% sag both ends, ζ ≈ 0.40
    mass: 218, wb: 1.500, hCg: 0.66, biasF: 0.47, hSeat: 0.875,
    rake: 25.0 * Math.PI / 180, trail: 0.110,
    fTravel: 0.230, fK: 17500,
    fCcompMin: 450,  fCcompMax: 1700, fCrebMin: 450,  fCrebMax: 2200,
    fLSCkneVel: 0.28, fHSCfactor: 0.38,
    rTravel: 0.220, rK: 22000,
    rCcompMin: 550, rCcompMax: 2100, rCrebMin: 550, rCrebMax: 2700,
    rLSCkneVel: 0.24, rHSCfactor: 0.40,
    fPrePerMm: 185, rPrePerTurn: 85,
    rWheelF: 0.347, rWheelR: 0.333,
    mTireF: 15, mTireR: 18,
    kTireF: 115000, kTireR: 98000, cTireF: 135, cTireR: 145,
    antiSquatFrac: 0.70,
    CdA: 0.58, rhoAir: 1.225, hAero: 0.68,
    // Geometry: rWheelF+(forkLenU-sagF)*cos(25°) ≈ rWheelR+rearArmU-sagR → 0.755 both sides
    forkLenU: 0.520, rearArmU: 0.489,
    forkName: 'Marzocchi 46mm', shockName: 'Sachs shock',
    titleHTML: 'Ducati <span class="y">DesertX</span>',
  },
};

const GUIDES = {
  static: {
    title: 'Static Sag Check — foundation of all other settings',
    what: 'How much travel is used at rest with rider aboard. Sets the bike\'s baseline geometry and determines how much travel is available for compression vs extension.',
    good: 'Street ADV: rear 30–35%, front 28–33%. Off-road: add 3–5% each end. Front/rear within 2–3% of each other.',
    try: 'Slide Rider weight → sag changes instantly. Add Rear Preload (turns) → sag drops without changing spring rate. Add Luggage → sag rises, may need more preload.',
    fix: 'Sag too high (>40%) = spring too soft for your weight, or needs preload. Sag too low (<20%) = too much preload or spring too stiff. Never set sag purely with preload — if 15 turns isn\'t enough, you need a stiffer spring.',
  },
  bump: {
    title: 'Road Bump — compression then rebound cycle',
    what: 'Front wheel hits, fork compresses (compression stroke). Spring energy releases, fork extends back (rebound stroke). The chart shows: sharp rise = compression, decay curve = rebound.',
    good: 'Fork uses 40–65% travel per hit. Returns to baseline in 1–1.5 oscillations. Rear follows front smoothly ~0.09s later (wheelbase/speed delay).',
    try: 'Soften Front Compression (more clicks out) → more travel used, smoother peak. Slow Front Rebound (clicks in, toward 0) → chart stays elevated after hit = packing. Use Loop mode to see how it accumulates.',
    fix: 'Bottoming = stiffen compression (fewer clicks) or add preload. Bouncy after hit = rebound too fast (reduce clicks toward 0). Harsh sharp spike = compression too stiff (add clicks).',
  },
  pothole: {
    title: 'Pothole — extension damping test',
    what: 'Wheel drops into hole then catches. Tests how fast the wheel can follow the road downward. Extension is limited by rebound damping — too slow means wheel loses contact with the road.',
    good: 'Front dips then recovers with pitch under 4°. No topout clunk. Wheel stays in contact.',
    try: 'Slow Rebound (0 clicks, full hard) → nose stays down after pothole, slow recovery. Fast Rebound (30 clicks out) → sharp pitch-up on exit edge.',
    fix: 'Wheel losing ground contact = rebound too slow (can\'t follow the road down). Topping out hard = rebound too fast, need more damping.',
  },
  washboard: {
    title: 'Washboard — resonance and packing test',
    what: 'Repeated bumps at fixed spacing. Critical test for rebound settings. If the suspension hasn\'t returned before the next hit arrives, it compresses from a deeper position each time — this is packing.',
    good: 'Travel chart stays flat and consistent (no trend up). Bike feels planted. Amplitude does not grow over time.',
    try: 'Set Rebound to 0 clicks (full hard, slow return) → watch chart climb each cycle. Increase Speed → find resonance where amplitude spikes. Set Rebound to 30 out → stable but may chatter.',
    fix: 'Growing amplitude = rebound too slow. Persistent chattering = compression too stiff or rebound too fast. Match front/rear rebound so both end respond similarly.',
  },
  brake: {
    title: 'Hard Braking — front dive and pitch',
    what: 'Braking force shifts weight forward: front gets extra load, rear unloads. Fork dives into compression. Pitch angle shows nose-down. Dive directly affects braking feel and ABS feedback.',
    good: 'Front uses 50–70% travel at 1g. Pitch 4–8°. Rear extends without topping out.',
    try: 'Soften Front Compression → more dive, longer lever to ABS, softer front feel. Stiffen → less dive, more feedback through bars, harsher feel. Add Front Preload → less dive (free extra travel).',
    fix: 'Excessive dive (>80%) = soften the decel slider, or stiffen compression and add preload. Rear topout clunk = rear rebound too fast.',
  },
  accel: {
    title: 'Acceleration — rear squat',
    what: 'Throttle shifts weight rearward. Rear compresses, front unloads and rises. Controls how the rear settles under power and whether the front stays planted.',
    good: 'Rear uses 35–55% travel at 0.5g. Front stays in contact (not fully extended).',
    try: 'Soften Rear Compression → more squat. Stiffen → less squat, firmer power delivery. Add Rear Preload → less squat from same damping.',
    fix: 'Too much squat (>65%) = rear too soft or insufficient preload. Front lifting completely = rear too stiff, weight transfer too aggressive for this spring rate.',
  },
  jump: {
    title: 'Jump Landing — impact absorption',
    what: 'Free fall from height onto flat ground. In the air the suspension tops out; on landing, kinetic energy (½mv²) is absorbed by springs and dampers. From 1m: impact ≈ 4.4 m/s. The rider is modelled rigid — real riders absorb a lot with their legs.',
    good: '0.3m drop: ~90% travel, no bottoming. Flat landings above ~0.5m bottom almost any stock ADV setup — that is realistic; riders land on downslopes for this reason. Front and rear should compress by similar percentages.',
    try: 'Soften compression → bottoming flag fires. Add Preload → less static sag = more travel reserve. Increase jump height gradually to find your setup\'s limit.',
    fix: 'Bottoming = stiffen compression, add preload, or fit heavier springs. One end bottoms before other = spring rates mismatched. Harsh landing through bars = compression too stiff.',
  },
  corner: {
    title: 'Cornering Load — both ends loaded',
    what: 'Lateral G requires lean. Leaning multiplies vertical load on both wheels by 1/cos(lean angle). At 45° lean: +41% load. At 60° lean: +100%. Both springs compress.',
    good: 'Both ends under 70% travel at 0.8g. Front/rear stay balanced (similar % usage).',
    try: 'Increase Decel/G slider → both ends compress. Watch if one end hits 100% first — that end needs more preload or stiffer spring for two-up/luggage riding.',
    fix: 'Both ends bottoming = need more preload across the board for loaded riding. Front bottoms first = front spring too soft. Rear first = rear spring too soft.',
  },
};

const STOCK = {
  rider:85, pillion:0, luggage:0,
  fPre:0, fComp:15, fReb:15,
  rPre:0, rComp:15, rReb:15,
  speed:10, bumpH:110, bumpL:1500, bumpGap:4.5, decel:1.0, jumpH:0.4,
  scenario:'bump',
};

// Damping ratio targets and sag targets vary by what you're optimising for
const SCENARIO_IDEAL = {
  static:    { zetaComp:0.35, zetaReb:0.45, sagPct:0.30, note:'Sag 30% both ends. Fix with preload, not damping.' },
  bump:      { zetaComp:0.30, zetaReb:0.45, sagPct:0.30, note:'Street balance: soft comp = plush, firm reb = no bounce.' },
  pothole:   { zetaComp:0.28, zetaReb:0.35, sagPct:0.30, note:'Fast rebound = wheel tracks road down into hole.' },
  washboard: { zetaComp:0.25, zetaReb:0.35, sagPct:0.30, note:'Slow reb → packing. Keep reb ζ < 0.40.' },
  brake:     { zetaComp:0.42, zetaReb:0.50, sagPct:0.27, note:'Firm comp = less dive. Lower sag = more travel reserve.' },
  accel:     { zetaComp:0.38, zetaReb:0.45, sagPct:0.30, note:'Firm rear comp controls squat under power.' },
  jump:      { zetaComp:0.22, zetaReb:0.30, sagPct:0.33, note:'Max travel: soft comp absorbs landing, fast reb resets.' },
  corner:    { zetaComp:0.40, zetaReb:0.50, sagPct:0.27, note:'Firmer both ends. Lower sag = reserve for load transfer.' },
};

// Named suspension setups — damping + preload only, rider weight set by user
const PRESETS = {
  sport:   { label:'Sport',
             fComp:8,  fReb:10, rComp:8,  rReb:10, fPre:2, rPre:2,
             desc:'Pavement. Stiffer comp/reb, slight preload. Less dive, sharper response.' },
  offroad: { label:'Off-Road',
             fComp:23, fReb:19, rComp:23, rReb:19, fPre:0, rPre:0,
             desc:'Trails/gravel. Soft comp uses full travel, fast reb tracks rough terrain.' },
  touring: { label:'Touring',
             fComp:13, fReb:14, rComp:13, rReb:14, fPre:6, rPre:9,
             desc:'Loaded +gear. Preload restores sag, moderate damping for stability.' },
  heavy:   { label:'Heavy Load',
             fComp:10, fReb:12, rComp:10, rReb:12, fPre:5, rPre:10,
             desc:'Two-up + luggage. High preload restores sag. Firm damping handles extra mass.' },
  enduro:  { label:'Enduro',
             fComp:25, fReb:22, rComp:25, rReb:22, fPre:0, rPre:0,
             desc:'Full soft. Max travel use. Absorbs big hits on rocks and rough terrain.' },
  bigJump: { label:'Big Jump',
             fComp:22, fReb:18, rComp:22, rReb:18, fPre:8, rPre:8,
             desc:'Extra preload banks travel reserve. Soft comp absorbs landing; fast reb resets.' },
};

/* ---------- Two-stage damping force (piecewise linear LSC/HSC) ---------- */
// WP APEX forks have a hydraulic blow-off valve: full LSC rate below knee velocity,
// reduced HSC rate above — isolates chassis from large bumps while controlling body motion.
function dampForce(relVel, cLSC, cHSC, kneVel) {
  const s = relVel > 0 ? 1 : -1;
  const v = Math.abs(relVel);
  if (v <= kneVel) return cLSC * relVel;
  return s * (cLSC * kneVel + cHSC * (v - kneVel));
}

/* ---------- Derived bike params from state ---------- */
function paramsFrom(st){
  const m_total = BIKE.mass + st.rider + st.pillion + st.luggage;
  const m_unsprung = 30;
  const m_sprung = m_total - m_unsprung;
  const riderBias = 0.52;
  const m_front_sprung = m_sprung * BIKE.biasF - (st.rider+st.pillion+st.luggage)*(riderBias-BIKE.biasF);
  const m_rear_sprung  = m_sprung - m_front_sprung;
  const kF = BIKE.fK, kR = BIKE.rK;
  // Real clicker convention: clicks counted OUT from fully closed.
  // 0 clicks = adjuster fully in = MAX damping; 30 clicks out = MIN damping.
  const clickFrac = c => (30-c)/30;
  const lerp = (a,b,t)=> a+(b-a)*t;
  const cFcomp = lerp(BIKE.fCcompMin, BIKE.fCcompMax, clickFrac(st.fComp));
  const cFreb  = lerp(BIKE.fCrebMin,  BIKE.fCrebMax,  clickFrac(st.fReb));
  const cRcomp = lerp(BIKE.rCcompMin, BIKE.rCcompMax, clickFrac(st.rComp));
  const cRreb  = lerp(BIKE.rCrebMin,  BIKE.rCrebMax,  clickFrac(st.rReb));
  // HSC rates: blow-off reduces damping above knee velocity
  const cFcomp_hsc = cFcomp * BIKE.fHSCfactor;
  const cFreb_hsc  = cFreb  * BIKE.fHSCfactor;
  const cRcomp_hsc = cRcomp * BIKE.rHSCfactor;
  const cRreb_hsc  = cRreb  * BIKE.rHSCfactor;
  const Fpre_F = st.fPre * BIKE.fPrePerMm;
  const Fpre_R = st.rPre * BIKE.rPrePerTurn;
  return {m_total,m_sprung,m_front_sprung,m_rear_sprung,kF,kR,
          cFcomp,cFreb,cRcomp,cRreb,
          cFcomp_hsc,cFreb_hsc,cRcomp_hsc,cRreb_hsc,
          Fpre_F,Fpre_R, progression: st.progression || 0};
}
function params(){ return paramsFrom(state); }

/* ---------- Scenario terrain & loads ---------- */
// returns {yF, yR, yFv, yRv} terrain at wheels (m) and vertical velocity (m/s)
function terrain(t){
  const v = state.speed / 3.6; // m/s
  const out = {yF:0,yR:0,yFv:0,yRv:0};
  if (state.scenario === 'bump' || state.scenario==='pothole') {
    const sign = state.scenario === 'pothole' ? -1 : 1;
    const h = state.bumpH/1000 * sign;
    const L = state.bumpL/1000;
    // In loop mode, bumps repeat every (L + gap). Otherwise single bump at t≈0.3s.
    const gap = Math.max(0.5, +state.bumpGap || Math.max(2.0, L*3)); // m between bumps
    const period = L + gap;
    const profile = x => (x > 0 && x < L) ? h * 0.5*(1 - Math.cos(2*Math.PI*x/L)) : 0;
    const dProfile = x => (x > 0 && x < L) ? h * Math.PI/L * Math.sin(2*Math.PI*x/L) : 0;
    let xf, xr;
    if (loopMode) {
      xf = ((v * t - 0.3*v) % period + period) % period;
      xr = ((v * t - 0.3*v - BIKE.wb) % period + period) % period;
    } else {
      xf = v * t - 0.3*v;
      xr = xf - BIKE.wb;
    }
    out.yF = profile(xf); out.yR = profile(xr);
    out.yFv = dProfile(xf) * v; out.yRv = dProfile(xr) * v;
  } else if (state.scenario === 'washboard') {
    const h = state.bumpH/2000;
    const L = state.bumpL/1000;
    const phaseF = 2*Math.PI*(v*t)/L;
    const phaseR = 2*Math.PI*(v*t - BIKE.wb)/L;
    out.yF = h*Math.sin(phaseF); out.yR = h*Math.sin(phaseR);
    out.yFv = h*Math.cos(phaseF) * 2*Math.PI*v/L;
    out.yRv = h*Math.cos(phaseR) * 2*Math.PI*v/L;
  }
  // Safety cap: prevents explosion on extreme user settings (e.g. 300mm bump at 160 km/h).
  // Tire model handles realistic compliance filtering; this only fires on degenerate inputs.
  const VMAX = 8.0;
  out.yFv = Math.max(-VMAX, Math.min(VMAX, out.yFv));
  out.yRv = Math.max(-VMAX, Math.min(VMAX, out.yRv));
  return out;
}

function loads(t, p){
  if(!p) p = params();
  let Ff=0, Fr=0;

  // Aerodynamic drag → weight transfer. At constant speed, drag (backward, at
  // hAero) is balanced by drive thrust (forward, at the rear contact patch);
  // the couple pitches the bike nose-UP: rear loads, front unloads.
  // F_drag = ½ρ·CdA·v²; transfer = F_drag·hAero/wb
  if (state.scenario !== 'static' && state.scenario !== 'jump') {
    const v = state.speed / 3.6;
    const Fdrag = 0.5 * BIKE.rhoAir * BIKE.CdA * v * v;
    const aeroWT = Fdrag * BIKE.hAero / BIKE.wb;
    Ff -= aeroWT;
    Fr += aeroWT;
  }

  if (state.scenario === 'brake') {
    const a = state.decel * g * Math.min(1, t/0.2);
    const dW = p.m_total * a * BIKE.hCg / BIKE.wb;
    Ff += dW; Fr -= dW;
  } else if (state.scenario === 'accel') {
    const a = state.decel * g * Math.min(1, t/0.2);
    const dW = p.m_total * a * BIKE.hCg / BIKE.wb;
    Ff -= dW;
    // Chain drive anti-squat: sprocket geometry creates upward moment on swingarm,
    // partially cancelling the rearward weight transfer. ~75% in 1st gear.
    Fr += dW * (1 - BIKE.antiSquatFrac);
  } else if (state.scenario === 'corner') {
    const ay = state.decel * g * Math.min(1, t/0.2);
    const lean = Math.atan(ay/g);
    const extra = (1/Math.cos(lean) - 1) * p.m_total * g;
    Ff += extra * BIKE.biasF;
    Fr += extra * (1-BIKE.biasF);
  }
  return {Ff, Fr};
}

/* ---------- Integrator (quarter-car tire model) ---------- */
// simObj carries ztF/ztFv/ztR/ztRv — wheel (unsprung) position/velocity deviations.
// Suspension spring connects sprung↔wheel. Tire spring+damper connects wheel↔terrain.
// Progressive rear rate: effectiveKR = kR × (1 + progression% × travel_fraction).
function stepWith(dt, simObj, p, sag){
  if(simObj.airborne){
    simObj.vAir+=g*dt; simObj.yAir-=simObj.vAir*dt;
    if(simObj.yAir<=0){
      // Whole bike lands with downward velocity vAir (down-positive frame):
      // wheels too, so the tire spring absorbs the initial spike realistically.
      simObj.zfV+=simObj.vAir; simObj.zrV+=simObj.vAir;
      simObj.ztFv+=simObj.vAir; simObj.ztRv+=simObj.vAir;
      simObj.airborne=false; simObj.yAir=0;
    }
    simObj.t+=dt; return;
  }
  const ter=terrain(simObj.t);
  const ld=loads(simObj.t, p);

  // terrain() is in the visual frame (positive = ground rises). The dynamics
  // frame is compression-positive (zfDyn/zrDyn positive = sprung settles down,
  // matching brake dive Ff>0 and jump landing +vAir), so terrain enters
  // negated and ztF/ztR are down-positive too. Renderers draw wheels at -zt.
  const yFt=-ter.yF, yRt=-ter.yR, yFvt=-ter.yFv, yRvt=-ter.yRv;

  // Suspension relative motion (sprung vs wheel)
  const crF=simObj.zfV-simObj.ztFv, crR=simObj.zrV-simObj.ztRv;
  const xF=simObj.zfDyn-simObj.ztF, xR=simObj.zrDyn-simObj.ztR;

  // Two-stage damping: LSC rate below knee velocity, reduced HSC rate above
  const FdF = crF>0 ? dampForce(crF, p.cFcomp, p.cFcomp_hsc, BIKE.fLSCkneVel)
                    : dampForce(crF, p.cFreb,  p.cFreb_hsc,  BIKE.fLSCkneVel);
  const FdR = crR>0 ? dampForce(crR, p.cRcomp, p.cRcomp_hsc, BIKE.rLSCkneVel)
                    : dampForce(crR, p.cRreb,  p.cRreb_hsc,  BIKE.rLSCkneVel);

  // Progressive rear spring (front is linear) — uses per-sim progression from p
  const progFrac=(p.progression||0)/100;
  const rTravNow=Math.max(0, sag.r+simObj.zrDyn-simObj.ztR)/BIKE.rTravel;
  const effKR=p.kR*(1+progFrac*rTravNow);

  // Sprung mass accelerations
  const aF=(-p.kF*xF-FdF+ld.Ff)/p.m_front_sprung;
  const aR=(-effKR*xR-FdR+ld.Fr)/p.m_rear_sprung;

  // Tire spring+damper forces on wheel (terrain→wheel)
  const tireCrF=simObj.ztFv-yFvt, tireCrR=simObj.ztRv-yRvt;
  const aTF=(p.kF*xF+FdF+BIKE.kTireF*(yFt-simObj.ztF)-BIKE.cTireF*tireCrF)/BIKE.mTireF;
  const aTR=(effKR*xR+FdR+BIKE.kTireR*(yRt-simObj.ztR)-BIKE.cTireR*tireCrR)/BIKE.mTireR;

  // Semi-implicit Euler
  simObj.zfV +=aF*dt;  simObj.zrV +=aR*dt;
  simObj.ztFv+=aTF*dt; simObj.ztRv+=aTR*dt;
  simObj.zfDyn+=simObj.zfV*dt;  simObj.zrDyn+=simObj.zrV*dt;
  simObj.ztF  +=simObj.ztFv*dt; simObj.ztR  +=simObj.ztRv*dt;

  // Travel limits use suspension compression (sprung minus wheel), same frame
  // as the spring force xF/xR and the UI travel display. At a stop the sprung
  // and wheel move together, so velocities are matched rather than zeroed.
  const tF=sag.f+simObj.zfDyn-simObj.ztF, tR=sag.r+simObj.zrDyn-simObj.ztR;
  if(tF>BIKE.fTravel||tR>BIKE.rTravel) simObj.bottom=true;
  if(tF<0){simObj.zfDyn=simObj.ztF-sag.f; if(simObj.zfV<simObj.ztFv) simObj.zfV=simObj.ztFv;}
  if(tR<0){simObj.zrDyn=simObj.ztR-sag.r; if(simObj.zrV<simObj.ztRv) simObj.zrV=simObj.ztRv;}
  if(tF>BIKE.fTravel){simObj.zfDyn=simObj.ztF+BIKE.fTravel-sag.f; if(simObj.zfV>simObj.ztFv) simObj.zfV=simObj.ztFv;}
  if(tR>BIKE.rTravel){simObj.zrDyn=simObj.ztR+BIKE.rTravel-sag.r; if(simObj.zrV>simObj.ztRv) simObj.zrV=simObj.ztRv;}

  const aMag=Math.max(Math.abs(aF),Math.abs(aR));
  simObj.lastA=aMag;
  if(aMag>simObj.peakA) simObj.peakA=aMag;
  simObj.t+=dt;
}

/* ---------- Bump response simulation (used by charts) ---------- */
function buildBumpData(st, sag){
  const p=paramsFrom(st);
  const mF=p.m_front_sprung, mR=p.m_rear_sprung;
  const kF=BIKE.fK, kR=BIKE.rK;
  const cFc=p.cFcomp, cFr=p.cFreb, cRc=p.cRcomp, cRr=p.cRreb;
  const cFc_h=p.cFcomp_hsc, cFr_h=p.cFreb_hsc, cRc_h=p.cRcomp_hsc, cRr_h=p.cRreb_hsc;
  const sagF=sag.f, sagR=sag.r;
  const v=st.speed/3.6, bH=st.bumpH/1000, bL=st.bumpL/1000;
  const prof=x=>(x>0&&x<bL)?bH*0.5*(1-Math.cos(2*Math.PI*x/bL)):0;
  const vel =x=>(x>0&&x<bL)?bH*Math.PI/bL*Math.sin(2*Math.PI*x/bL)*v:0;
  const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
  let zF=0,zvF=0,zR=0,zvR=0;
  const pts=[], tMax=2.5, dt=0.001;
  for(let i=0;i*dt<tMax;i++){
    const t=i*dt;
    const xF=v*t-0.3*v, xR=xF-BIKE.wb;
    const yF=prof(xF),yR=prof(xR);
    const yvF=clamp(vel(xF),-2.5,2.5), yvR=clamp(vel(xR),-2.5,2.5);
    // zF/zR = sprung heave (up-positive). Compression = sag + y - z, so the
    // damper is in compression when crF = zvF - yvF < 0 (body falling vs road).
    const crF=zvF-yvF, crR=zvR-yvR;
    const FdF=crF<0?dampForce(crF,cFc,cFc_h,BIKE.fLSCkneVel):dampForce(crF,cFr,cFr_h,BIKE.fLSCkneVel);
    const FdR=crR<0?dampForce(crR,cRc,cRc_h,BIKE.rLSCkneVel):dampForce(crR,cRr,cRr_h,BIKE.rLSCkneVel);
    zvF+=((-kF*(zF-yF)-FdF)/mF)*dt; zF+=zvF*dt;
    zvR+=((-kR*(zR-yR)-FdR)/mR)*dt; zR+=zvR*dt;
    const qF=sagF+yF-zF, qR=sagR+yR-zR;
    const tvlF=clamp(qF,0,BIKE.fTravel), tvlR=clamp(qR,0,BIKE.rTravel);
    if(qF<0){zF=sagF+yF; zvF=Math.min(zvF,yvF);}
    if(qF>BIKE.fTravel){zF=sagF+yF-BIKE.fTravel; zvF=Math.max(zvF,yvF);}
    if(qR<0){zR=sagR+yR; zvR=Math.min(zvR,yvR);}
    if(qR>BIKE.rTravel){zR=sagR+yR-BIKE.rTravel; zvR=Math.max(zvR,yvR);}
    if(i%4===0) pts.push({t, f:tvlF/BIKE.fTravel, r:tvlR/BIKE.rTravel});
  }
  return {pts, sagF:sagF/BIKE.fTravel, sagR:sagR/BIKE.rTravel, mF, mR, kF, kR};
}
function buildRefData(){ return buildBumpData(state, staticSag); }

/* Ideal bump response — uses scenario-specific ζ targets */
function buildIdealData(){
  const tgt=SCENARIO_IDEAL[state.scenario]||SCENARIO_IDEAL.bump;
  const p=params();
  const mF=p.m_front_sprung, mR=p.m_rear_sprung;
  const kF=BIKE.fK, kR=BIKE.rK;
  const cFc=tgt.zetaComp*2*Math.sqrt(kF*mF), cFr=tgt.zetaReb*2*Math.sqrt(kF*mF);
  const cRc=tgt.zetaComp*2*Math.sqrt(kR*mR), cRr=tgt.zetaReb*2*Math.sqrt(kR*mR);
  const cFc_h=cFc*BIKE.fHSCfactor, cFr_h=cFr*BIKE.fHSCfactor;
  const cRc_h=cRc*BIKE.rHSCfactor, cRr_h=cRr*BIKE.rHSCfactor;
  const sagF=staticSag.f, sagR=staticSag.r;
  const v=state.speed/3.6, bH=state.bumpH/1000, bL=state.bumpL/1000;
  const prof=x=>(x>0&&x<bL)?bH*0.5*(1-Math.cos(2*Math.PI*x/bL)):0;
  const vel =x=>(x>0&&x<bL)?bH*Math.PI/bL*Math.sin(2*Math.PI*x/bL)*v:0;
  const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
  let zF=0,zvF=0,zR=0,zvR=0;
  const pts=[], tMax=2.5, dt=0.001;
  for(let i=0;i*dt<tMax;i++){
    const t=i*dt;
    const xF=v*t-0.3*v, xR=xF-BIKE.wb;
    const yF=prof(xF),yR=prof(xR);
    const yvF=clamp(vel(xF),-2.5,2.5), yvR=clamp(vel(xR),-2.5,2.5);
    // Same compression-frame conventions as buildBumpData above.
    const crF=zvF-yvF, crR=zvR-yvR;
    const FdF=crF<0?dampForce(crF,cFc,cFc_h,BIKE.fLSCkneVel):dampForce(crF,cFr,cFr_h,BIKE.fLSCkneVel);
    const FdR=crR<0?dampForce(crR,cRc,cRc_h,BIKE.rLSCkneVel):dampForce(crR,cRr,cRr_h,BIKE.rLSCkneVel);
    zvF+=((-kF*(zF-yF)-FdF)/mF)*dt; zF+=zvF*dt;
    zvR+=((-kR*(zR-yR)-FdR)/mR)*dt; zR+=zvR*dt;
    const qF=sagF+yF-zF, qR=sagR+yR-zR;
    const tvlF=clamp(qF,0,BIKE.fTravel), tvlR=clamp(qR,0,BIKE.rTravel);
    if(qF<0){zF=sagF+yF; zvF=Math.min(zvF,yvF);}
    if(qF>BIKE.fTravel){zF=sagF+yF-BIKE.fTravel; zvF=Math.max(zvF,yvF);}
    if(qR<0){zR=sagR+yR; zvR=Math.min(zvR,yvR);}
    if(qR>BIKE.rTravel){zR=sagR+yR-BIKE.rTravel; zvR=Math.max(zvR,yvR);}
    if(i%4===0) pts.push({t, f:tvlF/BIKE.fTravel, r:tvlR/BIKE.rTravel});
  }
  return {pts, sagF:sagF/BIKE.fTravel, sagR:sagR/BIKE.rTravel};
}

/* Anti-squat / anti-dive geometry */
function computeAntiGeometry(sag){
  // Pure chain-angle formula (no gear ratio) gives ~12% — misleading, ignores the gear ratio
  // multiplier that makes chain tension >> weight-transfer force. Physics model uses the
  // calibrated 75% value from BIKE.antiSquatFrac (realistic for 1st–3rd gear average).
  const antiSquat = Math.round(BIKE.antiSquatFrac * 100);
  // Anti-dive: conventional fork = 0% (no linked brake geometry)
  return { antiSquat, antiDive: 0 };
}

/* Simple DFT spectrum for live history (O(N²) but N≤128, runs on demand) */
function computeSpectrum(history, end){
  const N = Math.min(128, history.length);
  if(N < 8) return [];
  const raw = history.slice(-N).map(h => end==='f' ? h.f : h.r);
  const dt = N > 1 ? (history[history.length-1].t - history[history.length-N].t)/(N-1) : 1/60;
  const sr = 1/dt;
  const mean = raw.reduce((s,v)=>s+v,0)/N;
  const win = raw.map((v,i) => (v-mean)*(0.5-0.5*Math.cos(2*Math.PI*i/(N-1))));
  const result = [];
  const halfN = Math.floor(N/2);
  for(let k=0; k<=halfN; k++){
    let re=0, im=0;
    for(let n=0; n<N; n++){
      const a=2*Math.PI*k*n/N;
      re+=win[n]*Math.cos(a); im-=win[n]*Math.sin(a);
    }
    const freq=k*sr/N;
    if(freq>12) break;
    result.push({freq, amp: Math.sqrt(re*re+im*im)*2/N});
  }
  return result;
}

/* Recommended clicks + preload for current mass + active scenario */
function idealSettings(){
  const tgt=SCENARIO_IDEAL[state.scenario]||SCENARIO_IDEAL.bump;
  const p=params();
  // Inverse of the click mapping: 0 clicks out = cMax, 30 clicks out = cMin
  const toClicks=(c,cMin,cMax)=>Math.round(Math.max(0,Math.min(30,30*(cMax-c)/(cMax-cMin))));
  const fCompC=toClicks(tgt.zetaComp*2*Math.sqrt(BIKE.fK*p.m_front_sprung),BIKE.fCcompMin,BIKE.fCcompMax);
  const fRebC =toClicks(tgt.zetaReb *2*Math.sqrt(BIKE.fK*p.m_front_sprung),BIKE.fCrebMin, BIKE.fCrebMax);
  const rCompC=toClicks(tgt.zetaComp*2*Math.sqrt(BIKE.rK*p.m_rear_sprung), BIKE.rCcompMin,BIKE.rCcompMax);
  const rRebC =toClicks(tgt.zetaReb *2*Math.sqrt(BIKE.rK*p.m_rear_sprung), BIKE.rCrebMin, BIKE.rCrebMax);
  const fPreF=p.m_front_sprung*g-BIKE.fK*tgt.sagPct*BIKE.fTravel;
  const rPreF=p.m_rear_sprung *g-BIKE.rK*tgt.sagPct*BIKE.rTravel;
  const fPreMm   =Math.round(Math.max(0,Math.min(15,fPreF/BIKE.fPrePerMm)));
  const rPreTurns=Math.round(Math.max(0,Math.min(15,rPreF/BIKE.rPrePerTurn)));
  const zetaFC=p.cFcomp/(2*Math.sqrt(BIKE.fK*p.m_front_sprung));
  const zetaFR=p.cFreb /(2*Math.sqrt(BIKE.fK*p.m_front_sprung));
  const zetaRC=p.cRcomp/(2*Math.sqrt(BIKE.rK*p.m_rear_sprung));
  const zetaRR=p.cRreb /(2*Math.sqrt(BIKE.rK*p.m_rear_sprung));
  return {fCompC,fRebC,rCompC,rRebC,fPreMm,rPreTurns,zetaFC,zetaFR,zetaRC,zetaRR,
          zetaCompTarget:tgt.zetaComp, zetaRebTarget:tgt.zetaReb, note:tgt.note};
}
