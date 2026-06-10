'use strict';

/* ==========================================================================
   NORDEN 901 SUSPENSION SIMULATOR — State, UI wiring, animation loop
   Depends on globals from physics.js and render.js.
   ========================================================================== */

/* ---------- Mutable globals ---------- */
let loopMode = false;
let compareMode = false;
let playing = false;
let lastT = 0;
let slowmoFactor = 1.0;
let scrubbing = false;

// Inject progression into STOCK if not already present (rear progressive rate %)
STOCK.progression = 0;
const state = structuredClone(STOCK);

const SNAP_COLORS = ['#ce93d8','#a5d6a7','#ffab40','#f48fb1'];
let snapshots = [];

/* ---------- Static metrics ---------- */
let staticSag = {f:0,r:0};

function recomputeStatics(){
  const p = params();
  const sagF_m = Math.max(0, (p.m_front_sprung*g - p.Fpre_F) / p.kF);
  const sagR_m = Math.max(0, (p.m_rear_sprung*g  - p.Fpre_R) / p.kR);
  staticSag = { f: sagF_m, r: sagR_m };

  const fnF = (1/(2*Math.PI)) * Math.sqrt(p.kF / p.m_front_sprung);
  const fnR = (1/(2*Math.PI)) * Math.sqrt(p.kR / p.m_rear_sprung);
  const cF_avg = (p.cFcomp + p.cFreb) / 2;
  const cR_avg = (p.cRcomp + p.cRreb) / 2;
  const zF = cF_avg / (2 * Math.sqrt(p.kF * p.m_front_sprung));
  const zR = cR_avg / (2 * Math.sqrt(p.kR * p.m_rear_sprung));

  const dW_brake = p.m_total * 1.0 * g * BIKE.hCg / BIKE.wb;
  const dive_m = Math.max(0, (p.m_front_sprung*g + dW_brake - p.Fpre_F)/p.kF) - sagF_m;
  const dW_accel = p.m_total * 0.5 * g * BIKE.hCg / BIKE.wb;
  const squat_m = Math.max(0, (p.m_rear_sprung*g + dW_accel - p.Fpre_R)/p.kR) - sagR_m;

  const sagFpct = sagF_m/BIKE.fTravel*100;
  const sagRpct = sagR_m/BIKE.rTravel*100;
  $('m_fSag').textContent = `${(sagF_m*1000).toFixed(0)} mm · ${sagFpct.toFixed(0)}%`;
  $('m_rSag').textContent = `${(sagR_m*1000).toFixed(0)} mm · ${sagRpct.toFixed(0)}%`;
  $('m_fHz').textContent = `${fnF.toFixed(2)} Hz`;
  $('m_rHz').textContent = `${fnR.toFixed(2)} Hz`;
  $('m_fZ').textContent = zF.toFixed(2);
  $('m_rZ').textContent = zR.toFixed(2);
  $('m_dive').textContent = `${(dive_m*1000).toFixed(0)} mm · ${(dive_m/BIKE.fTravel*100).toFixed(0)}%`;
  $('m_squat').textContent = `${(squat_m*1000).toFixed(0)} mm · ${(squat_m/BIKE.rTravel*100).toFixed(0)}%`;

  setTileColor('fSag',  sagFpct, [10, 22, 38, 50]);
  setTileColor('rSag',  sagRpct, [10, 25, 40, 55]);
  setTileColor('fHz',   fnF,     [0.8, 1.4, 3.2, 4.5]);
  setTileColor('rHz',   fnR,     [0.8, 1.4, 3.2, 4.5]);
  setTileColor('fZ',    zF,      [0.05, 0.18, 0.65, 1.0]);
  setTileColor('rZ',    zR,      [0.05, 0.18, 0.65, 1.0]);

  const ag = computeAntiGeometry(staticSag);
  const asEl = $('m_antiSquat'), adEl = $('m_antiDive');
  if(asEl) asEl.textContent = `${ag.antiSquat}%`;
  if(adEl) adEl.textContent = `${ag.antiDive}%`;

  diagnose();
}

