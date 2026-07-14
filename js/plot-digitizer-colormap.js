(function () {
  "use strict";

  const MODES = new Set(["cm-x1", "cm-x2", "cm-y1", "cm-y2", "cm-plot", "cm-bar", "cm-c1", "cm-c2", "cm-pick-nan", "cm-run"]);
  const labels = { "cm-x1": "X₁", "cm-x2": "X₂", "cm-y1": "Y₁", "cm-y2": "Y₂", "cm-plot": "data region", "cm-bar": "colorbar", "cm-c1": "C₁ colorbar reference", "cm-c2": "C₂ colorbar reference", "cm-pick-nan": "NaN color" };
  let hooks;
  const $ = (id) => document.getElementById(id);
  const els = {};

  function state() { return hooks.getState(); }
  function initState() {
    const s = state();
    if (!s.colormap) s.colormap = { cal: { x1: null, x2: null, y1: null, y2: null }, colorCal: { c1: null, c2: null }, plot: null, bar: null, drag: null, result: null, nanColors: [] };
    return s.colormap;
  }
  function rect(a, b) { return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) }; }
  function validRect(r) { return r && r.w >= 3 && r.h >= 3; }
  function val(id) { const e = els[id]; const n = e ? Number(e.value) : NaN; return e && e.value !== "" && Number.isFinite(n) ? n : NaN; }
  function rgbToLab(r, g, b) {
    // OKLab: perceptually much more stable than Euclidean RGB for color matching.
    const f = (v) => { v /= 255; return v <= .04045 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); };
    const R = f(r), G = f(g), B = f(b);
    const l = Math.cbrt(.4122214708 * R + .5363325363 * G + .0514459929 * B);
    const m = Math.cbrt(.2119034982 * R + .6806995451 * G + .1073969566 * B);
    const s = Math.cbrt(.0883024619 * R + .2817188376 * G + .6299787005 * B);
    return [.2104542553*l + .793617785*m - .0040720468*s, 1.9779984951*l - 2.428592205*m + .4505937099*s, .0259040371*l + .7827717662*m - .808675766*s];
  }
  function d2(a, b) { const x=a[0]-b[0], y=a[1]-b[1], z=a[2]-b[2]; return x*x+y*y+z*z; }
  function displayData() {
    let c = state().image;
    const d = window.DigitizerImageEdit?.getDisplayCanvas?.(); if (d) c = d;
    return c && c.getContext("2d").getImageData(0, 0, c.width, c.height);
  }
  function profile(image, r) {
    const horizontal = r.w >= r.h, length = Math.max(2, Math.floor(horizontal ? r.w : r.h));
    const thick = Math.max(1, Math.floor((horizontal ? r.h : r.w) * .5));
    const lut = [];
    for (let k=0;k<length;k++) {
      const colors=[];
      for (let q=-thick;q<=thick;q++) {
        const x = Math.max(0, Math.min(image.width-1, Math.floor(horizontal ? r.x+k : r.x+r.w/2+q)));
        const y = Math.max(0, Math.min(image.height-1, Math.floor(horizontal ? r.y+r.h/2+q : r.y+k)));
        const i=(y*image.width+x)*4; if (image.data[i+3] > 20) colors.push([image.data[i],image.data[i+1],image.data[i+2]]);
      }
      if (!colors.length) continue;
      colors.sort((a,b)=>a[0]-b[0]); const R=colors[Math.floor(colors.length/2)][0];
      colors.sort((a,b)=>a[1]-b[1]); const G=colors[Math.floor(colors.length/2)][1];
      colors.sort((a,b)=>a[2]-b[2]); const B=colors[Math.floor(colors.length/2)][2];
      lut.push({ t:k/(length-1), lab:rgbToLab(R,G,B), rgb:[R,G,B] });
    }
    return lut;
  }
  function modalRunLength(lengths) {
    const bins = new Map();
    lengths.filter((n) => n >= 2).forEach((n) => { const k = Math.round(n); bins.set(k, (bins.get(k) || 0) + 1); });
    if (!bins.size) return null;
    const max = Math.max(...bins.values());
    return Math.min(...Array.from(bins.entries()).filter(([, count]) => count >= max * 0.65).map(([size]) => size));
  }
  function estimateCellSize(image, r, horizontal) {
    const lengths = [], lines = 7;
    const main = Math.max(1, Math.floor(horizontal ? r.w : r.h));
    const cross = Math.max(1, Math.floor(horizontal ? r.h : r.w));
    for (let line = 1; line <= lines; line++) {
      const offset = Math.min(cross - 1, Math.round(line * cross / (lines + 1)));
      let previous = null, run = 0;
      for (let step = 0; step < main; step++) {
        const x = Math.max(0, Math.min(image.width - 1, Math.floor(horizontal ? r.x + step : r.x + offset)));
        const y = Math.max(0, Math.min(image.height - 1, Math.floor(horizontal ? r.y + offset : r.y + step)));
        const i = (y * image.width + x) * 4;
        const color = rgbToLab(image.data[i], image.data[i + 1], image.data[i + 2]);
        if (previous && Math.sqrt(d2(color, previous)) > 0.012) { lengths.push(run); run = 1; }
        else run++;
        previous = color;
      }
      lengths.push(run);
    }
    return modalRunLength(lengths);
  }
  function updateOutputReadout() {
    if (!els.outputReadout) return;
    const cm = initState();
    els.outputReadout.textContent = validRect(cm.plot)
      ? `Current grid: ${Math.round(val("nx") || 0)} × ${Math.round(val("ny") || 0)} points.`
      : "Draw the data region to choose an output grid.";
  }
  function setOutputGrid(nx, ny, message) {
    els.nx.value = String(Math.max(1, Math.min(2000, Math.round(nx))));
    els.ny.value = String(Math.max(1, Math.min(2000, Math.round(ny))));
    invalidate(initState());
    els.outputReadout.textContent = message;
    updateReadout();
  }
  function usePixelGrid() {
    const cm = initState();
    if (!validRect(cm.plot)) { hooks.flashStatus("Draw the data region first."); return; }
    setOutputGrid(cm.plot.w, cm.plot.h, `Using the data-region pixel grid: ${Math.round(cm.plot.w)} × ${Math.round(cm.plot.h)} points.`);
  }
  function autoGrid() {
    const cm = initState();
    if (!validRect(cm.plot)) { hooks.flashStatus("Draw the data region first."); return; }
    const image = displayData();
    const cellX = estimateCellSize(image, cm.plot, true);
    const cellY = estimateCellSize(image, cm.plot, false);
    const nx = cellX ? cm.plot.w / cellX : cm.plot.w;
    const ny = cellY ? cm.plot.h / cellY : cm.plot.h;
    const method = cellX || cellY ? "Detected rendered raster-cell spacing." : "No repeated raster-cell spacing was detected; using data-region pixels.";
    setOutputGrid(nx, ny, `${method} Suggested grid: ${Math.round(nx)} × ${Math.round(ny)} points.`);
  }
  function interp(a,b,t,log) { return log ? Math.exp(Math.log(a)+t*(Math.log(b)-Math.log(a))) : a+t*(b-a); }
  function colorbarT(p, bar) { return bar.w >= bar.h ? (p.x - bar.x) / bar.w : (p.y - bar.y) / bar.h; }
  function colorbarAnchor(cm) {
    const c1 = cm.colorCal.c1, c2 = cm.colorCal.c2, v1 = val("c1"), v2 = val("c2");
    if (c1 && c2 && Number.isFinite(v1) && Number.isFinite(v2)) {
      return { t1: colorbarT(c1, cm.bar), t2: colorbarT(c2, cm.bar), v1, v2, custom: true };
    }
    const vStart = val("i1"), vEnd = val("i2");
    return Number.isFinite(vStart) && Number.isFinite(vEnd) ? { t1: 0, t2: 1, v1: vStart, v2: vEnd, custom: false } : null;
  }
  function intensityAt(t, anchor, log) { return interp(anchor.v1, anchor.v2, (t - anchor.t1) / (anchor.t2 - anchor.t1), log); }
  function intensityT(value, anchor, log) { const f = log ? (Math.log(value) - Math.log(anchor.v1)) / (Math.log(anchor.v2) - Math.log(anchor.v1)) : (value - anchor.v1) / (anchor.v2 - anchor.v1); return anchor.t1 + f * (anchor.t2 - anchor.t1); }
  function nextMode(cm, current) { const order=["y1","y2","x1","x2"],i=order.indexOf(current);for(let n=1;n<order.length;n++){const k=order[(i+n)%order.length];if(!cm.cal[k])return `cm-${k}`;}return "cm-plot"; }
  function dataXY(p, cm) {
    const x1=val("x1"),x2=val("x2"),y1=val("y1"),y2=val("y2"),c=cm.cal;
    if(!els.transformed.checked) return { x:interp(x1,x2,(p.x-c.x1.x)/(c.x2.x-c.x1.x),els.logx.checked), y:interp(y1,y2,(p.y-c.y1.y)/(c.y2.y-c.y1.y),els.logy.checked) };
    const vx={x:c.x2.x-c.x1.x,y:c.x2.y-c.x1.y},vy={x:c.y2.x-c.y1.x,y:c.y2.y-c.y1.y},det=vx.x*vy.y-vx.y*vy.x;
    const dec=(q)=>{const dx=q.x-c.x1.x,dy=q.y-c.x1.y;return {a:(dx*vy.y-dy*vy.x)/det,b:(-dx*vx.y+dy*vx.x)/det};};const d=dec(p),d1=dec(c.y1);
    const x=interp(x1,x2,d.a,els.logx.checked); let y;if(els.logy.checked){const a=Math.log(y1),b=Math.log(y2);y=Math.exp(a-d1.b*(b-a)+d.b*(b-a));}else y=y1-d1.b*(y2-y1)+d.b*(y2-y1);return{x,y};
  }
  function ready(cm) { const a=["x1","x2","y1","y2"]; const anchor=colorbarAnchor(cm); if(![cm.cal.x1,cm.cal.x2,cm.cal.y1,cm.cal.y2].every(Boolean)||!validRect(cm.plot)||!validRect(cm.bar)||!a.every(k=>Number.isFinite(val(k)))||!anchor||anchor.v1===anchor.v2||anchor.t1===anchor.t2)return false; return val("x1")!==val("x2")&&val("y1")!==val("y2")&&(!els.logx.checked||val("x1")>0&&val("x2")>0)&&(!els.logy.checked||val("y1")>0&&val("y2")>0)&&(!els.log.checked||anchor.v1>0&&anchor.v2>0); }
  function invalidate(cm) { cm.dirty = true; }
  function run() {
    const cm=initState(); if (!ready(cm)) { hooks.flashStatus("Set four axis references and values, then draw both rectangles."); return; }
    const image=displayData(); const lut=profile(image,cm.bar); if (lut.length<2) return;
    const nx=Math.max(1,Math.min(2000,Math.round(val("nx")||200))), ny=Math.max(1,Math.min(2000,Math.round(val("ny")||200)));
    const tol=(val("tol")||20)/100, anchor=colorbarAnchor(cm); const log=els.log.checked, discrete=els.discrete.checked;
    const out=new Float64Array(nx*ny); out.fill(NaN); let accepted=0;
    for(let iy=0;iy<ny;iy++) for(let ix=0;ix<nx;ix++) {
      const px=cm.plot.x+(ix+.5)*cm.plot.w/nx, py=cm.plot.y+(iy+.5)*cm.plot.h/ny;
      const x=Math.max(0,Math.min(image.width-1,Math.floor(px))), y=Math.max(0,Math.min(image.height-1,Math.floor(py))), j=(y*image.width+x)*4;
      if(image.data[j+3]<20) continue; const q=rgbToLab(image.data[j],image.data[j+1],image.data[j+2]);
      if(cm.nanColors.some(c=>Math.sqrt(d2(q,c.lab))<=((val("nanTol") || 0) / 100))) continue;
      let best=Infinity, bi=0; for(let k=0;k<lut.length;k++){const z=d2(q,lut[k].lab);if(z<best){best=z;bi=k;}}
      if(Math.sqrt(best)>tol) continue;
      let t=lut[bi].t; if(discrete) { let a=bi,b=bi; while(a>0 && Math.sqrt(d2(lut[a-1].lab,lut[bi].lab))<.015)a--; while(b<lut.length-1 && Math.sqrt(d2(lut[b+1].lab,lut[bi].lab))<.015)b++; t=(lut[a].t+lut[b].t)/2; }
      out[iy*nx+ix]=intensityAt(t,anchor,log); accepted++;
    }
    cm.result={nx,ny,out,accepted,lut,anchor,log}; cm.dirty=false; renderPreview(); updateReadout(); hooks.refreshAll();
  }
  function csv(long) {
    const cm=initState(), r=cm.result; if(!r) return ""; const rows=[];
    if(long) { rows.push("x,y,I"); for(let iy=0;iy<r.ny;iy++)for(let ix=0;ix<r.nx;ix++){const p=dataXY({x:cm.plot.x+(ix+.5)*cm.plot.w/r.nx,y:cm.plot.y+(iy+.5)*cm.plot.h/r.ny},cm);const I=r.out[iy*r.nx+ix];rows.push(`${p.x},${p.y},${Number.isFinite(I)?I:"NaN"}`);} }
    else { const xs=[];for(let ix=0;ix<r.nx;ix++)xs.push(dataXY({x:cm.plot.x+(ix+.5)*cm.plot.w/r.nx,y:cm.plot.y},cm).x);rows.push("y\\x,"+xs.join(","));for(let iy=0;iy<r.ny;iy++){const y=dataXY({x:cm.plot.x,y:cm.plot.y+(iy+.5)*cm.plot.h/r.ny},cm).y;const a=[];for(let ix=0;ix<r.nx;ix++){const I=r.out[iy*r.nx+ix];a.push(Number.isFinite(I)?I:"NaN");}rows.push(y+","+a.join(","));} }
    return rows.join("\n");
  }
  function download(text,name) { const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([text],{type:"text/csv"}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),500); }
  function hex(rgb) { return `#${rgb.map(v=>Math.round(v).toString(16).padStart(2,"0")).join("")}`; }
  function parseHex(s) { const m=/^#?([0-9a-f]{6})$/i.exec((s||"").trim()); return m?[parseInt(m[1].slice(0,2),16),parseInt(m[1].slice(2,4),16),parseInt(m[1].slice(4,6),16)]:null; }
  function renderNanList() { const cm=initState();els.nanList.innerHTML="";cm.nanColors.forEach((c,i)=>{const li=document.createElement("li");li.innerHTML=`<span class="digitizer-edit-color-swatch" style="background:${hex(c.rgb)}"></span><code>${hex(c.rgb)}</code>`;const b=document.createElement("button");b.type="button";b.className="tool-inline-button";b.textContent="remove";b.addEventListener("click",()=>{cm.nanColors.splice(i,1);invalidate(cm);renderNanList();updateReadout();});li.appendChild(b);els.nanList.appendChild(li);}); }
  function addNanColor(rgb) { if(!rgb) return;const cm=initState();if(cm.nanColors.some(c=>hex(c.rgb)===hex(rgb)))return;cm.nanColors.push({rgb,lab:rgbToLab(...rgb)});invalidate(cm);renderNanList();updateReadout(); }
  function formatTick(v) { if (!Number.isFinite(v)) return ""; return Math.abs(v) >= 1e4 || (Math.abs(v) > 0 && Math.abs(v) < 1e-3) ? v.toExponential(2) : Number(v.toPrecision(4)).toString(); }
  function renderPreview() {
    const cm=initState(), r=cm.result;
    els.previewWrap.hidden=!r;
    if (!r) return;
    const plotW=Math.max(360,Math.min(760,r.nx*2)),plotH=Math.max(260,Math.min(560,r.ny*2));
    const left=72,top=28,bottom=56,barGap=32,barW=28,right=76;
    els.preview.width=left+plotW+barGap+barW+right;els.preview.height=top+plotH+bottom;
    const ctx=els.preview.getContext("2d"), grid=document.createElement("canvas");grid.width=r.nx;grid.height=r.ny;
    const image=grid.getContext("2d").createImageData(r.nx,r.ny);
    for(let i=0;i<r.out.length;i++) {const I=r.out[i],j=i*4;if(!Number.isFinite(I)){image.data[j+3]=0;continue;}const t=intensityT(I,r.anchor,r.log);const k=Math.max(0,Math.min(r.lut.length-1,Math.round(t*(r.lut.length-1)))),c=r.lut[k].rgb;image.data[j]=c[0];image.data[j+1]=c[1];image.data[j+2]=c[2];image.data[j+3]=255;}
    grid.getContext("2d").putImageData(image,0,0);
    ctx.fillStyle="#fff";ctx.fillRect(0,0,els.preview.width,els.preview.height);
    ctx.fillStyle="#f3f3f3";ctx.fillRect(left,top,plotW,plotH);
    ctx.imageSmoothingEnabled=false;ctx.drawImage(grid,0,0,r.nx,r.ny,left,top,plotW,plotH);
    ctx.strokeStyle="#222";ctx.lineWidth=1.5;ctx.strokeRect(left,top,plotW,plotH);
    const xA=dataXY({x:cm.plot.x,y:cm.plot.y+cm.plot.h/2},cm).x,xB=dataXY({x:cm.plot.x+cm.plot.w,y:cm.plot.y+cm.plot.h/2},cm).x;
    const yA=dataXY({x:cm.plot.x+cm.plot.w/2,y:cm.plot.y},cm).y,yB=dataXY({x:cm.plot.x+cm.plot.w/2,y:cm.plot.y+cm.plot.h},cm).y;
    ctx.font="12px system-ui, sans-serif";ctx.fillStyle="#222";ctx.textAlign="center";ctx.textBaseline="top";
    for(let n=0;n<=4;n++){const t=n/4,x=left+t*plotW;ctx.beginPath();ctx.moveTo(x,top+plotH);ctx.lineTo(x,top+plotH+5);ctx.stroke();ctx.fillText(formatTick(xA+t*(xB-xA)),x,top+plotH+8);}
    ctx.textAlign="right";ctx.textBaseline="middle";
    for(let n=0;n<=4;n++){const t=n/4,y=top+t*plotH;ctx.beginPath();ctx.moveTo(left-5,y);ctx.lineTo(left,y);ctx.stroke();ctx.fillText(formatTick(yA+t*(yB-yA)),left-9,y);}
    ctx.textAlign="center";ctx.textBaseline="alphabetic";ctx.font="bold 13px system-ui, sans-serif";ctx.fillText("X",left+plotW/2,els.preview.height-12);
    ctx.save();ctx.translate(16,top+plotH/2);ctx.rotate(-Math.PI/2);ctx.fillText("Y",0,0);ctx.restore();
    const bx=left+plotW+barGap;for(let py=0;py<plotH;py++){const k=Math.round(py*Math.max(0,r.lut.length-1)/Math.max(1,plotH-1)),c=r.lut[k].rgb;ctx.fillStyle=`rgb(${c[0]}, ${c[1]}, ${c[2]})`;ctx.fillRect(bx,top+py,barW,1);}ctx.strokeStyle="#222";ctx.strokeRect(bx,top,barW,plotH);
    ctx.font="12px system-ui, sans-serif";ctx.fillStyle="#222";ctx.textAlign="left";ctx.textBaseline="middle";for(let n=0;n<=4;n++){const t=n/4,y=top+t*plotH;const value=intensityAt(t,r.anchor,r.log);ctx.beginPath();ctx.moveTo(bx+barW,y);ctx.lineTo(bx+barW+5,y);ctx.stroke();ctx.fillText(formatTick(value),bx+barW+8,y);}ctx.save();ctx.translate(bx+barW+55,top+plotH/2);ctx.rotate(-Math.PI/2);ctx.font="bold 13px system-ui, sans-serif";ctx.textAlign="center";ctx.fillText("Intensity",0,0);ctx.restore();
  }
  function updateReadout() { const cm=initState(), r=cm.result; if(r){els.readout.textContent=`${r.accepted.toLocaleString()} / ${(r.nx*r.ny).toLocaleString()} cells matched the colorbar; the rest are NaN.`;els.note.textContent=cm.dirty?"Settings changed. The preview is from the previous conversion; press Convert 2D colormap to regenerate it.":"The reconstructed grid is shown below; transparent cells are exported as NaN.";return;} els.readout.textContent=ready(cm)?"Calibration is ready. Press Convert 2D colormap to generate the grid.":"Set four axis references and values, then draw both rectangles.";els.note.textContent="No conversion yet."; }
  function handles(r) { return { nw:{x:r.x,y:r.y},n:{x:r.x+r.w/2,y:r.y},ne:{x:r.x+r.w,y:r.y},e:{x:r.x+r.w,y:r.y+r.h/2},se:{x:r.x+r.w,y:r.y+r.h},s:{x:r.x+r.w/2,y:r.y+r.h},sw:{x:r.x,y:r.y+r.h},w:{x:r.x,y:r.y+r.h/2} }; }
  function handleHit(r,p) { if(!validRect(r)) return null; for(const [key,h] of Object.entries(handles(r))) if(Math.hypot(h.x-p.x,h.y-p.y)<=11) return key; return null; }
  function drawRect(ctx,r,color,label,s){if(!validRect(r))return;ctx.save();ctx.strokeStyle=color;ctx.lineWidth=2*s;ctx.setLineDash([6*s,4*s]);ctx.strokeRect(r.x,r.y,r.w,r.h);ctx.setLineDash([]);ctx.fillStyle=color;ctx.font=`bold ${12*s}px system-ui`;ctx.fillText(label,r.x+4*s,r.y+15*s);for(const h of Object.values(handles(r))){ctx.beginPath();ctx.arc(h.x,h.y,4*s,0,Math.PI*2);ctx.fillStyle="#fff";ctx.fill();ctx.strokeStyle=color;ctx.lineWidth=1.5*s;ctx.stroke();}ctx.restore();}
  function drawCalibrationMarker(ctx,p,color,label,selected,s){ctx.save();if(selected){ctx.strokeStyle="#f1c054";ctx.lineWidth=2.5*s;ctx.beginPath();ctx.arc(p.x,p.y,12*s,0,Math.PI*2);ctx.stroke();}ctx.fillStyle="rgba(255,255,255,.92)";ctx.strokeStyle=color;ctx.lineWidth=2*s;ctx.beginPath();ctx.arc(p.x,p.y,8*s,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.beginPath();ctx.moveTo(p.x-10*s,p.y);ctx.lineTo(p.x+10*s,p.y);ctx.moveTo(p.x,p.y-10*s);ctx.lineTo(p.x,p.y+10*s);ctx.stroke();ctx.font=`bold ${12*s}px system-ui`;ctx.fillStyle=color;ctx.fillText(label,p.x+11*s,p.y-9*s);ctx.restore();}
  function draw(ctx,s){const cm=initState();if(cm.cal.y1&&cm.cal.y2){ctx.save();ctx.strokeStyle="rgba(31,65,99,.65)";ctx.lineWidth=1.5*s;ctx.beginPath();ctx.moveTo(cm.cal.y1.x,cm.cal.y1.y);ctx.lineTo(cm.cal.y2.x,cm.cal.y2.y);ctx.stroke();ctx.restore();}if(cm.cal.x1&&cm.cal.x2){ctx.save();ctx.strokeStyle="rgba(162,93,18,.65)";ctx.lineWidth=1.5*s;ctx.beginPath();ctx.moveTo(cm.cal.x1.x,cm.cal.x1.y);ctx.lineTo(cm.cal.x2.x,cm.cal.x2.y);ctx.stroke();ctx.restore();}if(cm.colorCal.c1&&cm.colorCal.c2){ctx.save();ctx.strokeStyle="rgba(122,61,138,.75)";ctx.lineWidth=1.5*s;ctx.beginPath();ctx.moveTo(cm.colorCal.c1.x,cm.colorCal.c1.y);ctx.lineTo(cm.colorCal.c2.x,cm.colorCal.c2.y);ctx.stroke();ctx.restore();}["y1","y2","x1","x2"].forEach(k=>{const p=cm.cal[k];if(p)drawCalibrationMarker(ctx,p,k[0]==="y"?"#1f4163":"#a25d12",k.toUpperCase(),cm.selectedKey===k,s);});["c1","c2"].forEach(k=>{const p=cm.colorCal[k];if(p)drawCalibrationMarker(ctx,p,"#7a3d8a",k.toUpperCase(),cm.selectedKey===k,s);});drawRect(ctx,cm.plot,"#19a974","data",s);drawRect(ctx,cm.bar,"#d68100","colorbar",s);if(cm.drag)drawRect(ctx,rect(cm.drag.start,cm.drag.current),"#fff","",s);}
  function applyHandle(r,key,p) { let l=r.x,t=r.y,rr=r.x+r.w,b=r.y+r.h; if(key.includes("w")) l=Math.min(p.x,rr-3); if(key.includes("e")) rr=Math.max(p.x,l+3); if(key.includes("n")) t=Math.min(p.y,b-3); if(key.includes("s")) b=Math.max(p.y,t+3); r.x=l;r.y=t;r.w=rr-l;r.h=b-t; }
  function onMouseDown(p){const cm=initState(); for(const name of ["plot","bar"]){const key=handleHit(cm[name],p);if(key){cm.rectDrag={name,key};cm.suppressClick=true;return true;}} for(const [group, refs] of [["cal",cm.cal],["color",cm.colorCal]])for(const [key,q] of Object.entries(refs)){if(q&&Math.hypot(q.x-p.x,q.y-p.y)<=11){cm.selectedKey=key;cm.pointDrag={group,key};cm.suppressClick=true;hooks.redrawCanvas();return true;}}const m=state().mode;if(m==="cm-plot"||m==="cm-bar"){cm.drag={kind:m,start:p,current:p};return true;}return false;}
  function onMouseMove(p){const cm=initState();if(cm.pointDrag){const drag=cm.pointDrag,refs=drag.group==="color"?cm.colorCal:cm.cal;refs[drag.key]={x:p.x,y:p.y};if(drag.group==="cal"&&els.linkOrigin.checked&&(drag.key==="x1"||drag.key==="y1"))cm.cal[drag.key==="x1"?"y1":"x1"]={x:p.x,y:p.y};invalidate(cm);hooks.redrawCanvas();return true;}if(cm.rectDrag){applyHandle(cm[cm.rectDrag.name],cm.rectDrag.key,p);hooks.redrawCanvas();return true;}if(!cm.drag)return false;cm.drag.current=p;hooks.redrawCanvas();return true;}
  function onMouseUp(){const cm=initState();if(cm.pointDrag){cm.pointDrag=null;invalidate(cm);hooks.refreshAll();return true;}if(cm.rectDrag){cm.rectDrag=null;invalidate(cm);updateOutputReadout();hooks.refreshAll();return true;}if(!cm.drag)return false;const d=cm.drag;cm[d.kind==="cm-plot"?"plot":"bar"]=rect(d.start,d.current);cm.drag=null;invalidate(cm);updateOutputReadout();hooks.refreshAll();return true;}
  function onClick(p){const cm=initState();if(cm.suppressClick){cm.suppressClick=false;return true;}const m=state().mode;if(m==="cm-run"){run();return true;}if(m==="cm-pick-nan"){const d=displayData(),x=Math.max(0,Math.min(d.width-1,Math.floor(p.x))),y=Math.max(0,Math.min(d.height-1,Math.floor(p.y))),i=(y*d.width+x)*4;addNanColor([d.data[i],d.data[i+1],d.data[i+2]]);hooks.flashStatus("NaN color added.");return true;}const key={"cm-x1":"x1","cm-x2":"x2","cm-y1":"y1","cm-y2":"y2"}[m],colorKey={"cm-c1":"c1","cm-c2":"c2"}[m];if(colorKey){cm.colorCal[colorKey]=p;cm.selectedKey=colorKey;invalidate(cm);if(colorKey==="c1"&&!cm.colorCal.c2){state().mode="cm-c2";state().modeByTab.colormap="cm-c2";}hooks.refreshAll();return true;}if(key){const was=!!cm.cal[key];cm.cal[key]=p;if(els.linkOrigin.checked&&(key==="x1"||key==="y1"))cm.cal[key==="x1"?"y1":"x1"]={x:p.x,y:p.y};cm.selectedKey=key;invalidate(cm);if(!was){state().mode=nextMode(cm,key);state().modeByTab.colormap=state().mode;}hooks.refreshAll();return true;}return false;}
  function keydown(e) { const cm=initState(); if(state().activeTab!=="colormap" || !cm.selectedKey || e.target.matches("input, textarea")) return; const d={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[e.key]; if(!d) return; const refs=(cm.selectedKey==="c1"||cm.selectedKey==="c2")?cm.colorCal:cm.cal,p=refs[cm.selectedKey]; if(!p) return; const step=e.shiftKey?10:1;p.x+=d[0]*step;p.y+=d[1]*step;if(els.linkOrigin.checked&&(cm.selectedKey==="x1"||cm.selectedKey==="y1")){const other=cm.selectedKey==="x1"?"y1":"x1";cm.cal[other]={x:p.x,y:p.y};}state().cursor={x:p.x,y:p.y};state().pointerInside=true;invalidate(cm);e.preventDefault();hooks.refreshAll(); }
  function drawZoom(ctx,sx,sy,k,marker){const cm=initState();if(validRect(cm.plot)){const nx=Math.max(1,Math.round(val("nx")||1)),ny=Math.max(1,Math.round(val("ny")||1)),dx=cm.plot.w/nx,dy=cm.plot.h/ny,viewW=ctx.canvas.width/k,viewH=ctx.canvas.height/k;ctx.save();ctx.strokeStyle="rgba(255,255,255,.72)";ctx.lineWidth=.75;const xStart=Math.max(0,Math.ceil((sx-cm.plot.x)/dx)),xEnd=Math.min(nx,Math.floor((sx+viewW-cm.plot.x)/dx));for(let i=xStart;i<=xEnd;i++){const x=(cm.plot.x+i*dx-sx)*k;ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,ctx.canvas.height);ctx.stroke();}const yStart=Math.max(0,Math.ceil((sy-cm.plot.y)/dy)),yEnd=Math.min(ny,Math.floor((sy+viewH-cm.plot.y)/dy));for(let i=yStart;i<=yEnd;i++){const y=(cm.plot.y+i*dy-sy)*k;ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(ctx.canvas.width,y);ctx.stroke();}ctx.restore();}["y1","y2","x1","x2"].forEach(key=>{const p=cm.cal[key];if(p)marker(p,key[0]==="y"?"#1f4163":"#a25d12",null,cm.selectedKey===key);});["c1","c2"].forEach(key=>{const p=cm.colorCal[key];if(p)marker(p,"#7a3d8a",null,cm.selectedKey===key);});}
  function dataAtCursor(p) { const cm=initState(); return ready(cm) ? dataXY(p,cm) : null; }
  function selectedText() { const cm=initState(),refs=(cm.selectedKey==="c1"||cm.selectedKey==="c2")?cm.colorCal:cm.cal,p=cm.selectedKey&&refs[cm.selectedKey],labels={x1:"X₁",x2:"X₂",y1:"Y₁",y2:"Y₂",c1:"C₁",c2:"C₂"};return p?`Selected ${labels[cm.selectedKey]} @ (${Math.round(p.x)}, ${Math.round(p.y)}) — use arrow keys`:""; }
  function modeComplete(mode) { const key={"cm-x1":"x1","cm-x2":"x2","cm-y1":"y1","cm-y2":"y2","cm-c1":"c1","cm-c2":"c2"}[mode],cm=initState();return !!(key&&(key[0]==="c"?cm.colorCal[key]:cm.cal[key])); }
  function status(statusEl){if(state().activeTab!=="colormap")return false;const m=state().mode;statusEl.textContent=m==="cm-run"?"Click Convert, or use the Convert button again after changing settings.":labels[m]?`Click${m==="cm-plot"||m==="cm-bar"?" and drag":""} to set the ${labels[m]}.`:"Choose a calibration or rectangle tool.";return true;}
  function annotationsCleared(){els.previewWrap.hidden=true;renderNanList();updateReadout();}
  window.DigitizerColormap = {
    MODES,
    init(h) {
      hooks = h;
      const ids = { x1: "cm-x1-value", x2: "cm-x2-value", y1: "cm-y1-value", y2: "cm-y2-value", i1: "cm-i1-value", i2: "cm-i2-value", c1: "cm-c1-value", c2: "cm-c2-value", nx: "cm-nx", ny: "cm-ny", tol: "cm-tolerance-value", nanTol: "cm-nan-tolerance-value" };
      Object.entries(ids).forEach(([key, id]) => {
        els[key] = document.getElementById(id);
        els[key].addEventListener("input", () => { invalidate(initState()); if (key === "nx" || key === "ny") updateOutputReadout(); updateReadout(); });
      });
      els.log = document.getElementById("cm-log-i");
      els.discrete = document.getElementById("cm-discrete");
      els.logx = document.getElementById("cm-logx");
      els.logy = document.getElementById("cm-logy");
      els.transformed = document.getElementById("cm-transformed");
      els.linkOrigin = document.getElementById("cm-link-origin");
      els.nanColor = document.getElementById("cm-nan-color");
      els.nanHex = document.getElementById("cm-nan-hex");
      els.nanList = document.getElementById("cm-nan-list");
      els.readout = document.getElementById("cm-readout");
      els.note = document.getElementById("cm-data-note");
      els.preview = document.getElementById("cm-preview");
      els.previewWrap = document.getElementById("cm-preview-wrap");
      els.outputReadout = document.getElementById("cm-output-readout");
      [els.log, els.discrete, els.logx, els.logy, els.transformed].forEach((el) => el.addEventListener("change", () => { invalidate(initState()); updateReadout(); }));
      document.getElementById("cm-tolerance").addEventListener("input", (event) => { els.tol.value = event.target.value; invalidate(initState()); updateReadout(); });
      els.tol.addEventListener("input", () => { document.getElementById("cm-tolerance").value = els.tol.value; });
      document.getElementById("cm-nan-tolerance").addEventListener("input", (event) => { els.nanTol.value = event.target.value; invalidate(initState()); updateReadout(); });
      els.nanTol.addEventListener("input", () => { document.getElementById("cm-nan-tolerance").value = els.nanTol.value; });
      els.nanColor.addEventListener("input", () => { els.nanHex.value = els.nanColor.value; });
      els.nanHex.addEventListener("change", () => { const color = parseHex(els.nanHex.value); if (color) { els.nanColor.value = hex(color); els.nanHex.value = hex(color); } });
      document.getElementById("cm-nan-add").addEventListener("click", () => addNanColor(parseHex(els.nanHex.value)));
      document.getElementById("cm-output-auto").addEventListener("click", autoGrid);
      document.getElementById("cm-output-pixels").addEventListener("click", usePixelGrid);
      document.getElementById("cm-swap-y").addEventListener("click", () => { const cm = initState(); [cm.cal.y1, cm.cal.y2] = [cm.cal.y2, cm.cal.y1]; invalidate(cm); hooks.refreshAll(); });
      document.getElementById("cm-swap-x").addEventListener("click", () => { const cm = initState(); [cm.cal.x1, cm.cal.x2] = [cm.cal.x2, cm.cal.x1]; invalidate(cm); hooks.refreshAll(); });
      els.linkOrigin.addEventListener("change", () => { if (!els.linkOrigin.checked) return; const cm = initState(); if (cm.cal.y1) cm.cal.x1 = { ...cm.cal.y1 }; else if (cm.cal.x1) cm.cal.y1 = { ...cm.cal.x1 }; invalidate(cm); hooks.refreshAll(); });
      document.getElementById("cm-copy-long").addEventListener("click", () => navigator.clipboard?.writeText(csv(true)));
      document.getElementById("cm-download-long").addEventListener("click", () => download(csv(true), "digitized-xyi.csv"));
      document.getElementById("cm-download-matrix").addEventListener("click", () => download(csv(false), "digitized-matrix.csv"));
      document.addEventListener("keydown", keydown);
      updateOutputReadout();
    },
    draw, drawZoom, onMouseDown, onMouseMove, onMouseUp, onClick, updateStatus: status, dataAtCursor, selectedText, isModeComplete: modeComplete, run,
    onImageLoaded() { state().colormap = null; initState(); annotationsCleared(); },
    onImageCleared() { state().colormap = null; annotationsCleared(); },
    onAnnotationsCleared: annotationsCleared,
    updateReadout
  };
})();
