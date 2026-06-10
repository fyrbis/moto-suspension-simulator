'use strict';

/* ==========================================================================
   NORDEN 901 SUSPENSION SIMULATOR — Rendering & chart functions
   All canvas drawing, chart building, modal panel rendering.
   Depends on globals from physics.js and ui.js.
   ========================================================================== */

const stage = $('stage');
const cv = $('bike');
const ctx = cv.getContext('2d');
const ghostCv  = $('ghostStage');
const ghostCtx = ghostCv.getContext('2d');
const chartF   = $('chartF');
const chartR   = $('chartR');
const chartRef = $('chartRef');
const chartG   = $('chartG');
const chartP   = $('chartP');
const cctxF   = chartF.getContext('2d');
const cctxR   = chartR.getContext('2d');
const cctxRef = chartRef.getContext('2d');
const cctxG   = chartG ? chartG.getContext('2d') : null;
const cctxP   = chartP ? chartP.getContext('2d') : null;

function fitCanvas(c){
  const dpr = window.devicePixelRatio||1;
  const w = c.offsetWidth;
  const h = c.offsetHeight;
  c.width = w*dpr; c.height = h*dpr;
  c.getContext('2d').setTransform(dpr,0,0,dpr,0,0);
  return {w, h};
}

function drawBikeFull(ctx, cx, cy, scale, fComp, rComp, airborne, yAir, ter, simT, theme){
  const rWheelF = BIKE.rWheelF, rWheelR = BIKE.rWheelR;
  const forkLenU = BIKE.forkLenU, rearArmU = BIKE.rearArmU;
  const xF = +BIKE.wb/2, xR = -BIKE.wb/2;
  const forkLenC = forkLenU - fComp, rearArmC = rearArmU - rComp;
  const air = airborne ? yAir : 0;
  const toS = (x,y) => ({sx: cx+x*scale, sy: cy-(y+air)*scale});

  const fCompPct = fComp / BIKE.fTravel;
  const rCompPct = rComp / BIKE.rTravel;

  // High-frequency shake when near bottom — visceral cue
  const shakeF = fCompPct > 0.85 ? (Math.random()-0.5)*2.5*(fCompPct-0.85)*5 : 0;
  const shakeR = rCompPct > 0.85 ? (Math.random()-0.5)*2.5*(rCompPct-0.85)*5 : 0;

  // Use actual wheel positions from tire dynamics. ztF/ztR are down-positive
  // (dynamics frame), so the visual height is -zt. Fallback: terrain height.
  const wYF = airborne ? air : (ter.ztF !== undefined ? -ter.ztF : ter.yF);
  const wYR = airborne ? air : (ter.ztR !== undefined ? -ter.ztR : ter.yR);
  const wfS = {sx: cx+xF*scale, sy: cy-(rWheelF+wYF)*scale + shakeF};
  const wrS = {sx: cx+xR*scale, sy: cy-(rWheelR+wYR)*scale + shakeR};
  if (airborne) { wfS.sy = cy-(rWheelF+air)*scale; wrS.sy = cy-(rWheelR+air)*scale; }
  const sinRake = Math.sin(BIKE.rake), cosRake = Math.cos(BIKE.rake);
  const frkOffX = forkLenC * sinRake;  // horizontal setback of triple clamp behind front axle
  const frFS = airborne
    ? {sx: cx+(xF-frkOffX)*scale, sy: cy-(rWheelF+forkLenC*cosRake+air)*scale}
    : toS(xF - frkOffX, rWheelF + forkLenC*cosRake + wYF);
  const frRS = airborne ? {sx:cx+xR*scale, sy:cy-(rWheelR+rearArmC+air)*scale} : toS(xR, rWheelR+rearArmC+wYR);
  if (!airborne){ frFS.sy += shakeF; frRS.sy += shakeR; }

  // Longitudinal G (+forward=brake, -back=accel). Drives rider posture + load arrows.
  let accelG = 0;
  if (state.scenario === 'brake') accelG = +state.decel * Math.min(1, simT/0.2);
  else if (state.scenario === 'accel') accelG = -state.decel * Math.min(1, simT/0.2);
  else if (state.scenario === 'corner') accelG = 0;
  const leanLong = Math.max(-0.5, Math.min(0.5, accelG * 0.18)); // rider lean fwd/back

  ctx.save(); ctx.lineCap = 'round';

  // DUST CLOUD when bottoming
  if ((fCompPct > 0.92 || rCompPct > 0.92) && !airborne){
    const dustX = fCompPct > rCompPct ? wfS.sx : wrS.sx;
    const dustY = fCompPct > rCompPct ? wfS.sy : wrS.sy;
    for (let i = 0; i < 8; i++){
      const da = (Math.random()-0.5) * Math.PI;
      const dr = Math.random() * 0.12 * scale;
      ctx.fillStyle = `rgba(180,160,130,${0.35 - i*0.04})`;
      ctx.beginPath();
      ctx.arc(dustX + Math.cos(da)*dr, dustY + 4 - Math.random()*8, 3 + Math.random()*4, 0, Math.PI*2);
      ctx.fill();
    }
  }

  // CONTACT-PATCH LOAD: 1.0 = static, scales with sprung load + dynamic comp.
  const loadF = 0.4 + fCompPct * 1.4;
  const loadR = 0.4 + rCompPct * 1.4;

  // WHEELS — 21" front, 18" rear
  drawWheel(ctx, wfS.sx, wfS.sy, rWheelF*scale, simT, true,  loadF);
  drawWheel(ctx, wrS.sx, wrS.sy, rWheelR*scale, simT, false, loadR);

  // Swingarm pivot — FRAME-FIXED (~520mm ahead of the axle, ~450mm high on the
  // sprung chassis). The arm visibly rotates about it as the wheel moves,
  // exactly like the real bike.
  const swPivSx = cx + (xR + 0.52) * scale;
  const swPivSy = frRS.sy + 0.29*scale;

  // SWINGARM — rear axle up-forward to the frame pivot
  ctx.strokeStyle = '#1a1c22'; ctx.lineWidth = 15;
  ctx.beginPath(); ctx.moveTo(wrS.sx, wrS.sy); ctx.lineTo(swPivSx, swPivSy); ctx.stroke();
  ctx.strokeStyle = '#3a3e48'; ctx.lineWidth = 10;
  ctx.beginPath(); ctx.moveTo(wrS.sx, wrS.sy); ctx.lineTo(swPivSx, swPivSy); ctx.stroke();
  ctx.strokeStyle = 'rgba(180,190,205,0.22)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(wrS.sx-1, wrS.sy-3); ctx.lineTo(swPivSx-1, swPivSy-3); ctx.stroke();
  // Pivot bolt
  ctx.fillStyle = '#5a5e68';
  ctx.beginPath(); ctx.arc(swPivSx, swPivSy, 4, 0, Math.PI*2); ctx.fill();

  // DRIVE CHAIN — front sprocket just behind the pivot to the rear sprocket;
  // runs follow the swingarm so chain tension geometry reads correctly
  const sprR = 0.082*scale, sprF = 0.026*scale;
  const fspX = swPivSx - 0.030*scale, fspY = swPivSy + 0.012*scale;
  ctx.strokeStyle = '#23272f'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(fspX, fspY - sprF); ctx.lineTo(wrS.sx, wrS.sy - sprR); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(fspX, fspY + sprF); ctx.lineTo(wrS.sx, wrS.sy + sprR); ctx.stroke();
  ctx.strokeStyle = 'rgba(150,160,180,0.35)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(fspX, fspY - sprF + 1); ctx.lineTo(wrS.sx, wrS.sy - sprR + 1); ctx.stroke();
  // Rear sprocket ring
  ctx.strokeStyle = '#3a3e48'; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.arc(wrS.sx, wrS.sy, sprR, 0, Math.PI*2); ctx.stroke();

  // REAR SHOCK — bottom eye on the swingarm 30% out from the pivot (visual
  // motion ratio ≈ 3:1 like the real linkage), top on the frame under the seat.
  const shockBx = swPivSx + (wrS.sx - swPivSx)*0.30;
  const shockBy = swPivSy + (wrS.sy - swPivSy)*0.30;
  const shockTx = swPivSx + 0.03*scale;
  const shockTy = frRS.sy + 0.09*scale;
  // Linkage hint: short link from the pivot area to the shock bottom eye
  ctx.strokeStyle = '#404550'; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(swPivSx + 0.012*scale, swPivSy + 0.018*scale);
  ctx.lineTo(shockBx, shockBy + 3); ctx.stroke();
  ctx.fillStyle = '#5a5e68';
  ctx.beginPath(); ctx.arc(shockBx, shockBy + 2, 3, 0, Math.PI*2); ctx.fill();
  const shockBodyCol = rCompPct > 0.85 ? '#ff3b30' : rCompPct > 0.65 ? '#a02800' : '#2a2e38';
  const springCol    = rCompPct > 0.85 ? '#ff3b30' : rCompPct > 0.65 ? '#ff8a00' : '#a8aebc';

  // Pre-compute shock axis for reservoir and coil placement
  const shLen = Math.hypot(shockTx-shockBx, shockTy-shockBy);
  const shUx = (shockTx-shockBx)/shLen, shUy = (shockTy-shockBy)/shLen;
  const shNx = -shUy, shNy = shUx;

  ctx.strokeStyle = '#0f1116'; ctx.lineWidth = 12;
  ctx.beginPath(); ctx.moveTo(shockBx, shockBy); ctx.lineTo(shockTx, shockTy); ctx.stroke();
  ctx.strokeStyle = shockBodyCol; ctx.lineWidth = 9;
  ctx.beginPath(); ctx.moveTo(shockBx, shockBy); ctx.lineTo(shockTx, shockTy); ctx.stroke();
  // Piggyback reservoir — offset perpendicular from shock body, 1/3 from bottom
  const resX = shockBx + shUx*shLen*0.33 + shNx*9;
  const resY = shockBy + shUy*shLen*0.33 + shNy*9;
  ctx.fillStyle = '#1c2028'; ctx.strokeStyle = '#454a55'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.ellipse(resX, resY, 5, 10, Math.atan2(shUy, shUx) + Math.PI/2, 0, Math.PI*2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#ffe300';
  ctx.beginPath(); ctx.arc(resX, resY, 2, 0, Math.PI*2); ctx.fill();
  // Spring coils
  const coilAmp = 8 * (1 - rCompPct*0.55);
  const nCoilPts = 28;
  ctx.strokeStyle = springCol; ctx.lineWidth = 3;
  ctx.beginPath();
  for (let i = 0; i <= nCoilPts; i++){
    const t = i/nCoilPts;
    const bx = shockBx + shUx*shLen*t, by = shockBy + shUy*shLen*t;
    const side = Math.sin(i * Math.PI*2/4) * coilAmp;
    i === 0 ? ctx.moveTo(bx+shNx*side, by+shNy*side) : ctx.lineTo(bx+shNx*side, by+shNy*side);
  }
  ctx.stroke();

  // USD FORK — twin tube side profile, gold uppers, chrome lowers
  const goldCol = fCompPct > 0.85 ? '#ff3b30' : fCompPct > 0.65 ? '#c86000' : fCompPct > 0.40 ? '#b07800' : '#9a7600';
  // Fork stub top: 0.095m along fork axis above triple clamp (head tube region)
  const stHLen = 0.095 * scale;
  const stTopX = frFS.sx - sinRake * stHLen;
  const stTopY = frFS.sy - cosRake * stHLen;
  // Seal moves along fork axis (linear interp between triple clamp and axle)
  const t_seal = 0.25 + 0.60 * fCompPct;
  const sealXf = frFS.sx + (wfS.sx - frFS.sx) * t_seal;
  const sealYf = frFS.sy + (wfS.sy - frFS.sy) * t_seal;
  const offsets = [-7, +7]; // Two fork legs offset left/right in side view

  for (const off of offsets) {
    // Gold upper tube (from steering head stub down to triple clamp) — angled at rake
    ctx.strokeStyle = '#1e1400'; ctx.lineWidth = 10;
    ctx.beginPath(); ctx.moveTo(stTopX+off, stTopY); ctx.lineTo(frFS.sx+off, frFS.sy); ctx.stroke();
    ctx.strokeStyle = goldCol; ctx.lineWidth = 7;
    ctx.beginPath(); ctx.moveTo(stTopX+off, stTopY); ctx.lineTo(frFS.sx+off, frFS.sy); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,240,80,0.22)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(stTopX+off-2.5, stTopY+4); ctx.lineTo(frFS.sx+off-2.5, frFS.sy-4); ctx.stroke();
    // Dust seal ring (travels along fork axis)
    ctx.fillStyle = '#0c0c0c';
    ctx.beginPath(); ctx.arc(sealXf+off, sealYf, 7, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle = '#4a4a4a'; ctx.lineWidth = 1.5; ctx.stroke();
    // Chrome lower (inner) tube — naturally angled because frFS is now raked back
    ctx.strokeStyle = '#1c1c1c'; ctx.lineWidth = 9;
    ctx.beginPath(); ctx.moveTo(sealXf+off, sealYf); ctx.lineTo(wfS.sx+off, wfS.sy); ctx.stroke();
    ctx.strokeStyle = '#9094a0'; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.moveTo(sealXf+off, sealYf); ctx.lineTo(wfS.sx+off, wfS.sy); ctx.stroke();
    ctx.strokeStyle = 'rgba(220,230,245,0.28)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(sealXf+off-2.5, sealYf); ctx.lineTo(wfS.sx+off-2.5, wfS.sy); ctx.stroke();
  }
  // Triple clamps — upper at the steering-head stub, lower at the fork tops
  ctx.strokeStyle = '#23262e'; ctx.lineWidth = 6;
  ctx.beginPath(); ctx.moveTo(stTopX - 10, stTopY); ctx.lineTo(stTopX + 10, stTopY); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(frFS.sx - 10, frFS.sy); ctx.lineTo(frFS.sx + 10, frFS.sy); ctx.stroke();
  ctx.fillStyle = '#3c414d';
  ctx.beginPath(); ctx.arc(stTopX, stTopY, 3, 0, Math.PI*2); ctx.fill();

  // Fork brace (bottom axle clamp connects both legs)
  ctx.fillStyle = '#2a2e38'; ctx.strokeStyle = '#454850'; ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.rect(wfS.sx - 12, wfS.sy - 10, 24, 14);
  ctx.fill(); ctx.stroke();
  // Axle nut detail
  ctx.fillStyle = '#6a6e78';
  ctx.beginPath(); ctx.arc(wfS.sx, wfS.sy, 4, 0, Math.PI*2); ctx.fill();

  // Motion blur on fast compression
  if (Math.abs(shakeF) > 0.5){
    ctx.strokeStyle = `rgba(255,200,80,0.25)`; ctx.lineWidth = 2;
    const midForkY = (frFS.sy + wfS.sy) * 0.5;
    for (let i = 1; i <= 3; i++){
      ctx.beginPath();
      ctx.moveTo(frFS.sx + 12 + i*4, midForkY);
      ctx.lineTo(frFS.sx + 12 + i*4 + 8, midForkY);
      ctx.stroke();
    }
  }

  // HIGH RALLY FRONT FENDER — attached ~20% up the fork axis from axle
  const t_fend = 0.20;
  const fendCX = wfS.sx + (frFS.sx - wfS.sx) * t_fend;
  const fendCY = wfS.sy + (frFS.sy - wfS.sy) * t_fend + 0.025*scale;
  const fendW = rWheelF * scale * 1.15;
  ctx.fillStyle = '#e8e8ec'; ctx.strokeStyle = '#1a1c22'; ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(fendCX - fendW*0.55, fendCY);
  ctx.quadraticCurveTo(fendCX, fendCY - 0.05*scale, fendCX + fendW*0.55, fendCY);
  ctx.lineTo(fendCX + fendW*0.5, fendCY + 0.025*scale);
  ctx.quadraticCurveTo(fendCX, fendCY - 0.025*scale, fendCX - fendW*0.5, fendCY + 0.025*scale);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  // Blue stripe on fender (Norden livery)
  ctx.fillStyle = '#1e5a9e';
  ctx.beginPath();
  ctx.moveTo(fendCX - fendW*0.5, fendCY + 0.005*scale);
  ctx.quadraticCurveTo(fendCX, fendCY - 0.038*scale, fendCX + fendW*0.5, fendCY + 0.005*scale);
  ctx.lineTo(fendCX + fendW*0.45, fendCY + 0.015*scale);
  ctx.quadraticCurveTo(fendCX, fendCY - 0.025*scale, fendCX - fendW*0.45, fendCY + 0.015*scale);
  ctx.closePath(); ctx.fill();

  // FRAME backbone — head to subframe tail. Tail sits just above the rear
  // frame anchor so the backbone runs nearly level (~0.80m) like the real bike.
  const headX = stTopX, headY = stTopY;
  const tailX = frRS.sx + 0.08*scale, tailY = frRS.sy - 0.06*scale;
  const fdx = tailX-headX, fdy = tailY-headY, fLen2 = Math.hypot(fdx,fdy)||1;
  const ux = fdx/fLen2, uy = fdy/fLen2, nx = -uy, ny = ux;
  const pt = (t, up) => ({x: headX+ux*fLen2*t+nx*up, y: headY+uy*fLen2*t+ny*up});

  // Visible frame main spar — trellis style (head tube to swingarm pivot)
  const frA = pt(0.08, 0.04*scale), frB = pt(0.22, 0.04*scale);
  const frC = pt(0.22,-0.04*scale), frD = pt(0.08,-0.04*scale);
  const frE = pt(0.62, 0.06*scale), frF2= pt(0.62,-0.01*scale);
  ctx.strokeStyle = '#7d6418'; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.moveTo(frA.x,frA.y); ctx.lineTo(frE.x,frE.y); ctx.stroke(); // lower spar
  ctx.beginPath(); ctx.moveTo(frD.x,frD.y); ctx.lineTo(frF2.x,frF2.y); ctx.stroke(); // upper spar
  ctx.strokeStyle = '#6a5512'; ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.moveTo(frB.x,frB.y); ctx.lineTo(frF2.x,frF2.y); ctx.stroke(); // diagonal

  // SKID PLATE under engine (engine bottom ≈ 0.30m above ground)
  const sp1=pt(0.18,-0.44*scale), sp2=pt(0.58,-0.45*scale);
  const sp3=pt(0.56,-0.50*scale), sp4=pt(0.20,-0.49*scale);
  ctx.fillStyle = '#3a3e48'; ctx.strokeStyle = '#1c1e25'; ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(sp1.x,sp1.y); ctx.lineTo(sp2.x,sp2.y);
  ctx.lineTo(sp3.x,sp3.y); ctx.lineTo(sp4.x,sp4.y);
  ctx.closePath(); ctx.fill(); ctx.stroke();

  // ENGINE — full-depth Norden 901 parallel twin: cylinder head up near the
  // backbone, crankcase down to the skid plate (fills the real engine bay)
  const eg1=pt(0.16,-0.05*scale), eg2=pt(0.60,-0.05*scale);
  const eg3=pt(0.58,-0.44*scale), eg4=pt(0.18,-0.43*scale);
  ctx.fillStyle = '#15171c'; ctx.strokeStyle = '#2a2e38'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(eg1.x,eg1.y); ctx.lineTo(eg2.x,eg2.y);
  ctx.lineTo(eg3.x,eg3.y); ctx.lineTo(eg4.x,eg4.y); ctx.closePath();
  ctx.fill(); ctx.stroke();
  // Cylinder head highlight
  ctx.fillStyle = '#252830';
  const ch1=pt(0.20,-0.05*scale), ch2=pt(0.50,-0.05*scale);
  const ch3=pt(0.49,-0.16*scale), ch4=pt(0.21,-0.16*scale);
  ctx.beginPath(); ctx.moveTo(ch1.x,ch1.y); ctx.lineTo(ch2.x,ch2.y);
  ctx.lineTo(ch3.x,ch3.y); ctx.lineTo(ch4.x,ch4.y); ctx.closePath(); ctx.fill();
  // Cooling fins
  ctx.strokeStyle = 'rgba(255,255,255,0.06)'; ctx.lineWidth = 1;
  for (let i = 1; i <= 4; i++){
    const t = i/5;
    const el2 = {x:eg1.x+(eg4.x-eg1.x)*t, y:eg1.y+(eg4.y-eg1.y)*t};
    const er2 = {x:eg2.x+(eg3.x-eg2.x)*t, y:eg2.y+(eg3.y-eg2.y)*t};
    ctx.beginPath(); ctx.moveTo(el2.x,el2.y); ctx.lineTo(er2.x,er2.y); ctx.stroke();
  }
  // EXHAUST — header drops from the front cylinder, runs under the engine,
  // then the silencer canister rises along the right rear like the real bike
  const exPath = () => {
    ctx.beginPath();
    const e1=pt(0.20,-0.10*scale), e2=pt(0.09,-0.34*scale), e3=pt(0.38,-0.49*scale), e4=pt(0.62,-0.37*scale);
    ctx.moveTo(e1.x,e1.y);
    ctx.quadraticCurveTo(pt(0.07,-0.14*scale).x, pt(0.07,-0.14*scale).y, e2.x, e2.y);
    ctx.quadraticCurveTo(pt(0.20,-0.52*scale).x, pt(0.20,-0.52*scale).y, e3.x, e3.y);
    ctx.lineTo(e4.x, e4.y);
  };
  ctx.strokeStyle = '#1a1c22'; ctx.lineWidth = 7; exPath(); ctx.stroke();
  ctx.strokeStyle = '#7d828f'; ctx.lineWidth = 4.5; exPath(); ctx.stroke();
  // Silencer canister
  const sil1=pt(0.62,-0.37*scale), sil2=pt(0.90,-0.14*scale);
  ctx.strokeStyle = '#14161b'; ctx.lineWidth = 15; ctx.beginPath();
  ctx.moveTo(sil1.x,sil1.y); ctx.lineTo(sil2.x,sil2.y); ctx.stroke();
  ctx.strokeStyle = '#4a4f5a'; ctx.lineWidth = 11; ctx.beginPath();
  ctx.moveTo(sil1.x,sil1.y); ctx.lineTo(sil2.x,sil2.y); ctx.stroke();
  ctx.strokeStyle = 'rgba(210,220,235,0.25)'; ctx.lineWidth = 2.5; ctx.beginPath();
  ctx.moveTo(sil1.x-1,sil1.y-4); ctx.lineTo(sil2.x-1,sil2.y-4); ctx.stroke();
  // End cap
  ctx.fillStyle = '#0c0d11';
  ctx.beginPath(); ctx.arc(sil2.x, sil2.y, 6, 0, Math.PI*2); ctx.fill();

  // CLUTCH COVER — round case low on the engine side
  const cc = pt(0.49,-0.30*scale);
  ctx.fillStyle = '#262a33'; ctx.strokeStyle = '#3c414d'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(cc.x, cc.y, 0.058*scale, 0, Math.PI*2); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = '#494f5c'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(cc.x, cc.y, 0.034*scale, 0, Math.PI*2); ctx.stroke();

  // RADIATOR — dark core with subtle vanes at the engine front
  const rd1=pt(0.165,-0.06*scale), rd2=pt(0.135,-0.30*scale);
  ctx.strokeStyle = '#20242c'; ctx.lineWidth = 9;
  ctx.beginPath(); ctx.moveTo(rd1.x,rd1.y); ctx.lineTo(rd2.x,rd2.y); ctx.stroke();
  ctx.strokeStyle = 'rgba(160,170,190,0.18)'; ctx.lineWidth = 1;
  for(let i=1;i<=3;i++){
    const f=i/4;
    ctx.beginPath();
    ctx.moveTo(rd1.x+(rd2.x-rd1.x)*f-4, rd1.y+(rd2.y-rd1.y)*f);
    ctx.lineTo(rd1.x+(rd2.x-rd1.x)*f+4, rd1.y+(rd2.y-rd1.y)*f); ctx.stroke();
  }

  // FUEL TANK — Norden silhouette: rises behind the dash, crests, then flows
  // down into the saddle. Arctic white with blue/yellow rally livery.
  const tkA=pt(0.245,0.07*scale), tkB=pt(0.255,0.21*scale), tkC=pt(0.335,0.265*scale);
  const tkD=pt(0.58,0.135*scale), tkE=pt(0.565,0.04*scale);
  ctx.fillStyle = '#f0f2f5'; ctx.strokeStyle = '#0c0d11'; ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(tkA.x, tkA.y);
  ctx.lineTo(tkB.x, tkB.y);
  ctx.quadraticCurveTo(pt(0.28,0.27*scale).x, pt(0.28,0.27*scale).y, tkC.x, tkC.y);
  ctx.quadraticCurveTo(pt(0.46,0.225*scale).x, pt(0.46,0.225*scale).y, tkD.x, tkD.y);
  ctx.lineTo(tkE.x, tkE.y);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  // Blue lower side panel
  ctx.fillStyle = '#1e5a9e';
  ctx.beginPath();
  ctx.moveTo(pt(0.28,0.13*scale).x, pt(0.28,0.13*scale).y);
  ctx.lineTo(pt(0.55,0.115*scale).x, pt(0.55,0.115*scale).y);
  ctx.lineTo(pt(0.545,0.05*scale).x, pt(0.545,0.05*scale).y);
  ctx.lineTo(pt(0.275,0.075*scale).x, pt(0.275,0.075*scale).y);
  ctx.closePath(); ctx.fill();
  // Yellow accent along the tank crest
  ctx.fillStyle = '#ffd400';
  ctx.beginPath();
  ctx.moveTo(pt(0.31,0.225*scale).x, pt(0.31,0.225*scale).y);
  ctx.lineTo(pt(0.50,0.175*scale).x, pt(0.50,0.175*scale).y);
  ctx.lineTo(pt(0.495,0.155*scale).x, pt(0.495,0.155*scale).y);
  ctx.lineTo(pt(0.315,0.20*scale).x, pt(0.315,0.20*scale).y);
  ctx.closePath(); ctx.fill();
  // Husqvarna text mark on tank
  ctx.fillStyle = '#0c0d11'; ctx.font = `bold ${Math.round(scale*0.018)}px -apple-system,sans-serif`; ctx.textAlign = 'center';
  const txp = pt(0.415, 0.155*scale);
  ctx.fillText('HUSQVARNA', txp.x, txp.y);

  // SUBFRAME / SEAT — continuous rally saddle flowing off the tank,
  // slight pillion step, tail kick
  const seatBase = pt(0.58, 0.125*scale), seatBack = pt(0.945, 0.115*scale);
  ctx.strokeStyle = theme.frame; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(pt(0.60,0.075*scale).x, pt(0.60,0.075*scale).y);
  ctx.lineTo(pt(0.94,0.065*scale).x, pt(0.94,0.065*scale).y); ctx.stroke();
  ctx.fillStyle = '#1a1c22'; ctx.strokeStyle = '#0c0d11'; ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(seatBase.x, seatBase.y);
  ctx.quadraticCurveTo(pt(0.66,0.10*scale).x, pt(0.66,0.10*scale).y,
                       pt(0.76,0.125*scale).x, pt(0.76,0.125*scale).y);   // rider dip
  ctx.quadraticCurveTo(pt(0.86,0.145*scale).x, pt(0.86,0.145*scale).y,
                       seatBack.x, seatBack.y);                            // pillion rise
  ctx.lineTo(pt(0.94,0.065*scale).x, pt(0.94,0.065*scale).y);
  ctx.lineTo(pt(0.60,0.075*scale).x, pt(0.60,0.075*scale).y);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  // Seat stitch line
  ctx.strokeStyle = 'rgba(200,205,215,0.30)'; ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(pt(0.62,0.105*scale).x, pt(0.62,0.105*scale).y);
  ctx.lineTo(pt(0.92,0.10*scale).x, pt(0.92,0.10*scale).y); ctx.stroke();

  // TAIL — rear fender flick + taillight
  ctx.fillStyle = '#e6e9ee'; ctx.strokeStyle = '#0c0d11'; ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(pt(0.94,0.105*scale).x, pt(0.94,0.105*scale).y);
  ctx.lineTo(pt(1.015,0.06*scale).x, pt(1.015,0.06*scale).y);
  ctx.lineTo(pt(1.005,0.025*scale).x, pt(1.005,0.025*scale).y);
  ctx.lineTo(pt(0.93,0.065*scale).x, pt(0.93,0.065*scale).y);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#ff3b30';
  const tlp = pt(1.005, 0.048*scale);
  ctx.beginPath(); ctx.arc(tlp.x, tlp.y, 2.5, 0, Math.PI*2); ctx.fill();

  // Side number plate panel under the seat
  ctx.fillStyle = '#f0f2f5';
  const np1=pt(0.78,0.04*scale), np2=pt(0.93,0.02*scale);
  const np3=pt(0.92,-0.055*scale), np4=pt(0.79,-0.035*scale);
  ctx.beginPath();
  ctx.moveTo(np1.x,np1.y); ctx.lineTo(np2.x,np2.y);
  ctx.lineTo(np3.x,np3.y); ctx.lineTo(np4.x,np4.y);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#0c0d11'; ctx.font = `bold ${Math.round(scale*0.022)}px -apple-system,sans-serif`; ctx.textAlign='center';
  const npp = pt(0.855, 0.00*scale);
  ctx.fillText('901', npp.x, npp.y);

  // RALLY BEAK FAIRING — large Norden 901 duck-bill, forward of head tube
  const beakW = 0.28*scale;  // forward extension
  const beakTop = headY + 0.00*scale;
  const beakBot = headY + 0.17*scale;   // kept above the front wheel

  // Main beak body — arctic white
  ctx.fillStyle = '#f0f2f5'; ctx.strokeStyle = '#0c0d11'; ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(headX - 0.04*scale, beakTop + 0.02*scale);          // base top-rear
  ctx.quadraticCurveTo(headX + beakW*0.45, beakTop - 0.01*scale, // top arc fwd
                       headX + beakW,       beakTop + 0.05*scale); // front-top
  ctx.lineTo(headX + beakW + 0.015*scale,   beakTop + 0.12*scale); // front tip
  ctx.quadraticCurveTo(headX + beakW*0.65,  beakBot,              // bottom sweep
                       headX - 0.02*scale,  headY + 0.14*scale);  // base bottom
  ctx.closePath(); ctx.fill(); ctx.stroke();

  // Blue livery stripe across beak
  ctx.fillStyle = '#1e5a9e';
  ctx.beginPath();
  ctx.moveTo(headX - 0.01*scale, beakTop + 0.04*scale);
  ctx.quadraticCurveTo(headX + beakW*0.45, beakTop + 0.01*scale,
                       headX + beakW,       beakTop + 0.07*scale);
  ctx.lineTo(headX + beakW,       beakTop + 0.10*scale);
  ctx.quadraticCurveTo(headX + beakW*0.45, beakTop + 0.04*scale,
                       headX - 0.01*scale,  beakTop + 0.07*scale);
  ctx.closePath(); ctx.fill();

  // Yellow tip
  ctx.fillStyle = '#ffd400';
  ctx.beginPath();
  ctx.moveTo(headX + beakW, beakTop + 0.05*scale);
  ctx.lineTo(headX + beakW + 0.015*scale, beakTop + 0.12*scale);
  ctx.lineTo(headX + beakW - 0.02*scale,  beakTop + 0.13*scale);
  ctx.closePath(); ctx.fill();

  // TWIN HEADLIGHT — embedded in beak fairing, larger
  const hlX = headX + beakW*0.52, hlY = headY + 0.07*scale;
  ctx.fillStyle = '#0c0d11'; ctx.strokeStyle = '#3a3e48'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(hlX, hlY, 0.065*scale, 0, Math.PI*2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#fff4d0';
  ctx.beginPath(); ctx.arc(hlX, hlY, 0.052*scale, 0, Math.PI*2); ctx.fill();
  // DRL ring
  ctx.strokeStyle = 'rgba(255,250,200,0.8)'; ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.arc(hlX, hlY, 0.058*scale, 0, Math.PI*2); ctx.stroke();
  // Specular glint
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.beginPath(); ctx.arc(hlX - 0.014*scale, hlY - 0.014*scale, 0.024*scale, 0, Math.PI*2); ctx.fill();
  // LED bar below headlight
  ctx.fillStyle = '#1c2028';
  ctx.beginPath();
  ctx.ellipse(hlX, hlY + 0.085*scale, 0.06*scale, 0.015*scale, 0, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = '#fff4d0';
  ctx.beginPath();
  ctx.ellipse(hlX, hlY + 0.085*scale, 0.048*scale, 0.010*scale, 0, 0, Math.PI*2); ctx.fill();

  // WINDSCREEN — short rally screen, curves UPWARD above instruments
  ctx.fillStyle = 'rgba(80,120,160,0.30)'; ctx.strokeStyle = 'rgba(150,200,240,0.55)'; ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(headX + 0.02*scale, headY + 0.06*scale);             // base rear
  ctx.quadraticCurveTo(headX + 0.05*scale, headY - 0.09*scale,    // curves up-forward
                       headX + 0.09*scale, headY - 0.21*scale);   // top
  ctx.lineTo(headX + 0.12*scale, headY - 0.18*scale);             // top front edge
  ctx.quadraticCurveTo(headX + 0.08*scale, headY - 0.04*scale,    // back down
                       headX + 0.06*scale, headY + 0.07*scale);   // base front
  ctx.closePath(); ctx.fill(); ctx.stroke();
  // Windscreen glare line
  ctx.strokeStyle = 'rgba(255,255,255,0.2)'; ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(headX + 0.04*scale, headY + 0.02*scale);
  ctx.quadraticCurveTo(headX + 0.06*scale, headY - 0.07*scale, headX + 0.085*scale, headY - 0.18*scale);
  ctx.stroke();

  // RALLY DASH POD
  ctx.fillStyle = '#15171c'; ctx.strokeStyle = '#3a3e48'; ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.ellipse(headX + 0.02*scale, headY + 0.07*scale, 0.025*scale, 0.018*scale, 0.3, 0, Math.PI*2);
  ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#34c759';
  ctx.beginPath(); ctx.arc(headX + 0.018*scale, headY + 0.068*scale, 1.5, 0, Math.PI*2); ctx.fill();

  // RISERS + WIDE RALLY BARS — Norden bars sit ~0.15m ABOVE the upper clamp
  const barLx = headX + 0.035*scale, barLy = headY - 0.13*scale;   // grip (front)
  const barRx = headX - 0.045*scale, barRy = headY - 0.10*scale;   // bar rear end
  // Riser post from the upper triple clamp up to the bar
  ctx.strokeStyle = '#23262e'; ctx.lineWidth = 5;
  ctx.beginPath(); ctx.moveTo(headX, headY);
  ctx.lineTo(headX - 0.01*scale, headY - 0.115*scale); ctx.stroke();
  ctx.strokeStyle = '#1c1e25'; ctx.lineWidth = 5;
  ctx.beginPath(); ctx.moveTo(barRx, barRy); ctx.lineTo(barLx, barLy); ctx.stroke();
  ctx.strokeStyle = '#6a6e78'; ctx.lineWidth = 3.2;
  ctx.beginPath(); ctx.moveTo(barRx, barRy); ctx.lineTo(barLx, barLy); ctx.stroke();
  // Hand guard
  ctx.fillStyle = '#1c1e25'; ctx.strokeStyle = '#3a3e48'; ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(barLx + 0.005*scale, barLy - 0.008*scale);
  ctx.lineTo(barLx + 0.035*scale, barLy + 0.005*scale);
  ctx.lineTo(barLx + 0.030*scale, barLy + 0.022*scale);
  ctx.lineTo(barLx + 0.005*scale, barLy + 0.012*scale);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  // Mirror stalk — rises above the bars
  ctx.strokeStyle = '#3a3e48'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(barLx - 0.01*scale, barLy); ctx.lineTo(barLx - 0.02*scale, barLy - 0.05*scale); ctx.stroke();
  ctx.fillStyle = '#1c1e25';
  ctx.beginPath(); ctx.ellipse(barLx - 0.023*scale, barLy - 0.055*scale, 0.015*scale, 0.008*scale, -0.3, 0, Math.PI*2); ctx.fill();

  // RIDER — articulated figure in frame coordinates, so it pitches with the
  // bike. Seated normally; STANDS on the pegs when airborne. Posture follows
  // longitudinal G: braking (leanLong>0) drives shoulders/helmet forward and
  // straightens the arm (grip is fixed); accel pulls the body back.
  // Frame t runs head(0, front) → tail(1, rear); front of bike is +x (right).
  const stand = airborne ? 1 : 0;
  const hip      = pt(0.60 - stand*0.05, (0.135 + stand*0.12)*scale);
  const peg      = pt(0.47, -0.40*scale);     // footpeg at real height (~0.40m)
  const knee     = pt(0.40 + stand*0.02, (-0.10 + stand*0.05)*scale);
  const shoulder = pt(0.36 - leanLong*0.28 - stand*0.03,
                      (0.40 - Math.abs(leanLong)*0.06 + stand*0.07)*scale);
  const grip     = { x: barLx - 0.012*scale, y: barLy + 0.008*scale };
  const helmFinal = { x: shoulder.x + (0.030 + leanLong*0.10)*scale,
                      y: shoulder.y - 0.085*scale };
  const elbow = { x: (shoulder.x + grip.x)/2 + 0.012*scale,
                  y: (shoulder.y + grip.y)/2 + 0.035*scale };

  // Far-side limbs first (darker, offset) for depth
  ctx.strokeStyle = '#1a1e26'; ctx.lineWidth = 8;
  ctx.beginPath(); ctx.moveTo(hip.x + 5, hip.y + 2); ctx.lineTo(knee.x + 6, knee.y + 3); ctx.stroke();
  ctx.strokeStyle = '#222733'; ctx.lineWidth = 5;
  ctx.beginPath(); ctx.moveTo(shoulder.x + 5, shoulder.y + 3);
  ctx.quadraticCurveTo(elbow.x + 5, elbow.y + 3, grip.x + 5, grip.y + 3); ctx.stroke();

  // Near leg: thigh + shin in riding-suit grey, knee pad, boot on the peg
  ctx.strokeStyle = '#2c3240'; ctx.lineWidth = 11;
  ctx.beginPath(); ctx.moveTo(hip.x, hip.y); ctx.lineTo(knee.x, knee.y); ctx.stroke();
  ctx.strokeStyle = '#232834'; ctx.lineWidth = 7;
  ctx.beginPath(); ctx.moveTo(knee.x, knee.y); ctx.lineTo(peg.x, peg.y - 3); ctx.stroke();
  ctx.fillStyle = '#3d4454';
  ctx.beginPath(); ctx.arc(knee.x, knee.y, 4.5, 0, Math.PI*2); ctx.fill();
  // Footpeg + boot (toe points forward)
  ctx.strokeStyle = '#6a6e78'; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.moveTo(peg.x - 6, peg.y + 4); ctx.lineTo(peg.x + 6, peg.y + 4); ctx.stroke();
  ctx.fillStyle = '#14171d'; ctx.strokeStyle = '#3a3e48'; ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(peg.x - 5, peg.y - 7); ctx.lineTo(peg.x + 12, peg.y - 6);
  ctx.lineTo(peg.x + 13, peg.y + 2); ctx.lineTo(peg.x - 5, peg.y + 2);
  ctx.closePath(); ctx.fill(); ctx.stroke();

  // Seat contact: hip pad (hidden while standing)
  if (!airborne){
    ctx.fillStyle = '#2c3240';
    ctx.beginPath(); ctx.ellipse(hip.x + 2, hip.y + 3, 0.035*scale, 0.022*scale, -0.15, 0, Math.PI*2); ctx.fill();
  }

  // Torso — single solid spine from hip to shoulder, arched back
  const spineCx = (hip.x + shoulder.x)/2 - 0.018*scale;
  const spineCy = (hip.y + shoulder.y)/2 + 0.005*scale;
  ctx.strokeStyle = '#3d4658'; ctx.lineWidth = 13;
  ctx.beginPath(); ctx.moveTo(hip.x, hip.y + 0.005*scale);
  ctx.quadraticCurveTo(spineCx, spineCy, shoulder.x, shoulder.y); ctx.stroke();
  // Suit accent stripe along the back
  ctx.strokeStyle = '#ffd400'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(hip.x - 4, hip.y);
  ctx.quadraticCurveTo(spineCx - 5, spineCy, shoulder.x - 4, shoulder.y + 2); ctx.stroke();

  // Near arm — shoulder to the actual grip with a dropped elbow
  ctx.strokeStyle = '#465062'; ctx.lineWidth = 6;
  ctx.beginPath(); ctx.moveTo(shoulder.x, shoulder.y);
  ctx.quadraticCurveTo(elbow.x, elbow.y, grip.x, grip.y); ctx.stroke();
  // Glove on the grip
  ctx.fillStyle = '#1c1e25';
  ctx.beginPath(); ctx.arc(grip.x, grip.y, 3.5, 0, Math.PI*2); ctx.fill();

  // Neck + helmet — enduro full-face, visor facing forward
  ctx.strokeStyle = '#2c313d'; ctx.lineWidth = 6;
  ctx.beginPath(); ctx.moveTo(shoulder.x, shoulder.y);
  ctx.lineTo(helmFinal.x - 0.012*scale, helmFinal.y + 0.045*scale); ctx.stroke();
  const helmR = 0.062*scale;
  ctx.fillStyle = theme.helmet; ctx.strokeStyle = '#803000'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(helmFinal.x, helmFinal.y, helmR, 0, Math.PI*2); ctx.fill(); ctx.stroke();
  // Visor
  ctx.fillStyle = 'rgba(20,30,50,0.72)';
  ctx.beginPath(); ctx.arc(helmFinal.x + 0.018*scale, helmFinal.y + 0.004*scale, helmR*0.70, -0.4, 0.85); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 0.8;
  ctx.beginPath(); ctx.arc(helmFinal.x + 0.018*scale, helmFinal.y + 0.004*scale, helmR*0.70, -0.4, 0.85); ctx.stroke();
  // Rally peak (sun visor) on top front of the helmet
  ctx.fillStyle = theme.helmet; ctx.strokeStyle = '#60200a'; ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(helmFinal.x - 0.005*scale, helmFinal.y - helmR*0.9);
  ctx.lineTo(helmFinal.x + 0.055*scale, helmFinal.y - helmR*0.75);
  ctx.lineTo(helmFinal.x + 0.030*scale, helmFinal.y - helmR*0.45);
  ctx.closePath(); ctx.fill(); ctx.stroke();

  // CoG MARKER — shows weight distribution shift
  if (theme.showDebug !== false){
    const cogBaseX = hip.x - 0.04*scale, cogBaseY = hip.y - 0.04*scale;
    const cogShiftX = accelG * 0.06*scale;
    const cogX = cogBaseX + cogShiftX, cogY = cogBaseY;
    ctx.fillStyle = 'rgba(255,80,80,0.85)'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(cogX, cogY, 5, 0, Math.PI*2); ctx.fill(); ctx.stroke();
    // Cross hair quadrants
    ctx.fillStyle = '#fff';
    ctx.fillRect(cogX-4, cogY-1, 3, 2);
    ctx.fillRect(cogX+1, cogY-1, 3, 2);
    // Label
    ctx.font = 'bold 8px ui-monospace,monospace'; ctx.textAlign='center';
    ctx.fillStyle = 'rgba(255,80,80,0.9)';
    ctx.fillText('CoG', cogX, cogY - 9);
  }

  // LOAD ARROWS at wheels — visualize sprung load per axle
  if (theme.showDebug !== false && !airborne){
    const arrowAt = (sx, sy, magNorm, color) => {
      const len = 0.04*scale + magNorm * 0.10*scale;
      ctx.strokeStyle = color; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(sx, sy - 0.04*scale); ctx.lineTo(sx, sy - 0.04*scale - len); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(sx - 5, sy - 0.04*scale - len + 6);
      ctx.lineTo(sx, sy - 0.04*scale - len);
      ctx.lineTo(sx + 5, sy - 0.04*scale - len + 6);
      ctx.stroke();
      ctx.fillStyle = color; ctx.font='bold 9px ui-monospace,monospace'; ctx.textAlign='center';
      ctx.fillText(`${(magNorm*100).toFixed(0)}%`, sx, sy - 0.04*scale - len - 4);
    };
    arrowAt(wfS.sx, wfS.sy + rWheelF*scale, fCompPct, fCompPct>0.85?'#ff3b30':fCompPct>0.65?'#ff8a00':'#ffe300');
    arrowAt(wrS.sx, wrS.sy + rWheelR*scale, rCompPct, rCompPct>0.85?'#ff3b30':rCompPct>0.65?'#ff8a00':'#ff8a00');
  }

  // ON-CANVAS TRAVEL LABELS
  ctx.font = 'bold 10px ui-monospace,monospace'; ctx.textAlign = 'left';
  const fkCol = fCompPct>0.85?'#ff3b30':fCompPct>0.65?'#ff8a00':fCompPct>0.40?'#ffe300':'#80b080';
  ctx.fillStyle = fkCol;
  ctx.fillText(`F ${(fCompPct*100).toFixed(0)}%`, frFS.sx+18, (frFS.sy+wfS.sy)/2+4);
  const shCol = rCompPct>0.85?'#ff3b30':rCompPct>0.65?'#ff8a00':'#9aa0b8';
  ctx.fillStyle = shCol;
  ctx.fillText(`R ${(rCompPct*100).toFixed(0)}%`, (shockBx+shockTx)/2+14, (shockBy+shockTy)/2+4);

  ctx.restore();
}

function draw(){
  const {w,h} = fitCanvas(cv);
  ctx.clearRect(0,0,w,h);

  // Stage framing: ground sits low (0.80h) and the scale reserves headroom
  // for the full bike + rider helmet (~1.4m) plus bump/jump excursion.
  const scale = Math.min(w / 2.6, h / 2.2, 520);
  const cx = w/2, cy = h*0.80;

  const ter = terrain(sim.t);
  ter.ztF = sim.ztF; ter.ztR = sim.ztR;
  drawTerrain(ctx, cx, cy, scale, w, ter);

  // Actual fork/shock travel = sprung displacement minus tire deflection
  const fComp = Math.max(0, staticSag.f + sim.zfDyn - sim.ztF);
  const rComp = Math.max(0, staticSag.r + sim.zrDyn - sim.ztR);

  drawBikeFull(ctx, cx, cy, scale, fComp, rComp, sim.airborne, sim.yAir, ter, sim.t,
    {frame: '#f5d800', helmet: '#d07000'});

  drawTravelBar(ctx, 30, h-50, 200, 14, fComp/BIKE.fTravel, 'Front', '#ffe300');
  drawTravelBar(ctx, 30, h-30, 200, 14, rComp/BIKE.rTravel, 'Rear',  '#ff8a00');

  // DOM TELEMETRY
  const forkLenU = BIKE.forkLenU, rearArmU = BIKE.rearArmU;
  const frFy = BIKE.rWheelF - sim.ztF + (forkLenU - fComp) * Math.cos(BIKE.rake);
  const frRy = BIKE.rWheelR - sim.ztR + rearArmU - rComp;
  $('m_fTrav').textContent = `${(fComp*1000).toFixed(0)}/${(BIKE.fTravel*1000).toFixed(0)} mm`;
  $('m_rTrav').textContent = `${(rComp*1000).toFixed(0)}/${(BIKE.rTravel*1000).toFixed(0)} mm`;
  const pitchDeg = Math.atan2((frRy-frFy), BIKE.wb)*180/Math.PI;
  $('m_pitch').textContent = `${pitchDeg.toFixed(1)}°`;
  $('m_g').textContent = `${(sim.peakA/g).toFixed(2)} g`;
  $('stageInfo').textContent = compareMode
    ? `SIM A  ·  F ${state.fComp}/${state.fReb}  R ${state.rComp}/${state.rReb}  ·  ${state.rider+state.pillion+state.luggage}kg  ·  t=${sim.t.toFixed(2)}s`
    : `t = ${sim.t.toFixed(2)}s · scenario: ${state.scenario}`;

  drawChart();
}

function drawGhost(){
  if(!compareMode) return;
  const {w,h} = fitCanvas(ghostCv);
  ghostCtx.clearRect(0,0,w,h);
  ghostCtx.fillStyle='#080a0d'; ghostCtx.fillRect(0,0,w,h);

  ghostCtx.fillStyle='rgba(79,195,247,0.12)'; ghostCtx.fillRect(0,0,w,18);
  ghostCtx.fillStyle='#4fc3f7'; ghostCtx.font='bold 10px -apple-system,sans-serif'; ghostCtx.textAlign='left';
  ghostCtx.fillText(`⊕ SIM B  ·  F comp ${state2.fComp}/reb ${state2.fReb}  ·  R comp ${state2.rComp}/reb ${state2.rReb}  ·  ${state2.rider+state2.pillion+state2.luggage} kg`,6,13);
  ghostCtx.textAlign='right';
  ghostCtx.fillStyle='rgba(79,195,247,0.6)'; ghostCtx.font='9px monospace';
  ghostCtx.fillText(`F sag ${(staticSag2.f/BIKE.fTravel*100).toFixed(0)}%  R sag ${(staticSag2.r/BIKE.rTravel*100).toFixed(0)}%`,w-6,13);

  const hInner = h - 18;
  const scale = Math.min(w/2.6, hInner/2.2, 520);
  const cx = w/2, cy = 18 + hInner*0.80;
  const ter = terrain(sim2.t);
  ter.ztF = sim2.ztF; ter.ztR = sim2.ztR;
  drawTerrain(ghostCtx, cx, cy, scale, w, ter);
  const fComp2 = Math.max(0, staticSag2.f + sim2.zfDyn - sim2.ztF);
  const rComp2 = Math.max(0, staticSag2.r + sim2.zrDyn - sim2.ztR);
  drawBikeFull(ghostCtx, cx, cy, scale, fComp2, rComp2, sim2.airborne, sim2.yAir, ter, sim2.t,
    {frame: '#4fc3f7', helmet: '#4fc3f7', showDebug: false});
  drawTravelBar(ghostCtx, 10, h-30, 150, 10, fComp2/BIKE.fTravel, 'F', '#4fc3f7');
  drawTravelBar(ghostCtx, 10, h-16, 150, 10, rComp2/BIKE.rTravel, 'R', '#80deea');
}

function drawTerrain(ctx, cx, cy, scale, w, ter){
  const v = state.speed/3.6 || 1;

  // Ground fill
  const grd = ctx.createLinearGradient(0, cy, 0, cy+120);
  grd.addColorStop(0, '#25282f'); grd.addColorStop(0.4,'#1c1e24'); grd.addColorStop(1,'#131418');
  ctx.fillStyle = grd; ctx.fillRect(0, cy-2, w, 9999);

  // Build terrain profile
  const STEP = 3;
  const pts = [];
  for (let px=0; px<=w; px+=STEP){
    const xWorld = (px - cx)/scale;
    let h = 0;
    if (state.scenario==='bump' || state.scenario==='pothole'){
      const sign = state.scenario==='pothole' ? -1 : 1;
      const bh = state.bumpH/1000 * sign;
      const L = state.bumpL/1000;
      const gap = Math.max(0.5, +state.bumpGap || Math.max(2.0, L*3));
      const period = L + gap;
      const wheelWorldOffset = +BIKE.wb/2 - (v*sim.t - 0.3*v);
      let xRel = xWorld - wheelWorldOffset;
      if (loopMode) xRel = ((xRel % period) + period) % period;
      if (xRel>0 && xRel<L) h = bh * 0.5*(1 - Math.cos(2*Math.PI*xRel/L));
    } else if (state.scenario==='washboard'){
      const bh = state.bumpH/2000;
      const L = state.bumpL/1000;
      const offset = +(v*sim.t);  // positive: terrain scrolls left as bike moves forward
      h = bh * Math.sin(2*Math.PI*(xWorld - +BIKE.wb/2 + offset)/L);
    }
    pts.push({px, h});
  }

  // Road surface fill below profile
  ctx.beginPath();
  ctx.moveTo(0, cy);
  pts.forEach(p => ctx.lineTo(p.px, cy - p.h*scale));
  ctx.lineTo(w, cy);
  ctx.closePath();
  ctx.fillStyle = '#21242b'; ctx.fill();

  // Base road line (flat road segments)
  ctx.beginPath();
  pts.forEach((p,i) => i===0 ? ctx.moveTo(p.px, cy - p.h*scale) : ctx.lineTo(p.px, cy - p.h*scale));
  ctx.strokeStyle = '#363b46'; ctx.lineWidth = 2; ctx.stroke();

  // Highlight bump/pothole profile in accent color
  const bumpPts = pts.filter(p => Math.abs(p.h) > 0.0005);
  if (bumpPts.length > 1){
    // fill bump surface area
    ctx.beginPath();
    ctx.moveTo(bumpPts[0].px, cy);
    bumpPts.forEach(p => ctx.lineTo(p.px, cy - p.h*scale));
    ctx.lineTo(bumpPts[bumpPts.length-1].px, cy);
    ctx.closePath();
    const bumpFill = state.scenario==='pothole' ? 'rgba(255,100,40,0.08)' : 'rgba(80,140,255,0.07)';
    ctx.fillStyle = bumpFill; ctx.fill();
    // bump profile line
    ctx.beginPath();
    bumpPts.forEach((p,i) => i===0 ? ctx.moveTo(p.px, cy - p.h*scale) : ctx.lineTo(p.px, cy - p.h*scale));
    ctx.strokeStyle = state.scenario==='pothole' ? '#ff6030' : '#5090ff';
    ctx.lineWidth = 2.5; ctx.stroke();
  }
}

// isFront=true → 21" slim knobby (dirt-biased 90/90-21).
// isFront=false → 18" fatter dual-sport (150/70-18).
// loadFrac (0..1+) flattens contact patch; >1 indicates overload.
function drawWheel(ctx, sx, sy, r, simT, isFront, loadFrac){
  ctx.save();
  const tireW = isFront ? r * 0.13 : r * 0.22;  // 21" slim, 18" fat
  const rimR  = r - tireW;
  const hubR  = r * (isFront ? 0.13 : 0.16);
  const angBase = simT * (state.speed/3.6) / Math.max(r, 0.01);
  const nSpokes = isFront ? 36 : 32;  // 21" usually 36-spoke, 18" 32-spoke
  const squish = Math.min(0.06, Math.max(0, (loadFrac||0) - 0.25)) * r;

  // Contact patch — flatten bottom of tire under load
  ctx.beginPath();
  if (squish > 0.5){
    // Tire shape: circle minus bottom flat
    const flatHalfW = Math.sqrt(r*r - (r-squish)*(r-squish));
    const flatY = sy + (r - squish);
    const aL = Math.PI - Math.asin(flatHalfW/r);
    const aR = Math.asin(flatHalfW/r);
    ctx.arc(sx, sy, r, -aL, Math.PI - aR, false);
    ctx.lineTo(sx + flatHalfW, flatY);
    ctx.lineTo(sx - flatHalfW, flatY);
    ctx.closePath();
  } else {
    ctx.arc(sx, sy, r, 0, Math.PI*2);
  }
  ctx.fillStyle = '#0e0e0e'; ctx.fill();
  ctx.strokeStyle = '#1a1a1a'; ctx.lineWidth = 1; ctx.stroke();

  // Tread blocks — knobby for front, ribbed for rear
  ctx.save();
  ctx.translate(sx, sy);
  ctx.rotate(angBase);
  if (isFront){
    // Aggressive knobs — 21" dirt-biased
    const nBlocks = 20;
    ctx.fillStyle = '#1d1d1d';
    for (let i = 0; i < nBlocks; i++){
      const a = i * (Math.PI*2/nBlocks);
      const bx = Math.cos(a)*(r - tireW*0.35);
      const by = Math.sin(a)*(r - tireW*0.35);
      ctx.save(); ctx.translate(bx, by); ctx.rotate(a + Math.PI/2);
      ctx.fillRect(-tireW*0.22, -tireW*0.30, tireW*0.44, tireW*0.55);
      ctx.restore();
    }
  } else {
    // Center rib + shoulder lugs — 18" dual-sport
    ctx.strokeStyle = '#1d1d1d'; ctx.lineWidth = tireW*0.18;
    ctx.beginPath(); ctx.arc(0, 0, r - tireW*0.42, 0, Math.PI*2); ctx.stroke();
    const nLugs = 26;
    ctx.fillStyle = '#1d1d1d';
    for (let i = 0; i < nLugs; i++){
      const a = i * (Math.PI*2/nLugs);
      const bx = Math.cos(a)*(r - tireW*0.18);
      const by = Math.sin(a)*(r - tireW*0.18);
      ctx.beginPath(); ctx.arc(bx, by, tireW*0.13, 0, Math.PI*2); ctx.fill();
    }
  }
  ctx.restore();

  // Sidewall band (slight highlight to show profile depth)
  ctx.beginPath(); ctx.arc(sx, sy, r - tireW*0.55, 0, Math.PI*2);
  ctx.strokeStyle = '#2b2b2b'; ctx.lineWidth = 1; ctx.stroke();

  // Rim — anodized look
  ctx.beginPath(); ctx.arc(sx, sy, rimR, 0, Math.PI*2);
  const rimGrad = ctx.createRadialGradient(sx, sy-rimR*0.4, rimR*0.2, sx, sy, rimR);
  rimGrad.addColorStop(0, '#5a5e68'); rimGrad.addColorStop(1, '#2a2c34');
  ctx.fillStyle = rimGrad; ctx.fill();
  ctx.strokeStyle = '#1a1c22'; ctx.lineWidth = 1.5; ctx.stroke();
  // Inner rim line
  ctx.beginPath(); ctx.arc(sx, sy, rimR*0.92, 0, Math.PI*2);
  ctx.strokeStyle = '#161820'; ctx.lineWidth = 1; ctx.stroke();

  // Spokes — cross-laced
  ctx.strokeStyle = 'rgba(180,185,195,0.55)'; ctx.lineWidth = 0.8;
  for (let i = 0; i < nSpokes; i++){
    const a = i * (Math.PI*2/nSpokes) + angBase;
    const lace = (i % 2 === 0) ? 0.35 : -0.35;
    ctx.beginPath();
    ctx.moveTo(sx + Math.cos(a)*hubR*1.05, sy + Math.sin(a)*hubR*1.05);
    ctx.lineTo(sx + Math.cos(a + lace)*rimR*0.93, sy + Math.sin(a + lace)*rimR*0.93);
    ctx.stroke();
  }

  // Hub — brake disc visible on front, sprocket hint on rear
  if (isFront){
    // Brake rotor
    ctx.beginPath(); ctx.arc(sx, sy, hubR*2.2, 0, Math.PI*2);
    ctx.strokeStyle = '#888c95'; ctx.lineWidth = 2; ctx.stroke();
    ctx.strokeStyle = '#3a3d44'; ctx.lineWidth = 0.8;
    for (let i = 0; i < 10; i++){
      const a = i * Math.PI/5 + angBase*0.5;
      ctx.beginPath();
      ctx.moveTo(sx + Math.cos(a)*hubR*1.5, sy + Math.sin(a)*hubR*1.5);
      ctx.lineTo(sx + Math.cos(a)*hubR*2.0, sy + Math.sin(a)*hubR*2.0);
      ctx.stroke();
    }
  } else {
    // Sprocket teeth
    ctx.fillStyle = '#454850';
    const nTeeth = 42;
    for (let i = 0; i < nTeeth; i++){
      const a = i * (Math.PI*2/nTeeth) + angBase*0.3;
      const tx = sx + Math.cos(a)*hubR*1.9, ty = sy + Math.sin(a)*hubR*1.9;
      ctx.beginPath(); ctx.arc(tx, ty, 1.2, 0, Math.PI*2); ctx.fill();
    }
  }

  ctx.beginPath(); ctx.arc(sx, sy, hubR, 0, Math.PI*2);
  ctx.fillStyle = '#2a2c34'; ctx.fill();
  ctx.strokeStyle = '#54585f'; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.beginPath(); ctx.arc(sx, sy, hubR*0.35, 0, Math.PI*2);
  ctx.fillStyle = '#6a6e78'; ctx.fill();

  ctx.restore();
}

function drawTravelBar(ctx, x, y, w, h, frac, label, color){
  frac = Math.max(0, Math.min(1, frac));
  ctx.fillStyle = '#0a0b0e'; ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = '#2a2e38'; ctx.strokeRect(x, y, w, h);
  ctx.fillStyle = frac > 0.95 ? '#ff3b30' : color;
  ctx.fillRect(x+1, y+1, (w-2)*frac, h-2);
  ctx.fillStyle = '#ddd'; ctx.font = '11px ui-monospace, monospace';
  ctx.fillText(`${label} ${(frac*100).toFixed(0)}%`, x+6, y+h-4);
}

function drawLiveChart(cv, cx, color, sagFrac, predictedPeak){
  const {w,h} = fitCanvas(cv);
  cx.clearRect(0,0,w,h);
  cx.fillStyle='#0a0b0e'; cx.fillRect(0,0,w,h);
  const PAD={l:32,r:6,t:5,b:5};
  const iH=h-PAD.t-PAD.b;
  const yOf=f=>PAD.t+(1-f)*iH;
  const xW=w-PAD.l-PAD.r;
  const dimColor = color==='#ffe300' ? 'rgba(255,227,0,' : 'rgba(255,138,0,';

  cx.fillStyle='rgba(52,199,89,0.05)';
  cx.fillRect(PAD.l, yOf(0.70), xW, yOf(0.20)-yOf(0.70));

  cx.strokeStyle='#1c1f26'; cx.lineWidth=1;
  for(const p of[0,.25,.5,.75,1]){
    cx.beginPath(); cx.moveTo(PAD.l,yOf(p)); cx.lineTo(w-PAD.r,yOf(p)); cx.stroke();
  }
  cx.fillStyle='#5a5e68'; cx.font='9px ui-monospace,monospace'; cx.textAlign='right';
  for(const [p,lbl] of[[1,'100%'],[.75,'75%'],[.5,'50%'],[.25,'25%'],[0,'0%']])
    cx.fillText(lbl, PAD.l-3, yOf(p)+3);
  cx.textAlign='left';

  if(predictedPeak > 0){
    cx.strokeStyle=dimColor+'0.45)'; cx.lineWidth=1; cx.setLineDash([3,4]);
    cx.beginPath(); cx.moveTo(PAD.l,yOf(predictedPeak)); cx.lineTo(w-PAD.r,yOf(predictedPeak)); cx.stroke();
    cx.setLineDash([]);
    cx.fillStyle=dimColor+'0.55)'; cx.font='8px monospace'; cx.textAlign='right';
    cx.fillText(`pred ${(predictedPeak*100).toFixed(0)}%`, w-PAD.r-2, yOf(predictedPeak)-3);
    cx.textAlign='left';
  }

  if(sagFrac>0){
    cx.strokeStyle='rgba(255,255,255,0.18)'; cx.lineWidth=1; cx.setLineDash([4,3]);
    cx.beginPath(); cx.moveTo(PAD.l,yOf(sagFrac)); cx.lineTo(w-PAD.r,yOf(sagFrac)); cx.stroke();
    cx.setLineDash([]);
    cx.fillStyle='rgba(255,255,255,0.3)'; cx.font='9px monospace';
    cx.fillText(`sag ${(sagFrac*100).toFixed(0)}%`, PAD.l+2, yOf(sagFrac)-3);
  }

  cx.strokeStyle='rgba(255,59,48,0.55)'; cx.lineWidth=1.5; cx.setLineDash([3,3]);
  cx.beginPath(); cx.moveTo(PAD.l,yOf(1)); cx.lineTo(w-PAD.r,yOf(1)); cx.stroke();
  cx.setLineDash([]);

  if(sim.history.length < 2) return;
  const tEnd=sim.history[sim.history.length-1].t;
  const tStart=Math.max(0,tEnd-5);
  const xOf=t=>PAD.l+(t-tStart)/(tEnd-tStart||1)*xW;

  cx.strokeStyle=color; cx.lineWidth=2;
  cx.beginPath();
  sim.history.forEach((p,i)=>{
    const val = color==='#ffe300' ? p.f : p.r;
    const sx=xOf(p.t), sy=yOf(val);
    if(i===0) cx.moveTo(sx,sy); else cx.lineTo(sx,sy);
  });
  cx.stroke();

  if(compareMode && sim2.history.length>=2){
    const tEnd2=sim2.history[sim2.history.length-1].t;
    const tSt2=Math.max(0,tEnd2-5);
    const xOf2=t=>PAD.l+(t-tSt2)/(tEnd2-tSt2||1)*xW;
    cx.strokeStyle='rgba(79,195,247,0.75)'; cx.lineWidth=1.5;
    cx.beginPath();
    sim2.history.forEach((p,i)=>{
      const val=color==='#ffe300'?p.f:p.r;
      const sx=xOf2(p.t), sy=yOf(val);
      if(i===0) cx.moveTo(sx,sy); else cx.lineTo(sx,sy);
    });
    cx.stroke();
    cx.fillStyle='rgba(79,195,247,0.7)'; cx.font='bold 8px monospace'; cx.textAlign='left';
    cx.fillText('B',PAD.l+2,PAD.t+14);
  }
}

function drawChart(){
  const sagF=staticSag.f/BIKE.fTravel;
  const sagR=staticSag.r/BIKE.rTravel;
  const {pts} = buildRefData();
  const peakF = pts.length ? pts.reduce((a,b)=>b.f>a.f?b:a).f : 0;
  const peakR = pts.length ? pts.reduce((a,b)=>b.r>a.r?b:a).r : 0;
  drawLiveChart(chartF, cctxF, '#ffe300', sagF, peakF);
  drawLiveChart(chartR, cctxR, '#ff8a00', sagR, peakR);
  if(chartG && cctxG) drawGChart(chartG, cctxG);
  if(chartP && cctxP) drawPitchChart(chartP, cctxP);
  const last=sim.history[sim.history.length-1];
  if(last){
    $('m_fTravLbl').textContent=`${(last.f*100).toFixed(0)}% now`;
    $('m_rTravLbl').textContent=`${(last.r*100).toFixed(0)}% now`;
  }
}

function drawRefChart(){
  const {pts, sagF, sagR}=buildRefData();
  if(!pts.length) return;
  const dpr=window.devicePixelRatio||1;
  const w=Math.max(80, chartRef.offsetWidth);
  const h=148;
  chartRef.style.height=h+'px';
  const bw=Math.round(w*dpr), bh=Math.round(h*dpr);
  if(chartRef.width!==bw||chartRef.height!==bh){ chartRef.width=bw; chartRef.height=bh; }
  const cx=cctxRef;
  cx.setTransform(dpr,0,0,dpr,0,0);
  cx.clearRect(0,0,w,h);
  cx.fillStyle='#0a0b0e'; cx.fillRect(0,0,w,h);
  const PAD={l:36,r:8,t:22,b:18};
  const iW=w-PAD.l-PAD.r, iH=h-PAD.t-PAD.b;
  const tMax=2.5;
  const xOf=t=>PAD.l+(t/tMax)*iW;
  const yOf=f=>PAD.t+(1-f)*iH;

  const DIV1=xOf(0.3), DIV2=xOf(0.9);
  cx.strokeStyle='rgba(255,255,255,0.08)'; cx.lineWidth=1; cx.setLineDash([2,4]);
  cx.beginPath(); cx.moveTo(DIV1,PAD.t); cx.lineTo(DIV1,h-PAD.b); cx.stroke();
  cx.beginPath(); cx.moveTo(DIV2,PAD.t); cx.lineTo(DIV2,h-PAD.b); cx.stroke();
  cx.setLineDash([]);

  cx.font='bold 9px -apple-system,sans-serif'; cx.textAlign='center';
  cx.fillStyle='rgba(255,138,0,0.75)'; cx.fillText('compress', (PAD.l+DIV1)/2,   PAD.t-7);
  cx.fillStyle='rgba(255,227,0,0.75)'; cx.fillText('rebound',  (DIV1+DIV2)/2,    PAD.t-7);
  cx.fillStyle='rgba(52,199,89,0.75)';  cx.fillText('settled',  (DIV2+w-PAD.r)/2, PAD.t-7);
  cx.textAlign='left';

  cx.fillStyle='rgba(52,199,89,0.06)';
  cx.fillRect(PAD.l,yOf(0.70),iW,yOf(0.20)-yOf(0.70));

  cx.strokeStyle='#1c1f26'; cx.lineWidth=1;
  for(const p of[0,.25,.5,.75,1]){
    cx.beginPath(); cx.moveTo(PAD.l,yOf(p)); cx.lineTo(w-PAD.r,yOf(p)); cx.stroke();
  }
  for(let t=0.5;t<tMax;t+=0.5){
    cx.beginPath(); cx.moveTo(xOf(t),PAD.t); cx.lineTo(xOf(t),h-PAD.b); cx.stroke();
  }

  cx.strokeStyle='rgba(255,59,48,0.55)'; cx.lineWidth=1.5; cx.setLineDash([3,3]);
  cx.beginPath(); cx.moveTo(PAD.l,yOf(1)); cx.lineTo(w-PAD.r,yOf(1)); cx.stroke();
  cx.setLineDash([]);
  cx.fillStyle='rgba(255,59,48,0.55)'; cx.font='8px monospace'; cx.textAlign='left';
  cx.fillText('100% BOTTOMING', PAD.l+3, yOf(1)+9);

  cx.strokeStyle='rgba(255,227,0,0.28)'; cx.lineWidth=1; cx.setLineDash([4,3]);
  cx.beginPath(); cx.moveTo(PAD.l,yOf(sagF)); cx.lineTo(w-PAD.r,yOf(sagF)); cx.stroke();
  cx.strokeStyle='rgba(255,138,0,0.28)';
  cx.beginPath(); cx.moveTo(PAD.l,yOf(sagR)); cx.lineTo(w-PAD.r,yOf(sagR)); cx.stroke();
  cx.setLineDash([]);

  cx.fillStyle='#5a5e68'; cx.font='9px ui-monospace,monospace'; cx.textAlign='right';
  for(const [p,l] of[[1,'100%'],[.75,'75%'],[.5,'50%'],[.25,'25%'],[0,'0%']])
    cx.fillText(l, PAD.l-3, yOf(p)+3);
  cx.textAlign='center';
  for(let t=0;t<=2;t+=0.5) cx.fillText(`${t}s`, xOf(t), h-3);
  cx.textAlign='left';

  cx.strokeStyle='#ffe300'; cx.lineWidth=2.5;
  cx.beginPath();
  pts.forEach((p,i)=>{ i===0?cx.moveTo(xOf(p.t),yOf(p.f)):cx.lineTo(xOf(p.t),yOf(p.f)); });
  cx.stroke();
  cx.strokeStyle='#ff8a00'; cx.lineWidth=2.5;
  cx.beginPath();
  pts.forEach((p,i)=>{ i===0?cx.moveTo(xOf(p.t),yOf(p.r)):cx.lineTo(xOf(p.t),yOf(p.r)); });
  cx.stroke();

  const peakF=pts.reduce((a,b)=>b.f>a.f?b:a);
  const peakR=pts.reduce((a,b)=>b.r>a.r?b:a);
  const fpx=xOf(peakF.t), fpy=yOf(peakF.f);
  const rpx=xOf(peakR.t), rpy=yOf(peakR.r);
  const fpLY=Math.max(PAD.t+10, fpy-22);
  const rpLY=Math.max(PAD.t+10, rpy-22);

  cx.strokeStyle='rgba(255,227,0,0.7)'; cx.lineWidth=1;
  cx.beginPath(); cx.moveTo(fpx,fpy); cx.lineTo(fpx,fpLY+2); cx.stroke();
  cx.fillStyle='#ffe300'; cx.font='bold 9px -apple-system,sans-serif'; cx.textAlign='center';
  cx.fillText(`F ${(peakF.f*100).toFixed(0)}%`, fpx, fpLY);

  cx.strokeStyle='rgba(255,138,0,0.7)';
  cx.beginPath(); cx.moveTo(rpx,rpy); cx.lineTo(rpx,rpLY+2); cx.stroke();
  cx.fillStyle='#ff8a00'; cx.textAlign='center';
  cx.fillText(`R ${(peakR.r*100).toFixed(0)}%`, rpx+20, rpLY);

  cx.font='9px monospace'; cx.textAlign='right';
  cx.fillStyle='rgba(255,227,0,0.5)';
  cx.fillText(`F sag ${(sagF*100).toFixed(0)}%`, w-PAD.r-2, yOf(sagF)-3);
  cx.fillStyle='rgba(255,138,0,0.5)';
  const rSagLY=Math.abs(yOf(sagR)-yOf(sagF))<12 ? yOf(sagR)+10 : yOf(sagR)-3;
  cx.fillText(`R sag ${(sagR*100).toFixed(0)}%`, w-PAD.r-2, rSagLY);

  cx.fillStyle='rgba(52,199,89,0.45)'; cx.font='8px monospace'; cx.textAlign='right';
  cx.fillText('good zone 20–70%', w-PAD.r-2, yOf(0.44));
  cx.textAlign='left';
}

/* ---------- Damping Analysis Modal ---------- */
function drawDampingPanel(id, cComp, cReb, k, m, travel, accentColor){
  const VMAX=2.5, bH=0.060, bL=0.300, vSpd=60/3.6, tMax=3.0;

  const fvC = $('dvFV'+id);
  if (!fvC) return;
  fvC.width = fvC.offsetWidth||420;
  const FW=fvC.width, FH=fvC.height;
  const fvCtx=fvC.getContext('2d');
  fvCtx.clearRect(0,0,FW,FH);

  const FMAX=Math.max(cComp,cReb)*VMAX*1.15;
  const cx0=FW/2, cy0=FH/2;
  const vToX=v=>cx0+(v/VMAX)*(FW/2-28);
  const fToY=f=>cy0-(f/FMAX)*(FH/2-20);

  fvCtx.strokeStyle='#1c1f26'; fvCtx.lineWidth=1;
  for(let i=1;i<=3;i++){
    const f=FMAX*i/4;
    fvCtx.beginPath(); fvCtx.moveTo(0,fToY(f)); fvCtx.lineTo(FW,fToY(f)); fvCtx.stroke();
  }
  for(const v of[-2,-1,1,2]){
    fvCtx.beginPath(); fvCtx.moveTo(vToX(v),0); fvCtx.lineTo(vToX(v),FH); fvCtx.stroke();
  }
  fvCtx.strokeStyle='#3a3e48'; fvCtx.lineWidth=1.5;
  fvCtx.beginPath();
  fvCtx.moveTo(0,cy0); fvCtx.lineTo(FW,cy0);
  fvCtx.moveTo(cx0,0); fvCtx.lineTo(cx0,FH);
  fvCtx.stroke();

  fvCtx.fillStyle='#8b8f99'; fvCtx.font='10px ui-monospace,monospace'; fvCtx.textAlign='center';
  for(const v of[-2,-1,1,2]) fvCtx.fillText(`${v>0?'+':''}${v}`, vToX(v), cy0+14);
  fvCtx.textAlign='left';
  fvCtx.fillStyle='#5a5e68'; fvCtx.font='10px -apple-system,sans-serif';
  fvCtx.fillText('← rebound    compression →', cx0-60, cy0-7);
  fvCtx.fillText('velocity (m/s)', FW/2-36, FH-4);

  fvCtx.fillStyle='#5a5e68'; fvCtx.font='9px ui-monospace,monospace'; fvCtx.textAlign='right';
  for(let i=1;i<=3;i++){
    const f=FMAX*i/4;
    fvCtx.fillText(`${(f/1000).toFixed(1)}kN`, cx0-4, fToY(f)+3);
  }
  fvCtx.textAlign='left';

  fvCtx.beginPath(); fvCtx.strokeStyle='#ff8a00'; fvCtx.lineWidth=3;
  fvCtx.moveTo(vToX(0),fToY(0));
  fvCtx.lineTo(vToX(VMAX),fToY(cComp*VMAX));
  fvCtx.stroke();
  fvCtx.beginPath();
  fvCtx.moveTo(vToX(0),fToY(0));
  fvCtx.lineTo(vToX(VMAX),fToY(cComp*VMAX));
  fvCtx.lineTo(vToX(VMAX),cy0);
  fvCtx.closePath();
  fvCtx.fillStyle='rgba(255,138,0,0.07)'; fvCtx.fill();

  fvCtx.beginPath(); fvCtx.strokeStyle='#ffe300'; fvCtx.lineWidth=3;
  fvCtx.moveTo(vToX(0),fToY(0));
  fvCtx.lineTo(vToX(-VMAX),fToY(cReb*VMAX));
  fvCtx.stroke();
  fvCtx.beginPath();
  fvCtx.moveTo(vToX(0),fToY(0));
  fvCtx.lineTo(vToX(-VMAX),fToY(cReb*VMAX));
  fvCtx.lineTo(vToX(-VMAX),cy0);
  fvCtx.closePath();
  fvCtx.fillStyle='rgba(255,227,0,0.06)'; fvCtx.fill();

  fvCtx.fillStyle='#ff8a00'; fvCtx.font='bold 11px -apple-system,sans-serif';
  fvCtx.textAlign='right';
  fvCtx.fillText(`COMP  ${(cComp/1000).toFixed(2)} kNs/m`, FW-8, FH-6);
  fvCtx.fillStyle='#ffe300'; fvCtx.textAlign='left';
  fvCtx.fillText(`REB  ${(cReb/1000).toFixed(2)} kNs/m`, 8, FH-6);
  fvCtx.textAlign='left';

  /* Bump response simulation */
  const sagEq=(m*g)/k;
  const bProf=x=>(x>0&&x<bL)?bH*0.5*(1-Math.cos(2*Math.PI*x/bL)):0;
  const bVel =x=>(x>0&&x<bL)?bH*Math.PI/bL*Math.sin(2*Math.PI*x/bL)*vSpd:0;
  let zDyn=0,zV=0; const samples=[]; let bottomed=false;
  for(let i=0;i*0.001<tMax;i++){
    const ts=i*0.001;
    const xPos=vSpd*ts-0.15*vSpd;
    const y=bProf(xPos);
    const yv=Math.max(-2.5,Math.min(2.5,bVel(xPos)));
    const xF=zDyn-y, cr=zV-yv, c=cr>0?cComp:cReb;
    const a=(-k*xF-c*cr)/m;
    zV+=a*0.001; zDyn+=zV*0.001;
    const tvl=sagEq+zDyn;
    if(tvl<0){zDyn=-sagEq;zV=Math.max(0,zV);}
    if(tvl>travel){zDyn=travel-sagEq;zV=Math.min(0,zV);bottomed=true;}
    if(i%5===0) samples.push({t:ts,pct:Math.max(0,Math.min(100,(sagEq+zDyn)/travel*100)),comp:zV>0});
  }

  const tC=$('dvTR'+id);
  tC.width=tC.offsetWidth||420;
  const TW=tC.width, TH=tC.height;
  const tCtx=tC.getContext('2d');
  tCtx.clearRect(0,0,TW,TH);
  const PAD={l:38,r:10,t:8,b:22};
  const tToX=t=>PAD.l+(t/tMax)*(TW-PAD.l-PAD.r);
  const pToY=p=>TH-PAD.b-(p/100)*(TH-PAD.t-PAD.b);

  tCtx.fillStyle='rgba(255,59,48,0.06)';
  tCtx.fillRect(PAD.l,PAD.t,TW-PAD.l-PAD.r,pToY(100)-PAD.t);
  tCtx.strokeStyle='#1c1f26'; tCtx.lineWidth=1;
  for(const p of[25,50,75,100]){
    tCtx.beginPath(); tCtx.moveTo(PAD.l,pToY(p)); tCtx.lineTo(TW-PAD.r,pToY(p)); tCtx.stroke();
  }
  for(let t=0.5;t<tMax;t+=0.5){
    tCtx.beginPath(); tCtx.moveTo(tToX(t),PAD.t); tCtx.lineTo(tToX(t),TH-PAD.b); tCtx.stroke();
  }

  const sagPct=sagEq/travel*100;
  tCtx.strokeStyle='rgba(255,255,255,0.2)'; tCtx.lineWidth=1; tCtx.setLineDash([5,4]);
  tCtx.beginPath(); tCtx.moveTo(PAD.l,pToY(sagPct)); tCtx.lineTo(TW-PAD.r,pToY(sagPct)); tCtx.stroke();
  tCtx.setLineDash([]);

  tCtx.strokeStyle='rgba(255,59,48,0.7)'; tCtx.lineWidth=1.5; tCtx.setLineDash([4,3]);
  tCtx.beginPath(); tCtx.moveTo(PAD.l,pToY(100)); tCtx.lineTo(TW-PAD.r,pToY(100)); tCtx.stroke();
  tCtx.setLineDash([]);

  tCtx.fillStyle='#8b8f99'; tCtx.font='10px ui-monospace,monospace'; tCtx.textAlign='right';
  for(const p of[0,25,50,75,100]) tCtx.fillText(`${p}%`,PAD.l-3,pToY(p)+3);
  tCtx.textAlign='center';
  for(let t=0;t<=tMax;t+=0.5) tCtx.fillText(`${t}s`,tToX(t),TH-5);
  tCtx.textAlign='left';
  tCtx.fillStyle='rgba(255,59,48,0.8)'; tCtx.font='9px monospace';
  tCtx.textAlign='right';
  tCtx.fillText('BOTTOM',TW-PAD.r-2,pToY(100)-4);
  tCtx.fillStyle='rgba(255,255,255,0.4)';
  tCtx.fillText(`sag ${sagPct.toFixed(0)}%`,TW-PAD.r-2,pToY(sagPct)-4);
  tCtx.textAlign='left';

  for(let i=1;i<samples.length;i++){
    const a=samples[i-1],b=samples[i];
    tCtx.beginPath();
    tCtx.strokeStyle=b.comp?'#ff8a00':'#ffe300';
    tCtx.lineWidth=2.5;
    tCtx.moveTo(tToX(a.t),pToY(a.pct));
    tCtx.lineTo(tToX(b.t),pToY(b.pct));
    tCtx.stroke();
  }

  const maxPct=Math.max(...samples.map(s=>s.pct));
  const finalPct=samples[samples.length-1].pct;
  const packOff=finalPct-sagPct;
  const msgs=[];
  if(bottomed) msgs.push('<span style="color:#ff3b30">⚠ BOTTOMING — suspension uses all 100% travel on this bump. Stiffen compression or add preload.</span>');
  else if(maxPct<sagPct+6) msgs.push('<span style="color:#ffe300">Barely uses travel — compression very stiff. Small bumps transfer straight to chassis (harsh).</span>');
  if(packOff>12) msgs.push('<span style="color:#ff8a00">Packing — rebound too slow. Suspension stays compressed; each bump starts deeper than the last.</span>');
  if(packOff<-14) msgs.push('<span style="color:#ffe300">Rebound too fast — wheel kicks above rest position after bump. Traction loss / chatter.</span>');
  if(!msgs.length) msgs.push('<span style="color:#34c759">✓ Balanced — good comp/reb ratio for this bump profile.</span>');
  $('dvSt'+id).innerHTML=msgs.join('<br>');
}

function renderDampingAnalysis(){
  if(!$('dampModal')||$('dampModal').style.display==='none') return;
  const p=params();
  const zF=p.cFcomp/(2*Math.sqrt(BIKE.fK*p.m_front_sprung));
  const zR=p.cRcomp/(2*Math.sqrt(BIKE.rK*p.m_rear_sprung));
  const fnF=(1/(2*Math.PI))*Math.sqrt(BIKE.fK/p.m_front_sprung);
  const fnR=(1/(2*Math.PI))*Math.sqrt(BIKE.rK/p.m_rear_sprung);
  $('dvInfoF').innerHTML=
    `Comp: <b style="color:#ff8a00">${state.fComp} clicks → ${(p.cFcomp/1000).toFixed(2)} kNs/m</b> &nbsp;|&nbsp; `+
    `Reb: <b style="color:#ffe300">${state.fReb} clicks → ${(p.cFreb/1000).toFixed(2)} kNs/m</b> &nbsp;|&nbsp; `+
    `mass ${p.m_front_sprung.toFixed(0)} kg &nbsp; fₙ ${fnF.toFixed(2)} Hz &nbsp; ζ ${zF.toFixed(2)}`;
  $('dvInfoR').innerHTML=
    `Comp: <b style="color:#ff8a00">${state.rComp} clicks → ${(p.cRcomp/1000).toFixed(2)} kNs/m</b> &nbsp;|&nbsp; `+
    `Reb: <b style="color:#ffe300">${state.rReb} clicks → ${(p.cRreb/1000).toFixed(2)} kNs/m</b> &nbsp;|&nbsp; `+
    `mass ${p.m_rear_sprung.toFixed(0)} kg &nbsp; fₙ ${fnR.toFixed(2)} Hz &nbsp; ζ ${zR.toFixed(2)}`;
  drawDampingPanel('F', p.cFcomp, p.cFreb, BIKE.fK, p.m_front_sprung, BIKE.fTravel, '#ffe300');
  drawDampingPanel('R', p.cRcomp, p.cRreb, BIKE.rK, p.m_rear_sprung, BIKE.rTravel, '#ff8a00');
  drawPhaseChart('dvPhF','f');
  drawPhaseChart('dvPhR','r');
}

/* ---------- Suspension Analysis Modal ---------- */
function curveStatsOf(pts,sagFrac,end){
  if(!pts||!pts.length) return null;
  const vals=pts.map(p=>end==='f'?p.f:p.r);
  const peak=Math.max(...vals);
  const thresh=sagFrac+0.07;
  let lastAbove=0;
  pts.forEach(p=>{ if((end==='f'?p.f:p.r)>thresh) lastAbove=p.t; });
  let status,sc;
  if(peak>0.95){status='⚠ Bottoming';sc='#ff3b30';}
  else if(peak<sagFrac+0.10){status='↓ Too stiff';sc='#ffe300';}
  else if(lastAbove>1.9){status='↩ Packing';sc='#ff8a00';}
  else if(peak>0.78){status='↑ Too soft';sc='#ff8a00';}
  else{status='✓ Good';sc='#34c759';}
  return{peak,sag:sagFrac,settling:lastAbove,status,sc};
}

function renderStatsRows(){
  for(const end of['f','r']){
    const el=$(end==='f'?'statsF':'statsR'); if(!el) continue;
    const curA=buildRefData();
    const sA=curveStatsOf(curA.pts,end==='f'?curA.sagF:curA.sagR,end);
    const ideal=buildIdealData();
    const sI=curveStatsOf(ideal.pts,end==='f'?ideal.sagF:ideal.sagR,end);
    const rows=[{label:'Sim A',color:end==='f'?'#ffe300':'#ff8a00',stats:sA}];
    if(compareMode){
      const b2=buildBumpData({...state2,speed:state.speed,bumpH:state.bumpH,bumpL:state.bumpL},staticSag2);
      rows.push({label:'Sim B',color:'#4fc3f7',stats:curveStatsOf(b2.pts,end==='f'?b2.sagF:b2.sagR,end)});
    }
    rows.push({label:'Ideal ◎',color:'#34c759',stats:sI});
    snapshots.forEach((s,i)=>rows.push({label:`Snap ${i+1}`,color:s.color,stats:curveStatsOf(s.pts,end==='f'?s.sagF:s.sagR,end)}));
    const th=(t,a='center')=>`<th style="padding:4px 8px;font-size:9px;text-transform:uppercase;letter-spacing:.5px;color:var(--dim);font-weight:700;text-align:${a};border-bottom:1px solid var(--line);">${t}</th>`;
    let html=`<table style="width:100%;border-collapse:collapse;background:var(--panel2);border:1px solid var(--line);border-radius:4px;overflow:hidden;">
      <thead><tr>${th('Curve','left')}${th('Sag')}${th('Peak travel')}${th('Settle time')}${th('Status','left')}</tr></thead><tbody>`;
    rows.forEach(r=>{
      const s=r.stats;
      const pkC=s.peak>0.75?'#ff8a00':s.peak>0.60?'#ffe300':'var(--text)';
      html+=`<tr style="border-top:1px solid #1a1c22;">
        <td style="padding:4px 8px;color:${r.color};font-weight:700;font-size:11px;">${r.label}</td>
        <td style="padding:4px 8px;text-align:center;color:var(--dim);font-family:monospace;font-size:11px;">${(s.sag*100).toFixed(0)}%</td>
        <td style="padding:4px 8px;text-align:center;font-weight:700;font-family:monospace;font-size:12px;color:${pkC};">${(s.peak*100).toFixed(0)}%</td>
        <td style="padding:4px 8px;text-align:center;color:var(--dim);font-family:monospace;font-size:11px;">${s.settling.toFixed(2)}s</td>
        <td style="padding:4px 8px;color:${s.sc};font-size:11px;">${s.status}</td>
      </tr>`;
    });
    html+='</tbody></table>';
    el.innerHTML=html;
  }
}

function makeSnapLabel(){
  const load=state.rider+state.pillion+state.luggage;
  return `F C${state.fComp}/R${state.fReb} · R C${state.rComp}/R${state.rReb} · ${load}kg`;
}

function renderSnapBar(){
  const bar=$('snapBar'); if(!bar) return;
  bar.innerHTML='';
  const btn=document.createElement('button');
  btn.textContent='💾 Save current settings';
  btn.style.cssText='padding:5px 12px;border-radius:4px;cursor:pointer;font-size:12px;background:var(--panel2);color:var(--text);border:1px solid var(--line);white-space:nowrap;';
  btn.addEventListener('click',addSnapshot);
  bar.appendChild(btn);
  snapshots.forEach(s=>{
    const chip=document.createElement('span');
    chip.style.cssText=`display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:20px;font-size:11px;background:${s.color}22;border:1px solid ${s.color};color:${s.color};font-family:ui-monospace,monospace;white-space:nowrap;`;
    chip.innerHTML=`<span>${s.label}</span>`;
    const x=document.createElement('button');
    x.textContent='✕'; x.style.cssText=`background:none;border:none;color:${s.color};cursor:pointer;padding:0 0 0 2px;font-size:13px;line-height:1;`;
    x.addEventListener('click',()=>removeSnapshot(s.id));
    chip.appendChild(x); bar.appendChild(chip);
  });
}

function drawBigChart(cvId, end){
  const cv=$(cvId); if(!cv) return;
  const cx=cv.getContext('2d');
  const dpr=window.devicePixelRatio||1;
  if(!cv.dataset.cssH) cv.dataset.cssH=cv.getAttribute('height')||'360';
  const h=parseInt(cv.dataset.cssH);
  const w=Math.max(100,cv.offsetWidth);
  cv.style.width='100%'; cv.style.height=h+'px';
  const bw=Math.round(w*dpr), bh=Math.round(h*dpr);
  if(cv.width!==bw||cv.height!==bh){ cv.width=bw; cv.height=bh; }
  cx.setTransform(dpr,0,0,dpr,0,0);
  cx.clearRect(0,0,w,h); cx.fillStyle='#0a0b0e'; cx.fillRect(0,0,w,h);

  const PAD={l:42,r:12,t:36,b:26};
  const iW=w-PAD.l-PAD.r, iH=h-PAD.t-PAD.b;
  const tMax=2.5;
  const xOf=t=>PAD.l+(t/tMax)*iW;
  const yOf=f=>PAD.t+(1-Math.max(0,Math.min(1,f)))*iH;

  const D1=xOf(0.30), D2=xOf(0.90);
  cx.fillStyle='rgba(255,138,0,0.04)'; cx.fillRect(PAD.l,PAD.t,D1-PAD.l,iH);
  cx.fillStyle='rgba(255,227,0,0.025)'; cx.fillRect(D1,PAD.t,D2-D1,iH);
  cx.fillStyle='rgba(52,199,89,0.025)'; cx.fillRect(D2,PAD.t,w-PAD.r-D2,iH);

  cx.fillStyle='rgba(52,199,89,0.07)';
  cx.fillRect(PAD.l,yOf(0.70),iW,yOf(0.20)-yOf(0.70));

  for(const p of[0,.1,.2,.3,.4,.5,.6,.7,.8,.9,1]){
    const major=[0,.25,.5,.75,1].includes(p);
    cx.strokeStyle=major?'#252830':'#1c1e25'; cx.lineWidth=1;
    cx.beginPath(); cx.moveTo(PAD.l,yOf(p)); cx.lineTo(w-PAD.r,yOf(p)); cx.stroke();
  }
  cx.strokeStyle='#1c1f26'; cx.lineWidth=1;
  for(let t=0.5;t<tMax;t+=0.5){
    cx.beginPath(); cx.moveTo(xOf(t),PAD.t); cx.lineTo(xOf(t),h-PAD.b); cx.stroke();
  }

  cx.strokeStyle='rgba(255,255,255,0.1)'; cx.lineWidth=1; cx.setLineDash([3,5]);
  cx.beginPath(); cx.moveTo(D1,PAD.t); cx.lineTo(D1,h-PAD.b); cx.stroke();
  cx.beginPath(); cx.moveTo(D2,PAD.t); cx.lineTo(D2,h-PAD.b); cx.stroke();
  cx.setLineDash([]);

  cx.font='bold 9px -apple-system,sans-serif'; cx.textAlign='center';
  cx.fillStyle='rgba(255,138,0,0.55)'; cx.fillText('COMPRESS',(PAD.l+D1)/2,PAD.t-12);
  cx.fillStyle='rgba(255,227,0,0.55)'; cx.fillText('REBOUND',(D1+D2)/2,PAD.t-12);
  cx.fillStyle='rgba(52,199,89,0.55)'; cx.fillText('SETTLED',(D2+w-PAD.r)/2,PAD.t-12);

  cx.strokeStyle='rgba(255,59,48,0.5)'; cx.lineWidth=1.5; cx.setLineDash([4,4]);
  cx.beginPath(); cx.moveTo(PAD.l,yOf(1)); cx.lineTo(w-PAD.r,yOf(1)); cx.stroke();
  cx.setLineDash([]);
  cx.fillStyle='rgba(255,59,48,0.5)'; cx.font='bold 9px -apple-system,sans-serif'; cx.textAlign='left';
  cx.fillText('BOTTOMING',PAD.l+4,yOf(1)+11);

  cx.fillStyle='rgba(52,199,89,0.35)'; cx.font='9px ui-monospace,monospace'; cx.textAlign='right';
  cx.fillText('good 20–70%',w-PAD.r-4,yOf(0.44));

  cx.fillStyle='#484c57'; cx.font='10px ui-monospace,monospace'; cx.textAlign='right';
  for(const [p,l] of[[1,'100%'],[.75,'75%'],[.5,'50%'],[.25,'25%'],[0,'0%']])
    cx.fillText(l,PAD.l-5,yOf(p)+3);

  cx.textAlign='center'; cx.fillStyle='#484c57';
  for(let t=0;t<=2.5;t+=0.5) cx.fillText(`${t}s`,xOf(t),h-6);

  function drawCurve(pts,color,lw,dash){
    if(!pts||!pts.length) return;
    cx.strokeStyle=color; cx.lineWidth=lw; cx.setLineDash(dash||[]);
    cx.beginPath();
    pts.forEach((p,i)=>{ const v=end==='f'?p.f:p.r; i===0?cx.moveTo(xOf(p.t),yOf(v)):cx.lineTo(xOf(p.t),yOf(v)); });
    cx.stroke(); cx.setLineDash([]);
  }
  function peakOf(pts){
    if(!pts||!pts.length) return null;
    return pts.reduce((a,b)=>(end==='f'?b.f:b.r)>(end==='f'?a.f:a.r)?b:a);
  }
  function drawPeakDot(pk,color){
    if(!pk) return;
    const pv=end==='f'?pk.f:pk.r;
    cx.fillStyle=color; cx.strokeStyle='#0a0b0e'; cx.lineWidth=1.5;
    cx.beginPath(); cx.arc(xOf(pk.t),yOf(pv),5,0,Math.PI*2); cx.fill(); cx.stroke();
  }
  function drawSagLine(sagFrac,color){
    cx.strokeStyle=color; cx.lineWidth=1; cx.setLineDash([5,4]);
    cx.beginPath(); cx.moveTo(PAD.l,yOf(sagFrac)); cx.lineTo(w-PAD.r,yOf(sagFrac)); cx.stroke();
    cx.setLineDash([]);
  }
  function drawLiveHistory(hist,color){
    if(!hist||hist.length<2) return;
    const tEnd=hist[hist.length-1].t;
    const tStart=Math.max(0,tEnd-tMax);
    cx.strokeStyle=color; cx.lineWidth=1.5;
    cx.beginPath(); let first=true;
    for(const p of hist){
      if(p.t<tStart) continue;
      const v=end==='f'?p.f:p.r;
      const sx=PAD.l+((p.t-tStart)/(tEnd-tStart||1))*iW;
      first?cx.moveTo(sx,yOf(v)):cx.lineTo(sx,yOf(v)); first=false;
    }
    cx.stroke();
  }

  // Draw back → front
  snapshots.forEach(s=>{
    drawSagLine(end==='f'?s.sagF:s.sagR, s.color+'30');
    drawCurve(s.pts,s.color+'80',1.5,[5,3]);
    drawPeakDot(peakOf(s.pts),s.color+'90');
  });

  const ideal=buildIdealData();
  const idealSag=end==='f'?ideal.sagF:ideal.sagR;
  drawSagLine(idealSag,'rgba(52,199,89,0.18)');
  drawCurve(ideal.pts,'rgba(52,199,89,0.8)',2,[8,3,2,3]);
  drawPeakDot(peakOf(ideal.pts),'rgba(52,199,89,0.95)');

  let curB=null;
  if(compareMode){
    curB=buildBumpData({...state2,speed:state.speed,bumpH:state.bumpH,bumpL:state.bumpL},staticSag2);
    const sagB=end==='f'?curB.sagF:curB.sagR;
    drawSagLine(sagB,'rgba(79,195,247,0.2)');
    drawCurve(curB.pts,'#4fc3f7',2.5,[7,4]);
    drawPeakDot(peakOf(curB.pts),'#4fc3f7');
  }

  const curA=buildRefData();
  const sagA=end==='f'?curA.sagF:curA.sagR;
  const colorA=end==='f'?'#ffe300':'#ff8a00';
  drawSagLine(sagA,end==='f'?'rgba(255,227,0,0.22)':'rgba(255,138,0,0.22)');
  drawCurve(curA.pts,colorA,3,[]);
  drawPeakDot(peakOf(curA.pts),colorA);

  drawLiveHistory(sim.history, end==='f'?'rgba(255,227,0,0.5)':'rgba(255,138,0,0.5)');
  if(compareMode) drawLiveHistory(sim2.history,'rgba(79,195,247,0.45)');

  // Canvas legend box
  const lgItems=[];
  {
    const pk=peakOf(curA.pts), pv=pk?end==='f'?pk.f:pk.r:0;
    lgItems.push({color:colorA,dash:[],lw:3,name:'Sim A',peak:pv,sag:sagA});
  }
  if(compareMode&&curB){
    const sagB2=end==='f'?curB.sagF:curB.sagR;
    const pk=peakOf(curB.pts), pv=pk?end==='f'?pk.f:pk.r:0;
    lgItems.push({color:'#4fc3f7',dash:[7,4],lw:2.5,name:'Sim B',peak:pv,sag:sagB2});
  }
  {
    const pk=peakOf(ideal.pts), pv=pk?end==='f'?pk.f:pk.r:0;
    lgItems.push({color:'rgba(52,199,89,0.9)',dash:[8,3,2,3],lw:2,name:'Ideal',peak:pv,sag:idealSag});
  }
  snapshots.forEach((s,i)=>{
    const ssag=end==='f'?s.sagF:s.sagR;
    const pk=peakOf(s.pts), pv=pk?end==='f'?pk.f:pk.r:0;
    lgItems.push({color:s.color,dash:[5,3],lw:1.5,name:`Snap ${i+1}`,peak:pv,sag:ssag});
  });

  const LH=17, LP=8, SW=22, LW=178;
  const LHtot=lgItems.length*LH+LP*2;
  const lx=w-PAD.r-LW, ly=PAD.t+4;
  cx.fillStyle='rgba(8,9,12,0.9)'; cx.strokeStyle='#30343e'; cx.lineWidth=1;
  cx.beginPath();
  if(cx.roundRect) cx.roundRect(lx,ly,LW,LHtot,5); else cx.rect(lx,ly,LW,LHtot);
  cx.fill(); cx.stroke();

  lgItems.forEach((item,i)=>{
    const iy=ly+LP+i*LH+LH/2;
    const ix=lx+LP;
    cx.strokeStyle=item.color; cx.lineWidth=item.lw; cx.setLineDash(item.dash);
    cx.beginPath(); cx.moveTo(ix,iy); cx.lineTo(ix+SW,iy); cx.stroke(); cx.setLineDash([]);
    cx.fillStyle=item.color; cx.font='bold 10px -apple-system,sans-serif'; cx.textAlign='left';
    cx.fillText(item.name,ix+SW+5,iy+3);
    cx.fillStyle='#666a75'; cx.font='10px ui-monospace,monospace'; cx.textAlign='right';
    cx.fillText(`pk ${(item.peak*100).toFixed(0)}%  sg ${(item.sag*100).toFixed(0)}%`,lx+LW-LP,iy+3);
  });
}

function renderIdealPanel(){
  const el=$('idealPanel'); if(!el) return;
  const s=idealSettings();
  const p=params();
  const zetaBar=(z,target)=>{
    const pct=Math.min(100,z/0.8*100);
    const tPct=target/0.8*100;
    const col=Math.abs(z-target)<0.08?'#34c759':z<target-0.1?'#ffe300':'#ff3b30';
    return `<div style="position:relative;height:6px;background:#1c1f26;border-radius:3px;margin:2px 0 4px;">
      <div style="position:absolute;left:0;top:0;height:100%;width:${pct.toFixed(0)}%;background:${col};border-radius:3px;transition:width .2s;"></div>
      <div style="position:absolute;top:-1px;left:${tPct.toFixed(0)}%;width:2px;height:8px;background:rgba(52,199,89,0.8);border-radius:1px;"></div>
    </div>`;
  };
  const diff=(cur,rec)=>{
    const d=cur-rec; if(Math.abs(d)<=1) return `<span style="color:#34c759">✓ good</span>`;
    return d>0?`<span style="color:#ffe300">↓ ${d} click${Math.abs(d)>1?'s':''} softer</span>`
               :`<span style="color:#ff8a00">↑ ${Math.abs(d)} click${Math.abs(d)>1?'s':''} harder</span>`;
  };
  el.innerHTML=`
    <div style="font-size:9px;text-transform:uppercase;letter-spacing:.6px;color:rgba(52,199,89,0.8);font-weight:700;margin-bottom:3px;">◎ Ideal · ${state.scenario}</div>
    <div style="font-size:9px;color:var(--dim);margin-bottom:6px;line-height:1.4;">${s.note}</div>
    <div style="font-size:10px;color:var(--dim);line-height:1.6;">
      <b style="color:var(--text)">Front</b><br>
      Comp: <b style="color:#ffe300">${s.fCompC} clicks</b> ${diff(state.fComp,s.fCompC)}<br>
      ${zetaBar(p.cFcomp/(2*Math.sqrt(BIKE.fK*p.m_front_sprung)),s.zetaCompTarget)}
      Reb: <b style="color:#ffe300">${s.fRebC} clicks</b> ${diff(state.fReb,s.fRebC)}<br>
      ${zetaBar(p.cFreb/(2*Math.sqrt(BIKE.fK*p.m_front_sprung)),s.zetaRebTarget)}
      Preload: <b style="color:#ffe300">${s.fPreMm} mm</b><br>
      <b style="color:var(--text)">Rear</b><br>
      Comp: <b style="color:#ff8a00">${s.rCompC} clicks</b> ${diff(state.rComp,s.rCompC)}<br>
      ${zetaBar(p.cRcomp/(2*Math.sqrt(BIKE.rK*p.m_rear_sprung)),s.zetaCompTarget)}
      Reb: <b style="color:#ff8a00">${s.rRebC} clicks</b> ${diff(state.rReb,s.rRebC)}<br>
      ${zetaBar(p.cRreb/(2*Math.sqrt(BIKE.rK*p.m_rear_sprung)),s.zetaRebTarget)}
      Preload: <b style="color:#ff8a00">${s.rPreTurns} turns</b>
    </div>
    <div style="font-size:9px;color:var(--dim);margin-top:6px;line-height:1.5;border-top:1px solid var(--line);padding-top:6px;">
      Bar = ζ now · tick = scenario target<br>
      ζ_comp: ${s.zetaCompTarget.toFixed(2)} · ζ_reb: ${s.zetaRebTarget.toFixed(2)}
    </div>
    <button id="applyIdealBtn" style="margin-top:7px;width:100%;padding:5px;border-radius:4px;cursor:pointer;font-size:11px;background:rgba(52,199,89,0.15);color:#34c759;border:1px solid rgba(52,199,89,0.4);">Apply ideal settings</button>
  `;
  const btn=$('applyIdealBtn');
  if(btn) btn.addEventListener('click',()=>{
    state.fComp=s.fCompC; state.fReb=s.fRebC;
    state.rComp=s.rCompC; state.rReb=s.rRebC;
    state.fPre=s.fPreMm;  state.rPre=s.rPreTurns;
    for(const k of['fComp','fReb','rComp','rReb','fPre','rPre']){
      const [el,vEl,fmt]=inputs[k]; el.value=state[k]; vEl.textContent=fmt(state[k]);
    }
    syncModalSliders();
    recomputeStatics(); draw(); drawRefChart(); renderDampingAnalysis(); renderIdealPanel();
  });
}

function drawBigCharts(){
  const m=$('chartModal'); if(!m||m.style.display==='none') return;
  drawBigChart('bigChartF','f');
  drawBigChart('bigChartR','r');
  renderModalLegend();
  renderStatsRows();
  drawFFTCharts();
  // Live telemetry panels inside modal
  const mgCv=$('modalChartG'); if(mgCv){ const cx=mgCv.getContext('2d'); drawGChart(mgCv,cx); }
  const mpCv=$('modalChartP'); if(mpCv){ const cx=mpCv.getContext('2d'); drawPitchChart(mpCv,cx); }
  drawPhaseChart('modalPhF','f');
  drawPhaseChart('modalPhR','r');
}

function renderModalLegend(){
  const el=$('chartLegend'); if(!el) return;
  const mk=(color,label,dashed,lw=2)=>{
    const lineStyle=dashed
      ?`border-top:${lw}px dashed ${color};opacity:0.85`
      :`border-top:${lw}px solid ${color}`;
    return `<span style="display:inline-flex;align-items:center;gap:5px;white-space:nowrap;">
      <span style="display:inline-block;width:22px;${lineStyle};margin-top:1px;"></span>
      <span style="color:${color};font-size:11px;">${label}</span>
    </span>`;
  };
  let html=mk('#ffe300','Sim A · front',false,3)+' '+mk('#ff8a00','Sim A · rear',false,3);
  if(compareMode) html+=' '+mk('#4fc3f7','Sim B',true,2.5);
  html+=' '+mk('#34c759','Ideal target',true,2);
  if(sim.history.length>=2) html+=' '+mk('rgba(255,227,0,0.65)','A live',true,1.5);
  if(compareMode&&sim2.history.length>=2) html+=' '+mk('rgba(79,195,247,0.65)','B live',true,1.5);
  snapshots.forEach((s,i)=>html+=' '+mk(s.color,`Snap ${i+1}`,true,1.5));
  el.innerHTML=html;
}

function renderSnapLegend(){
  const el=$('snapLegend'); if(!el) return;
  el.innerHTML=snapshots.length
    ? snapshots.map((s,i)=>`<span style="color:${s.color};font-size:10px;">● Snap ${i+1}: ${s.label}</span>`).join('  ')
    : '';
}

/* ---------- G-force rolling chart ---------- */
function drawGChart(cv, cx){
  const {w,h}=fitCanvas(cv);
  cx.clearRect(0,0,w,h);
  cx.fillStyle='#0a0b0e'; cx.fillRect(0,0,w,h);
  const PAD={l:32,r:6,t:5,b:5};
  const iH=h-PAD.t-PAD.b, xW=w-PAD.l-PAD.r;
  const GMAX=6;
  const yOf=gv=>PAD.t+(1-Math.max(0,Math.min(1,gv/GMAX)))*iH;

  // Red harsh zone above 3g
  cx.fillStyle='rgba(255,59,48,0.07)';
  cx.fillRect(PAD.l,yOf(GMAX),xW,yOf(3)-yOf(GMAX));

  // Gridlines
  cx.strokeStyle='#1c1f26'; cx.lineWidth=1;
  for(const gv of[1,2,3,4,5,6]){
    cx.beginPath(); cx.moveTo(PAD.l,yOf(gv)); cx.lineTo(w-PAD.r,yOf(gv)); cx.stroke();
  }
  cx.fillStyle='#5a5e68'; cx.font='9px ui-monospace,monospace'; cx.textAlign='right';
  for(const gv of[0,2,4,6]) cx.fillText(`${gv}g`,PAD.l-3,yOf(gv)+3);
  cx.textAlign='left';

  // 3g warning line
  cx.strokeStyle='rgba(255,59,48,0.5)'; cx.lineWidth=1.5; cx.setLineDash([3,3]);
  cx.beginPath(); cx.moveTo(PAD.l,yOf(3)); cx.lineTo(w-PAD.r,yOf(3)); cx.stroke();
  cx.setLineDash([]);
  cx.fillStyle='rgba(255,59,48,0.55)'; cx.font='8px monospace';
  cx.fillText('3g harsh',PAD.l+2,yOf(3)-3);

  if(sim.history.length<2) return;
  const tEnd=sim.history[sim.history.length-1].t;
  const tStart=Math.max(0,tEnd-5);
  const xOf=t=>PAD.l+(t-tStart)/(tEnd-tStart||1)*xW;

  // Sim A
  cx.strokeStyle='#ff6b35'; cx.lineWidth=2;
  cx.beginPath();
  sim.history.forEach((p,i)=>{
    const sx=xOf(p.t), sy=yOf(p.g||0);
    i===0?cx.moveTo(sx,sy):cx.lineTo(sx,sy);
  });
  cx.stroke();

  // Sim B overlay
  if(typeof compareMode!=='undefined' && compareMode && sim2.history.length>=2){
    cx.strokeStyle='#4fc3f7'; cx.lineWidth=1.5; cx.setLineDash([4,3]);
    cx.beginPath();
    sim2.history.forEach((p,i)=>{
      const sx=xOf(p.t), sy=yOf(p.g||0);
      i===0?cx.moveTo(sx,sy):cx.lineTo(sx,sy);
    });
    cx.stroke(); cx.setLineDash([]);
  }
}

/* ---------- Pitch rolling chart ---------- */
function drawPitchChart(cv, cx){
  const {w,h}=fitCanvas(cv);
  cx.clearRect(0,0,w,h);
  cx.fillStyle='#0a0b0e'; cx.fillRect(0,0,w,h);
  const PAD={l:32,r:6,t:5,b:5};
  const iH=h-PAD.t-PAD.b, xW=w-PAD.l-PAD.r;
  const PMAX=10; // ±10°
  const yOf=pv=>PAD.t+iH/2-(pv/PMAX)*iH/2;

  // Zero line
  cx.strokeStyle='#2a2e38'; cx.lineWidth=1;
  cx.beginPath(); cx.moveTo(PAD.l,yOf(0)); cx.lineTo(w-PAD.r,yOf(0)); cx.stroke();

  // ±5° grid
  cx.strokeStyle='#1c1f26';
  for(const pv of[-5,5]){
    cx.beginPath(); cx.moveTo(PAD.l,yOf(pv)); cx.lineTo(w-PAD.r,yOf(pv)); cx.stroke();
  }

  cx.fillStyle='#5a5e68'; cx.font='9px ui-monospace,monospace'; cx.textAlign='right';
  cx.fillText('0°', PAD.l-3,yOf(0)+3);
  cx.fillText('+5°',PAD.l-3,yOf(5)+3);
  cx.fillText('-5°',PAD.l-3,yOf(-5)+3);
  cx.textAlign='left';
  cx.fillStyle='rgba(167,139,250,0.5)'; cx.font='8px monospace';
  cx.fillText('nose↑ +',PAD.l+2,yOf(0)-4);

  if(sim.history.length<2) return;
  const tEnd=sim.history[sim.history.length-1].t;
  const tStart=Math.max(0,tEnd-5);
  const xOf=t=>PAD.l+(t-tStart)/(tEnd-tStart||1)*xW;

  // Sim A
  cx.strokeStyle='#a78bfa'; cx.lineWidth=2;
  cx.beginPath();
  sim.history.forEach((p,i)=>{
    const sx=xOf(p.t), sy=yOf(p.pitch||0);
    i===0?cx.moveTo(sx,sy):cx.lineTo(sx,sy);
  });
  cx.stroke();

  // Sim B overlay
  if(typeof compareMode!=='undefined' && compareMode && sim2.history.length>=2){
    cx.strokeStyle='#4fc3f7'; cx.lineWidth=1.5; cx.setLineDash([4,3]);
    cx.beginPath();
    sim2.history.forEach((p,i)=>{
      const sx=xOf(p.t), sy=yOf(p.pitch||0);
      i===0?cx.moveTo(sx,sy):cx.lineTo(sx,sy);
    });
    cx.stroke(); cx.setLineDash([]);
  }
}

/* ---------- Phase portrait (velocity vs displacement) ---------- */
function drawPhaseChart(cvId, end){
  const pCv=$(cvId); if(!pCv) return;
  const dpr=window.devicePixelRatio||1;
  const PW=pCv.offsetWidth||300, PH=pCv.height;
  pCv.width=Math.round(PW*dpr);
  const pCtx=pCv.getContext('2d');
  pCtx.setTransform(dpr,0,0,dpr,0,0);
  pCtx.clearRect(0,0,PW,PH);
  pCtx.fillStyle='#0a0b0e'; pCtx.fillRect(0,0,PW,PH);

  const travel=end==='f'?BIKE.fTravel:BIKE.rTravel;
  const DMAX=travel*1000;   // mm
  const VMAX=1.5;           // m/s
  const cx0=PW/2, cy0=PH/2;
  const xScale=(PW/2-28)/DMAX, yScale=(PH/2-12)/VMAX;
  const dToX=d=>cx0+d*1000*xScale;
  const vToY=v=>cy0-v*yScale;

  // Grid
  pCtx.strokeStyle='#1c1f26'; pCtx.lineWidth=1;
  const dmm=[50,100,150,200].filter(d=>d<=DMAX);
  dmm.forEach(d=>{
    pCtx.beginPath(); pCtx.moveTo(dToX(d/1000),4); pCtx.lineTo(dToX(d/1000),PH-4); pCtx.stroke();
  });
  for(const v of[-1,-0.5,0.5,1]){
    pCtx.beginPath(); pCtx.moveTo(4,vToY(v)); pCtx.lineTo(PW-4,vToY(v)); pCtx.stroke();
  }

  // Axes
  pCtx.strokeStyle='#3a3e48'; pCtx.lineWidth=1.5;
  pCtx.beginPath(); pCtx.moveTo(cx0,4); pCtx.lineTo(cx0,PH-4); pCtx.stroke();
  pCtx.beginPath(); pCtx.moveTo(4,cy0); pCtx.lineTo(PW-4,cy0); pCtx.stroke();

  // Axis labels
  pCtx.fillStyle='#5a5e68'; pCtx.font='9px ui-monospace,monospace';
  pCtx.textAlign='right'; pCtx.fillText('vel',cx0-3,12);
  pCtx.textAlign='center'; pCtx.fillText('disp (mm)',PW-30,cy0+11);
  pCtx.fillText('compress →',(cx0+PW-4)/2,cy0-5);
  pCtx.fillText('← rebound',(4+cx0)/2,cy0-5);

  if(sim.history.length<3){
    pCtx.fillStyle='#3a3e48'; pCtx.textAlign='center';
    pCtx.fillText('play sim to see trace',PW/2,PH/2+4);
    return;
  }

  const drawTrace=(hist, col, bright)=>{
    if(hist.length<3) return;
    const FADE_N=Math.min(300,hist.length);
    pCtx.strokeStyle=col+'40'; pCtx.lineWidth=1;
    pCtx.beginPath();
    hist.slice(-FADE_N,-1).forEach((p,i)=>{
      const d=(end==='f'?p.f*BIKE.fTravel:p.r*BIKE.rTravel);
      const v=(end==='f'?p.fv||0:p.rv||0);
      i===0?pCtx.moveTo(dToX(d),vToY(v)):pCtx.lineTo(dToX(d),vToY(v));
    });
    pCtx.stroke();
    pCtx.strokeStyle=col; pCtx.lineWidth=1.5;
    if(!bright) { pCtx.setLineDash([3,3]); }
    pCtx.beginPath();
    hist.slice(-60).forEach((p,i)=>{
      const d=(end==='f'?p.f*BIKE.fTravel:p.r*BIKE.rTravel);
      const v=(end==='f'?p.fv||0:p.rv||0);
      i===0?pCtx.moveTo(dToX(d),vToY(v)):pCtx.lineTo(dToX(d),vToY(v));
    });
    pCtx.stroke(); pCtx.setLineDash([]);
    const last=hist[hist.length-1];
    const ld=end==='f'?last.f*BIKE.fTravel:last.r*BIKE.rTravel;
    const lv=end==='f'?last.fv||0:last.rv||0;
    pCtx.fillStyle=col; pCtx.beginPath();
    pCtx.arc(dToX(ld),vToY(lv),4,0,Math.PI*2); pCtx.fill();
  };

  const color=end==='f'?'#ffe300':'#ff8a00';
  drawTrace(sim.history, color, true);
  if(typeof compareMode!=='undefined' && compareMode && sim2.history.length>=3)
    drawTrace(sim2.history,'#4fc3f7', false);
}

/* ---------- FFT spectrum chart (called from analysis modal) ---------- */
function drawFFTChart(cvId, end){
  const fCv=$(cvId); if(!fCv) return;
  const dpr=window.devicePixelRatio||1;
  const FW=Math.max(100,fCv.offsetWidth), FH=fCv.height;
  fCv.width=Math.round(FW*dpr); fCv.style.width='100%'; fCv.style.height=FH+'px';
  const fCtx=fCv.getContext('2d');
  fCtx.setTransform(dpr,0,0,dpr,0,0);
  fCtx.clearRect(0,0,FW,FH); fCtx.fillStyle='#0a0b0e'; fCtx.fillRect(0,0,FW,FH);

  const spectrum=computeSpectrum(sim.history,end);
  if(!spectrum.length){
    fCtx.fillStyle='#3a3e48'; fCtx.font='10px monospace'; fCtx.textAlign='center';
    fCtx.fillText('run sim to see spectrum',FW/2,FH/2);
    return;
  }

  const PAD={l:36,r:8,t:16,b:22};
  const iW=FW-PAD.l-PAD.r, iH=FH-PAD.t-PAD.b;
  const FMAX=10, AMAX=Math.max(...spectrum.map(s=>s.amp))*1.15||0.1;
  const xOf=f=>PAD.l+(f/FMAX)*iW;
  const yOf=a=>PAD.t+(1-a/AMAX)*iH;

  // Grid
  fCtx.strokeStyle='#1c1f26'; fCtx.lineWidth=1;
  for(let f=1;f<=10;f++){
    fCtx.beginPath(); fCtx.moveTo(xOf(f),PAD.t); fCtx.lineTo(xOf(f),FH-PAD.b); fCtx.stroke();
  }

  const p=params();
  const fnF=(1/(2*Math.PI))*Math.sqrt(BIKE.fK/p.m_front_sprung);
  const fnR=(1/(2*Math.PI))*Math.sqrt(BIKE.rK/p.m_rear_sprung);
  const fn=end==='f'?fnF:fnR;
  // Natural frequency marker
  fCtx.strokeStyle='rgba(52,199,89,0.5)'; fCtx.lineWidth=1.5; fCtx.setLineDash([4,3]);
  fCtx.beginPath(); fCtx.moveTo(xOf(fn),PAD.t); fCtx.lineTo(xOf(fn),FH-PAD.b); fCtx.stroke();
  fCtx.setLineDash([]);
  fCtx.fillStyle='rgba(52,199,89,0.8)'; fCtx.font='8px monospace'; fCtx.textAlign='center';
  fCtx.fillText(`fₙ${fn.toFixed(1)}Hz`,xOf(fn),PAD.t-3);

  // Axis labels
  fCtx.fillStyle='#5a5e68'; fCtx.font='9px ui-monospace,monospace'; fCtx.textAlign='center';
  for(let f=0;f<=10;f+=2) fCtx.fillText(`${f}`,xOf(f),FH-5);
  fCtx.textAlign='right'; fCtx.fillText('amp',PAD.l-3,PAD.t+4);
  fCtx.textAlign='center'; fCtx.fillText('Hz',FW/2,FH-3);

  // Bars
  const color=end==='f'?'#ffe300':'#ff8a00';
  const barW=Math.max(1,(iW/spectrum.length)*0.8);
  spectrum.forEach(pt=>{
    const isHighFreq=pt.freq>5;
    fCtx.fillStyle=isHighFreq?'rgba(255,59,48,0.7)':color;
    const bx=xOf(pt.freq)-barW/2, bh=(pt.amp/AMAX)*iH;
    fCtx.fillRect(bx,PAD.t+iH-bh,barW,bh);
  });
}

/* Update FFT charts inside analysis modal */
function drawFFTCharts(){
  const m=$('chartModal'); if(!m||m.style.display==='none') return;
  drawFFTChart('fftChartF','f');
  drawFFTChart('fftChartR','r');
}