/* ---------- Diagnosis heuristic ---------- */
function diagnose(){
  const el=$('diagCard'); if(!el) return;
  const p=params();
  const sagFpct=staticSag.f/BIKE.fTravel*100;
  const sagRpct=staticSag.r/BIKE.rTravel*100;
  const zFcomp=p.cFcomp/(2*Math.sqrt(BIKE.fK*p.m_front_sprung));
  const zFreb =p.cFreb /(2*Math.sqrt(BIKE.fK*p.m_front_sprung));
  const zRcomp=p.cRcomp/(2*Math.sqrt(BIKE.rK*p.m_rear_sprung));
  const zRreb =p.cRreb /(2*Math.sqrt(BIKE.rK*p.m_rear_sprung));
  const peakG=sim.peakA/g;
  const fComp=Math.max(0,staticSag.f+sim.zfDyn-sim.ztF), rComp=Math.max(0,staticSag.r+sim.zrDyn-sim.ztR);
  const pitchDeg=Math.atan2((BIKE.rWheelR-sim.ztR+BIKE.rearArmU-rComp)-(BIKE.rWheelF-sim.ztF+(BIKE.forkLenU-fComp)*Math.cos(BIKE.rake)),BIKE.wb)*180/Math.PI;
  const msgs=[];

  if(sagFpct>42)       msgs.push({c:'#ff8a00',t:'Front sag >42% — add preload or fit stiffer spring.'});
  else if(sagFpct<20)  msgs.push({c:'#ffe300',t:'Front sag <20% — too much preload or spring too stiff.'});
  if(sagRpct>46)       msgs.push({c:'#ff8a00',t:'Rear sag >46% — add preload or fit stiffer spring.'});
  else if(sagRpct<22)  msgs.push({c:'#ffe300',t:'Rear sag <22% — too much preload or spring too stiff.'});

  if(sim.bottom){
    if(fComp/BIKE.fTravel>0.90) msgs.push({c:'#ff3b30',t:'⚠ Front bottoming — turn F compression clicks in (toward 0) or add preload.'});
    if(rComp/BIKE.rTravel>0.90) msgs.push({c:'#ff3b30',t:'⚠ Rear bottoming — turn R compression clicks in (toward 0) or add preload.'});
  }
  if(sim.t>0.3 && !sim.airborne){
    if(fComp/BIKE.fTravel<0.18 && sagFpct<35) msgs.push({c:'#ffe300',t:'Front barely uses travel — compression too stiff for this scenario.'});
    if(rComp/BIKE.rTravel<0.18 && sagRpct<40) msgs.push({c:'#ffe300',t:'Rear barely uses travel — compression too stiff for this scenario.'});
  }
  if(Math.abs(pitchDeg)>4.5){
    if(pitchDeg>4.5)  msgs.push({c:'#ff8a00',t:`Nose-down ${pitchDeg.toFixed(1)}° — front diving more. Check front sag & compression.`});
    else              msgs.push({c:'#ff8a00',t:`Nose-up ${(-pitchDeg).toFixed(1)}° — rear squatting more. Check rear sag & compression.`});
  }
  if(peakG>4.5) msgs.push({c:'#ff3b30',t:`Peak ${peakG.toFixed(1)}g — very harsh hit. Soften compression or check spring rate.`});
  if(zFreb>0.62) msgs.push({c:'#ff8a00',t:`Front rebound slow (ζ=${zFreb.toFixed(2)}) — packing risk on repeated bumps.`});
  if(zFreb<0.14) msgs.push({c:'#ffe300',t:`Front rebound too fast (ζ=${zFreb.toFixed(2)}) — wheel chatter / traction loss.`});
  if(zRreb>0.65) msgs.push({c:'#ff8a00',t:`Rear rebound slow (ζ=${zRreb.toFixed(2)}) — rear packs down on washboard.`});
  if(zRreb<0.14) msgs.push({c:'#ffe300',t:`Rear rebound too fast (ζ=${zRreb.toFixed(2)}) — rear kick after bumps.`});
  if(Math.abs(sagFpct-sagRpct)>10) msgs.push({c:'#ffe300',t:`Sag imbalance: front ${sagFpct.toFixed(0)}% vs rear ${sagRpct.toFixed(0)}% — bike will pitch on bumps.`});

  if(!msgs.length){
    el.innerHTML='<div style="font-size:10px;color:var(--ok);line-height:1.5;">✓ Setup looks balanced for current scenario.</div>';
    return;
  }
  el.innerHTML=msgs.map(m=>`<div style="font-size:10px;color:${m.c};margin-bottom:3px;line-height:1.4;">• ${m.t}</div>`).join('');
}

/* ---------- Tile color helper ---------- */
// ranges: [lo_bad, lo_warn, hi_warn, hi_bad]
function setTileColor(id, value, [lo_bad, lo_warn, hi_warn, hi_bad]){
  const tile = $('m_'+id).closest ? $('m_'+id).closest('.tile') : $('m_'+id).parentElement;
  tile.classList.remove('s-good','s-warn','s-bad');
  if (value < lo_bad || value > hi_bad) tile.classList.add('s-bad');
  else if (value < lo_warn || value > hi_warn) tile.classList.add('s-warn');
  else tile.classList.add('s-good');
}

/* ---------- Simulation state ---------- */
// Dynamics frame is compression-positive (down): zfDyn/zrDyn positive = sprung
// settles toward the wheel; ztF/ztR positive = wheel moves down. We integrate
// around the gravity equilibrium (m*g - Fpre)/k, so gravity does not appear.
// terrain() is visual-frame (positive = ground rises) and enters stepWith negated.
// Suspension travel used = staticSag + zDyn - zt; renderers draw wheels at -zt.
let sim = {
  t: 0,
  zfDyn: 0, zfV: 0,
  zrDyn: 0, zrV: 0,
  ztF: 0, ztFv: 0, ztR: 0, ztRv: 0,  // tire (unsprung) dynamics
  Fdyn_front: 0, Fdyn_rear: 0,
  airborne: false, vAir: 0, yAir: 0,
  history: [],
  peakA: 0, lastA: 0,
  bottom: false,
  done: false,
};

/* ---------- Sim B (compare mode) ---------- */
let state2 = structuredClone(STOCK);
let staticSag2 = {f:0, r:0};
let sim2 = { t:0, zfDyn:0, zfV:0, zrDyn:0, zrV:0,
             ztF:0, ztFv:0, ztR:0, ztRv:0,
             Fdyn_front:0, Fdyn_rear:0,
             airborne:false, vAir:0, yAir:0, history:[], peakA:0, lastA:0, bottom:false, done:false };

function recomputeStatics2(){
  const p=paramsFrom(state2);
  staticSag2.f=Math.max(0,(p.m_front_sprung*g-p.Fpre_F)/p.kF);
  staticSag2.r=Math.max(0,(p.m_rear_sprung *g-p.Fpre_R)/p.kR);
}

function resetSim2(){
  sim2.t=0; sim2.zfDyn=sim2.zfV=sim2.zrDyn=sim2.zrV=0;
  sim2.ztF=sim2.ztFv=sim2.ztR=sim2.ztRv=0;
  sim2.Fdyn_front=sim2.Fdyn_rear=0;
  sim2.airborne=false; sim2.vAir=0; sim2.yAir=0;
  sim2.history.length=0; sim2.peakA=0; sim2.lastA=0; sim2.bottom=false; sim2.done=false;
  if(state.scenario==='jump'){ sim2.airborne=true; sim2.yAir=state.jumpH; sim2.vAir=0;
    sim2.zfDyn=-staticSag2.f; sim2.zrDyn=-staticSag2.r; }
}

function resetSim(){
  sim.t = 0;
  sim.zfDyn = sim.zfV = sim.zrDyn = sim.zrV = 0;
  sim.ztF = sim.ztFv = sim.ztR = sim.ztRv = 0;
  sim.Fdyn_front = sim.Fdyn_rear = 0;
  sim.airborne = false; sim.vAir = 0; sim.yAir = 0;
  sim.history.length = 0;
  sim.peakA = 0; sim.lastA = 0; sim.bottom = false; sim.done = false;
  $('bottomFlag').classList.remove('on');
  scrubbing = false;
  const sl = $('scrubSlider'); sl.max = 0; sl.value = 0;
  $('scrubTime').textContent = '0.00s';

  if (state.scenario === 'jump') {
    sim.airborne = true;
    sim.yAir = state.jumpH;
    sim.vAir = 0;
    // In the air the suspension tops out (no load): full travel available on landing
    sim.zfDyn = -staticSag.f;
    sim.zrDyn = -staticSag.r;
  }
  // Keep sim2 time-locked to sim1 so both sims see the same terrain position
  if (compareMode) resetSim2();
}

function step(dt){ stepWith(dt, sim, params(), staticSag); }

/* ---------- UI binding ---------- */
const inputs = {
  rider:[$('rider'),$('riderV'),v=>`${v} kg`],
  pillion:[$('pillion'),$('pillionV'),v=>`${v} kg`],
  luggage:[$('luggage'),$('luggageV'),v=>`${v} kg`],
  fPre:[$('fPre'),$('fPreV'),v=>`${v} mm`],
  fComp:[$('fComp'),$('fCompV'),v=>`${v} clicks out`],
  fReb:[$('fReb'),$('fRebV'),v=>`${v} clicks out`],
  rPre:[$('rPre'),$('rPreV'),v=>`${v} turns`],
  rComp:[$('rComp'),$('rCompV'),v=>`${v} clicks out`],
  rReb:[$('rReb'),$('rRebV'),v=>`${v} clicks out`],
  speed:[$('speed'),$('speedV'),v=>`${v} km/h`],
  bumpH:[$('bumpH'),$('bumpHV'),v=>`${v} mm`],
  bumpL:[$('bumpL'),$('bumpLV'),v=>`${v} mm`],
  bumpGap:[$('bumpGap'),$('bumpGapV'),v=>`${v.toFixed(1)} m`],
  decel:[$('decel'),$('decelV'),v=>`${v.toFixed(2)} g`],
  jumpH:[$('jumpH'),$('jumpHV'),v=>`${v.toFixed(1)} m`],
  progression:[$('progression'),$('progressionV'),v=>`${v}%`],
};
for (const k in inputs) {
  const [el,vEl,fmt] = inputs[k];
  el.value = state[k];
  vEl.textContent = fmt(+el.value);
  el.addEventListener('input',()=>{
    state[k] = +el.value;
    vEl.textContent = fmt(state[k]);
    clearPresetHighlight();
    recomputeStatics();
    draw();
    renderDampingAnalysis();
    drawRefChart();
    if(window.syncModalSliders) syncModalSliders();
    renderIdealPanel();
  });
}
$('scenario').addEventListener('change',e=>{ state.scenario = e.target.value; updateFooterEnable(); updateGuideCard(); resetSim(); renderIdealPanel(); });
const PRESET_BTN_IDS = ['presetStockBtn','presetSportBtn','presetOffRoadBtn','presetTouringBtn','presetHeavyBtn','presetEnduroBtn','presetBigJumpBtn'];
function clearPresetHighlight(){ PRESET_BTN_IDS.forEach(id=>$(id).classList.remove('active')); }

function applyPreset(overrides, activeBtnId){
  clearPresetHighlight();
  const PRESET_KEYS = ['fComp','fReb','rComp','rReb','fPre','rPre'];
  PRESET_KEYS.forEach(k=>{ if(overrides[k]!==undefined){ state[k]=overrides[k]; }});
  for(const k of PRESET_KEYS){
    const [el,vEl,fmt]=inputs[k]; el.value=state[k]; vEl.textContent=fmt(state[k]);
  }
  if(activeBtnId) $(activeBtnId).classList.add('active');
  recomputeStatics(); resetSim(); draw(); renderDampingAnalysis(); drawRefChart();
  if(window.syncModalSliders) syncModalSliders();
  renderIdealPanel();
}

$('stockBtn').addEventListener('click',()=>{
  Object.assign(state, STOCK);
  for (const k in inputs){ const [el,vEl,fmt]=inputs[k]; el.value=state[k]; vEl.textContent=fmt(+el.value); }
  $('scenario').value = state.scenario;
  clearPresetHighlight(); $('presetStockBtn').classList.add('active');
  recomputeStatics(); resetSim(); draw(); renderDampingAnalysis(); drawRefChart();
  if(window.syncModalSliders) syncModalSliders();
  renderIdealPanel();
});
$('presetStockBtn').addEventListener('click',   ()=>applyPreset(STOCK,           'presetStockBtn'));
$('presetSportBtn').addEventListener('click',    ()=>applyPreset(PRESETS.sport,   'presetSportBtn'));
$('presetOffRoadBtn').addEventListener('click',  ()=>applyPreset(PRESETS.offroad, 'presetOffRoadBtn'));
$('presetTouringBtn').addEventListener('click',  ()=>applyPreset(PRESETS.touring, 'presetTouringBtn'));
$('presetHeavyBtn').addEventListener('click',    ()=>applyPreset(PRESETS.heavy,   'presetHeavyBtn'));
$('presetEnduroBtn').addEventListener('click',   ()=>applyPreset(PRESETS.enduro,  'presetEnduroBtn'));
$('presetBigJumpBtn').addEventListener('click',  ()=>applyPreset(PRESETS.bigJump, 'presetBigJumpBtn'));
$('playBtn').addEventListener('click',()=>{ playing=!playing; $('playBtn').textContent = playing? '❚❚ Pause':'▶ Play'; if(playing){ scrubbing=false; lastT=performance.now(); } });
$('resetBtn').addEventListener('click',()=> resetSim());

$('scrubSlider').addEventListener('input', () => {
  if (!sim.history.length) return;
  if (playing) { playing = false; $('playBtn').textContent = '▶ Play'; }
  scrubbing = true;
  const idx = Math.min(+$('scrubSlider').value, sim.history.length - 1);
  const fr = sim.history[idx];
  sim.zfDyn = fr.zfDyn; sim.zrDyn = fr.zrDyn;
  sim.ztF = fr.ztF; sim.ztR = fr.ztR;
  sim.airborne = fr.airborne;
  $('scrubTime').textContent = fr.t.toFixed(2) + 's';
  draw();
  drawGhost();
});
$('scrubSlider').addEventListener('pointerup', () => { scrubbing = false; });
$('loopBtn').addEventListener('click',()=>{
  loopMode = !loopMode;
  $('loopBtn').textContent = loopMode ? '⟳ Loop: ON' : '⟳ Loop: off';
  $('loopBtn').style.background = loopMode ? 'var(--accent2)' : '';
  $('loopBtn').style.color = loopMode ? '#000' : '';
});

function updateFooterEnable(){
  const s = state.scenario;
  const map = {
    static:   {speed:0,bumpH:0,bumpL:0,bumpGap:0,decel:0,jumpH:0},
    bump:     {speed:1,bumpH:1,bumpL:1,bumpGap:1,decel:0,jumpH:0},
    pothole:  {speed:1,bumpH:1,bumpL:1,bumpGap:1,decel:0,jumpH:0},
    washboard:{speed:1,bumpH:1,bumpL:1,bumpGap:0,decel:0,jumpH:0},
    brake:    {speed:1,bumpH:0,bumpL:0,bumpGap:0,decel:1,jumpH:0},
    accel:    {speed:1,bumpH:0,bumpL:0,bumpGap:0,decel:1,jumpH:0},
    jump:     {speed:0,bumpH:0,bumpL:0,bumpGap:0,decel:0,jumpH:1},
    corner:   {speed:1,bumpH:0,bumpL:0,bumpGap:0,decel:1,jumpH:0},
  }[s] || {};
  ['speed','bumpH','bumpL','bumpGap','decel','jumpH'].forEach(k=>{
    $(`f_${k}`).classList.toggle('disabled', !map[k]);
  });
}
updateFooterEnable();

/* ---------- Guide card ---------- */
function updateGuideCard(){
  const g = GUIDES[state.scenario];
  if (!g) return;
  $('g_title').textContent = g.title;
  $('g_what').textContent = g.what;
  $('g_good').textContent = g.good;
  $('g_try').textContent = g.try;
  $('g_fix').textContent = g.fix;
}

/* ---------- Sim B helpers ---------- */
const B_FMTS={rider:v=>`${v} kg`,fComp:v=>`${v} ck`,fReb:v=>`${v} ck`,
              rComp:v=>`${v} ck`,rReb:v=>`${v} ck`,fPre:v=>`${v} mm`,rPre:v=>`${v} turns`};

function setStateB(key,val){
  const oldF=staticSag2.f, oldR=staticSag2.r;
  state2[key]=val;
  recomputeStatics2();
  sim2.zfDyn+=oldF-staticSag2.f;
  sim2.zrDyn+=oldR-staticSag2.r;
  const fmt=B_FMTS[key]||(v=>`${v}`);
  for(const pfx of['b_','bm_']){
    const el=$(`${pfx}${key}`), vEl=$(`${pfx}${key}V`);
    if(el && +el.value!==val) el.value=val;
    if(vEl) vEl.textContent=fmt(val);
  }
}

function updateBModalState(){
  const note=$('bModalNote'), btn=$('bModalToggle'), sl=$('bModalSliders');
  if(!note||!btn) return;
  if(compareMode){
    note.textContent='· Active';
    btn.textContent='Stop B';
    btn.style.cssText='padding:2px 8px;font-size:10px;border-radius:3px;cursor:pointer;background:rgba(79,195,247,0.15);color:#4fc3f7;border:1px solid rgba(79,195,247,0.4);';
    if(sl){sl.style.opacity='1';sl.style.pointerEvents='auto';}
  } else {
    note.textContent='· Inactive';
    btn.textContent='Start B';
    btn.style.cssText='padding:2px 8px;font-size:10px;border-radius:3px;cursor:pointer;background:var(--panel2);color:var(--dim);border:1px solid var(--line);';
    if(sl){sl.style.opacity='0.45';sl.style.pointerEvents='none';}
  }
}

/* ---------- Snapshots ---------- */
function addSnapshot(){
  if(snapshots.length>=4) snapshots.shift();
  const data=buildRefData();
  snapshots.push({id:Date.now(), label:makeSnapLabel(),
    color:SNAP_COLORS[snapshots.length%4], ...data});
  renderSnapBar();
  renderSnapLegend();
  drawBigCharts();
}

function removeSnapshot(id){
  snapshots=snapshots.filter(s=>s.id!==id);
  renderSnapBar();
  renderSnapLegend();
  drawBigCharts();
}

/* ---------- Animation loop ---------- */
function loop(now){
  if (playing) {
    let dt = (now - lastT)/1000 * slowmoFactor;
    if (dt > 0.1) dt = 0.1;
    lastT = now;
    let acc = dt;
    while (acc > 0) {
      const s = Math.min(DT, acc);
      step(s);
      acc -= s;
    }
    const fUse = Math.max(0, staticSag.f + sim.zfDyn - sim.ztF) / BIKE.fTravel;
    const rUse = Math.max(0, staticSag.r + sim.zrDyn - sim.ztR) / BIKE.rTravel;
    const forkLenU=BIKE.forkLenU, rearArmU=BIKE.rearArmU;
    const _fC=Math.max(0,staticSag.f+sim.zfDyn-sim.ztF), _rC=Math.max(0,staticSag.r+sim.zrDyn-sim.ztR);
    const frFy=BIKE.rWheelF-sim.ztF+(forkLenU-_fC)*Math.cos(BIKE.rake);
    const frRy=BIKE.rWheelR-sim.ztR+rearArmU-_rC;
    const pitchNow=Math.atan2(frRy-frFy,BIKE.wb)*180/Math.PI;
    // fv/rv = suspension compression rate (sprung minus wheel) for phase plots
    sim.history.push({t:sim.t, f:fUse, r:rUse, g:(sim.lastA||0)/g, pitch:pitchNow, fv:sim.zfV-sim.ztFv, rv:sim.zrV-sim.ztRv,
      zfDyn:sim.zfDyn, zrDyn:sim.zrDyn, ztF:sim.ztF, ztR:sim.ztR, airborne:sim.airborne});
    if (sim.history.length > 600) sim.history.shift();
    if (!scrubbing) {
      const sl = $('scrubSlider');
      sl.max = sim.history.length - 1;
      sl.value = sim.history.length - 1;
      $('scrubTime').textContent = sim.t.toFixed(2) + 's';
    }
    if (sim.bottom) $('bottomFlag').classList.add('on');
    diagnose();

    if (loopMode && state.scenario === 'jump' && !sim.airborne) {
      sim.timeOnGround = (sim.timeOnGround||0) + dt;
      if (sim.timeOnGround > 0.8 && Math.abs(sim.zfV) < 0.3 && Math.abs(sim.zrV) < 0.3) {
        sim.airborne = true;
        sim.yAir = state.jumpH;
        sim.vAir = 0;
        sim.zfDyn = -staticSag.f; sim.zrDyn = -staticSag.r;
        sim.zfV = sim.zrV = 0;
        sim.ztF = sim.ztFv = sim.ztR = sim.ztRv = 0;
        sim.timeOnGround = 0;
        $('bottomFlag').classList.remove('on');
        sim.bottom = false;
      }
    } else {
      sim.timeOnGround = 0;
    }

    if (!loopMode && sim.t > 6 && state.scenario!=='static' && state.scenario!=='washboard' && state.scenario!=='brake' && state.scenario!=='accel' && state.scenario!=='corner') {
      playing = false; $('playBtn').textContent='▶ Play';
    }

    if(compareMode){
      const p2=paramsFrom(state2);
      let acc2=dt;
      while(acc2>0){ const s=Math.min(DT,acc2); stepWith(s,sim2,p2,staticSag2); acc2-=s; }
      const fUse2=Math.max(0,staticSag2.f+sim2.zfDyn-sim2.ztF)/BIKE.fTravel;
      const rUse2=Math.max(0,staticSag2.r+sim2.zrDyn-sim2.ztR)/BIKE.rTravel;
      const fComp2_s=Math.max(0,staticSag2.f+sim2.zfDyn-sim2.ztF), rComp2_s=Math.max(0,staticSag2.r+sim2.zrDyn-sim2.ztR);
      const frFy2=BIKE.rWheelF-sim2.ztF+(BIKE.forkLenU-fComp2_s)*Math.cos(BIKE.rake);
      const frRy2=BIKE.rWheelR-sim2.ztR+BIKE.rearArmU-rComp2_s;
      const pitch2=Math.atan2(frRy2-frFy2,BIKE.wb)*180/Math.PI;
      sim2.history.push({t:sim2.t, f:fUse2, r:rUse2, g:(sim2.lastA||0)/g, pitch:pitch2, fv:sim2.zfV-sim2.ztFv, rv:sim2.zrV-sim2.ztRv});
      if(sim2.history.length>600) sim2.history.shift();
    }
  }
  draw();
  drawGhost();
  drawBigCharts();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

/* ---------- DOMContentLoaded: modal & compare wiring ---------- */
document.addEventListener('DOMContentLoaded',()=>{
  $('dampBtn').addEventListener('click',()=>{
    $('dampModal').style.display='block';
    renderDampingAnalysis();
  });
  $('dampClose').addEventListener('click',()=>{ $('dampModal').style.display='none'; });
  $('dampModal').addEventListener('click',e=>{ if(e.target===$('dampModal')) $('dampModal').style.display='none'; });

  $('analysisBtn').addEventListener('click',()=>{
    $('chartModal').style.display='block';
    syncModalSliders();
    renderSnapBar();
    renderSnapLegend();
    renderIdealPanel();
    updateBModalState();
    setTimeout(drawBigCharts,50);
  });
  $('chartModalClose').addEventListener('click',()=>{ $('chartModal').style.display='none'; });
  $('chartModal').addEventListener('click',e=>{ if(e.target===$('chartModal')) $('chartModal').style.display='none'; });

  function syncBtoA(){
    recomputeStatics2();
    sim2.t=sim.t; sim2.zfDyn=sim.zfDyn; sim2.zfV=sim.zfV;
    sim2.zrDyn=sim.zrDyn; sim2.zrV=sim.zrV;
    sim2.ztF=sim.ztF; sim2.ztFv=sim.ztFv;
    sim2.ztR=sim.ztR; sim2.ztRv=sim.ztRv;
    sim2.airborne=sim.airborne; sim2.vAir=sim.vAir; sim2.yAir=sim.yAir;
    sim2.history.length=0; sim2.peakA=0; sim2.bottom=false;
  }
  function toggleCompare(on){
    compareMode=on;
    $('compareBtn').textContent=compareMode?'⊕ Compare: ON':'⊕ Compare';
    $('compareBtn').style.borderColor=compareMode?'#4fc3f7':'';
    $('compareBtn').style.color=compareMode?'#4fc3f7':'';
    $('compareBar').style.display=compareMode?'block':'none';
    $('ghostStage').style.display=compareMode?'block':'none';
    if(compareMode) syncBtoA();
    updateBModalState();
    drawBigCharts();
  }

  ['rider','fComp','fReb','rComp','rReb','fPre','rPre'].forEach(key=>{
    const el=$(`b_${key}`); if(!el) return;
    el.addEventListener('input',()=>setStateB(key,+el.value));
  });

  $('compareBtn').addEventListener('click',()=>toggleCompare(!compareMode));
  $('copyAtoB').addEventListener('click',()=>{
    ['rider','fPre','fComp','fReb','rPre','rComp','rReb'].forEach(k=>setStateB(k,state[k]));
    syncBtoA();
  });
  $('resetSimBBtn').addEventListener('click',()=>{ syncBtoA(); });

  $('exportBtn').addEventListener('click',()=>{
    if(!sim.history.length){ alert('Run the sim first.'); return; }
    const rows=['t_s,f_travel_pct,r_travel_pct'];
    sim.history.forEach(p=>rows.push(`${p.t.toFixed(3)},${(p.f*100).toFixed(1)},${(p.r*100).toFixed(1)}`));
    if(compareMode && sim2.history.length){
      rows[0]+= compareMode?',b_f_travel_pct,b_r_travel_pct':'';
      const bMap=new Map(sim2.history.map(p=>[p.t.toFixed(3),p]));
      for(let i=1;i<rows.length;i++){
        const t=sim.history[i-1].t.toFixed(3);
        const b=bMap.get(t);
        rows[i]+=b?`,${(b.f*100).toFixed(1)},${(b.r*100).toFixed(1)}`:',,';}
    }
    const blob=new Blob([rows.join('\n')],{type:'text/csv'});
    const a=document.createElement('a'); a.href=URL.createObjectURL(blob);
    a.download=`norden_sim_${Date.now()}.csv`; a.click();
  });

  // Modal A slider definitions
  const MA = [
    ['rider',   'ma_rider',   'ma_riderV',   v=>`${v} kg`],
    ['pillion', 'ma_pillion', 'ma_pillionV', v=>`${v} kg`],
    ['luggage', 'ma_luggage', 'ma_luggageV', v=>`${v} kg`],
    ['fPre',    'ma_fPre',    'ma_fPreV',    v=>`${v} mm`],
    ['fComp',   'ma_fComp',   'ma_fCompV',   v=>`${v} clicks out`],
    ['fReb',    'ma_fReb',    'ma_fRebV',    v=>`${v} clicks out`],
    ['rPre',    'ma_rPre',    'ma_rPreV',    v=>`${v} turns`],
    ['rComp',   'ma_rComp',   'ma_rCompV',   v=>`${v} clicks out`],
    ['rReb',    'ma_rReb',    'ma_rRebV',    v=>`${v} clicks out`],
    ['speed',   'ma_speed',   'ma_speedV',   v=>`${v} km/h`],
    ['bumpH',   'ma_bumpH',   'ma_bumpHV',   v=>`${v} mm`],
    ['bumpL',   'ma_bumpL',   'ma_bumpLV',   v=>`${v} mm`],
  ];

  function syncModalSliders(){
    MA.forEach(([k,inId,vId,fmt])=>{
      const el=$(inId), vEl=$(vId); if(!el) return;
      el.value=state[k]; vEl.textContent=fmt(state[k]);
    });
    ['rider','fPre','fComp','fReb','rPre','rComp','rReb'].forEach(key=>{
      const el=$(`bm_${key}`), vEl=$(`bm_${key}V`); if(!el) return;
      el.value=state2[key]; vEl.textContent=(B_FMTS[key]||(v=>`${v}`))(state2[key]);
    });
  }
  window.syncModalSliders=syncModalSliders;

  MA.forEach(([k,inId,vId,fmt])=>{
    const el=$(inId), vEl=$(vId); if(!el) return;
    el.addEventListener('input',()=>{
      const v=+el.value; state[k]=v; vEl.textContent=fmt(v);
      const [mEl,mVEl,mFmt]=inputs[k]||[];
      if(mEl){ mEl.value=v; mVEl.textContent=mFmt(v); }
      recomputeStatics(); draw(); drawRefChart(); renderDampingAnalysis(); renderIdealPanel();
      drawBigCharts();
    });
  });

  ['rider','fPre','fComp','fReb','rPre','rComp','rReb'].forEach(key=>{
    const el=$(`bm_${key}`); if(!el) return;
    el.addEventListener('input',()=>{ setStateB(key,+el.value); drawBigCharts(); });
  });

  const bmToggle=$('bModalToggle');
  if(bmToggle) bmToggle.addEventListener('click',()=>toggleCompare(!compareMode));

  // Slow motion slider
  const slowmoEl = $('slowmo'), slowmoVEl = $('slowmoV');
  if(slowmoEl) slowmoEl.addEventListener('input', ()=>{
    slowmoFactor = +slowmoEl.value / 100;
    if(slowmoVEl) slowmoVEl.textContent = slowmoFactor === 1 ? '1×' : slowmoFactor.toFixed(2)+'×';
  });

  // Bike selector
  $('bikeSelect').addEventListener('change', e => {
    Object.assign(BIKE, BIKES[e.target.value]);
    $('bikeTitle').innerHTML = BIKE.titleHTML + ' · Suspension Lab';
    $('lbl_front').textContent = `Front · ${BIKE.forkName}`;
    $('lbl_rear').textContent  = `Rear · ${BIKE.shockName}`;
    Object.assign(state, STOCK);
    for (const k in inputs){ const [el,vEl,fmt]=inputs[k]; el.value=state[k]; vEl.textContent=fmt(+el.value); }
    clearPresetHighlight(); $('presetStockBtn').classList.add('active');
    recomputeStatics(); resetSim(); draw(); renderDampingAnalysis(); drawRefChart();
    if(window.syncModalSliders) syncModalSliders();
    renderIdealPanel();
  });

  // Default: loop ON, compare OFF (enable via the Compare button)
  loopMode = true;
  $('loopBtn').textContent = '⟳ Loop: ON';
  $('loopBtn').style.background = 'var(--accent2)';
  $('loopBtn').style.color = '#000';
  toggleCompare(false);
});

/* ---------- Boot ---------- */
recomputeStatics();
resetSim();
updateGuideCard();
draw();
setTimeout(drawRefChart, 100);
window.addEventListener('resize', ()=>{ draw(); drawRefChart(); });
