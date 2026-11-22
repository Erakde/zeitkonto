/* Zeitkonto – personal working-hours tracker. All data stays on this device (localStorage). */
'use strict';

/* ---------------- constants ---------------- */
const KEY = 'zeitkonto.v1';            // storage key – keep it, or existing data is lost
const APP_VERSION = 2;                   // raise together with CACHE in sw.js
const CHANGELOG = {
  2: ['One-tap break button on the Today screen (length set in Settings, undo-able)',
      'Select several days in the calendar and mark them all at once',
      'Version number, “Check for updates” and an update notice'],
  1: ['First version'],
};
const TYPES = {
  work:          { label: 'Office',        color: '#3b82f6' },
  wfh:           { label: 'Home office',   color: '#14b8a6' },
  vacation:      { label: 'Vacation',      color: '#f59e0b' },
  vacation_half: { label: '½ Vacation',    color: '#eab308' },
  sick:          { label: 'Sick leave',    color: '#ef4444' },
  holiday:       { label: 'Public holiday',color: '#8b5cf6' },
  flex:          { label: 'Overtime off',  color: '#64748b' },
};
const TYPE_HELP = {
  work: 'Normal working day.',
  wfh: 'Normal working day, worked from home.',
  vacation: 'Target 0 h – balance unchanged.',
  vacation_half: 'Target halved.',
  sick: 'Target 0 h – balance unchanged.',
  holiday: 'Target 0 h – any work counts as overtime.',
  flex: 'Day off taken from your balance (target stays).',
};
const STATES = { none:'None (no public holidays)', BW:'Baden-Württemberg', BY:'Bayern', BE:'Berlin', BB:'Brandenburg', HB:'Bremen',
  HH:'Hamburg', HE:'Hessen', MV:'Mecklenburg-Vorpommern', NI:'Niedersachsen', NW:'Nordrhein-Westfalen', RP:'Rheinland-Pfalz',
  SL:'Saarland', SN:'Sachsen', ST:'Sachsen-Anhalt', SH:'Schleswig-Holstein', TH:'Thüringen' };
const DOW = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

/* ---------------- date helpers (local dates as 'YYYY-MM-DD') ---------------- */
const pad = n => String(n).padStart(2, '0');
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const parseD = s => { const [y,m,d] = s.split('-').map(Number); return new Date(y, m-1, d); };
const addDays = (s, n) => { const d = parseD(s); d.setDate(d.getDate()+n); return ymd(d); };
const dow = s => (parseD(s).getDay() + 6) % 7;            // 0 = Monday
const today = () => ymd(new Date());
const nowHM = () => { const d = new Date(); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const mondayOf = s => addDays(s, -dow(s));
function isoWeek(s){ const d = parseD(s); d.setDate(d.getDate() + 3 - (d.getDay()+6)%7);
  const w1 = new Date(d.getFullYear(),0,4); return 1 + Math.round(((d - w1)/864e5 - 3 + (w1.getDay()+6)%7)/7); }
const fmtDay = s => { const d = parseD(s); return `${DOW[dow(s)]} ${d.getDate()} ${MONTHS[d.getMonth()].slice(0,3)}`; };
const fmtDayLong = s => { const d = parseD(s); return `${['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'][dow(s)]}, ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`; };

/* ---------------- duration helpers (minutes) ---------------- */
const hm2min = t => { const [h,m] = t.split(':').map(Number); return h*60 + m; };
function fmtDur(min){ const a = Math.abs(Math.round(min)); return `${Math.floor(a/60)}:${pad(a%60)}`; }
function fmtBal(min){ min = Math.round(min); if (min === 0) return '±0:00'; return (min > 0 ? '+' : '−') + fmtDur(min); }
const balCls = m => Math.round(m) > 0 ? 'pos' : Math.round(m) < 0 ? 'neg' : 'zero';
/* accepts "8", "7.5", "7,5", "7:42", "-3:15", "+1:30" → minutes, or null */
function parseDur(str){
  str = String(str).trim().replace('−','-').replace(',', '.');
  if (!str) return 0;
  const m = str.match(/^([+-])?\s*(\d+)(?::(\d{1,2}))?$|^([+-])?\s*(\d*\.\d+)$/);
  if (!m) return null;
  if (m[2] !== undefined){ const v = (+m[2])*60 + (+(m[3]||0)); if ((+(m[3]||0)) > 59) return null; return m[1]==='-' ? -v : v; }
  const v = Math.round(parseFloat(m[5])*60); return m[4]==='-' ? -v : v;
}
const entryMin = e => { let d = hm2min(e.end) - hm2min(e.start); if (d < 0) d += 1440; return Math.max(0, d - (e.brk||0)); };

/* ---------------- German public holidays ---------------- */
function easter(y){ const a=y%19,b=Math.floor(y/100),c=y%100,d=Math.floor(b/4),e=b%4,f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3),
  h=(19*a+b-d-g+15)%30,i=Math.floor(c/4),k=c%4,l=(32+2*e+2*i-h-k)%7,m=Math.floor((a+11*h+22*l)/451),
  mo=Math.floor((h+l-7*m+114)/31),da=((h+l-7*m+114)%31)+1; return ymd(new Date(y,mo-1,da)); }
const holCache = {};
function holidaysFor(y, st){
  const key = y + st; if (holCache[key]) return holCache[key];
  const H = {}; if (st === 'none'){ return holCache[key] = H; }
  const E = easter(y), add = (d, n, states) => { if (!states || states.includes(st)) H[d] = n; };
  const f = (m,d) => `${y}-${pad(m)}-${pad(d)}`;
  add(f(1,1),'Neujahr');
  add(f(1,6),'Heilige Drei Könige',['BW','BY','ST']);
  if ((st==='BE' && y>=2019) || (st==='MV' && y>=2023)) add(f(3,8),'Internationaler Frauentag');
  add(addDays(E,-2),'Karfreitag');
  add(E,'Ostersonntag',['BB']);
  add(addDays(E,1),'Ostermontag');
  add(f(5,1),'Tag der Arbeit');
  add(addDays(E,39),'Christi Himmelfahrt');
  add(addDays(E,49),'Pfingstsonntag',['BB']);
  add(addDays(E,50),'Pfingstmontag');
  add(addDays(E,60),'Fronleichnam',['BW','BY','HE','NW','RP','SL']);
  add(f(8,15),'Mariä Himmelfahrt',['SL']);
  if (st==='TH' && y>=2019) add(f(9,20),'Weltkindertag');
  add(f(10,3),'Tag der Deutschen Einheit');
  if (['BB','MV','SN','ST','TH'].includes(st) || (['HB','HH','NI','SH'].includes(st) && y>=2018)) add(f(10,31),'Reformationstag');
  add(f(11,1),'Allerheiligen',['BW','BY','NW','RP','SL']);
  if (st==='SN'){ let d = f(11,22); while (dow(d) !== 2) d = addDays(d,-1); add(d,'Buß- und Bettag'); }
  add(f(12,25),'1. Weihnachtstag');
  add(f(12,26),'2. Weihnachtstag');
  return holCache[key] = H;
}
const holidayName = s => holidaysFor(+s.slice(0,4), S.settings.state)[s] || null;

/* ---------------- state & storage ---------------- */
function defaultState(){
  return { v:1,
    settings:{ targets:[480,480,480,480,480,0,0], state:'none', start: today(), opening:0, csv:'de',
               autoBreak:true, setupDone:false, lastBackup:null, breakLen:30, seenVersion:APP_VERSION },
    last:{ start:'09:00', end:'17:30', brk:30, loc:'work' },
    entries:[], days:{}, running:null, pause:null };
}
let S = load();
function load(){
  try {
    const raw = localStorage.getItem(KEY);
    if (raw){ const o = JSON.parse(raw); return normalize(o); }
  } catch (e) { console.warn('load failed', e); }
  return defaultState();
}
function normalize(o){
  const d = defaultState();
  const settings = { ...d.settings, ...(o.settings||{}) };
  if (!o.settings || !('seenVersion' in o.settings)) settings.seenVersion = 1;   // data from version 1
  return { v:1, settings, last:{ ...d.last, ...(o.last||{}) },
    entries: Array.isArray(o.entries) ? o.entries.filter(e => e && e.date && e.start && e.end) : [],
    days: (o.days && typeof o.days === 'object') ? o.days : {}, running: o.running || null,
    pause: o.pause && Array.isArray(o.pause.items) ? o.pause : null };
}
let persistAsked = false;
function save(){
  invalidate();
  try { localStorage.setItem(KEY, JSON.stringify(S)); }
  catch (e) { toast('Could not save – storage unavailable'); }
  if (!persistAsked && navigator.storage && navigator.storage.persist){ persistAsked = true; navigator.storage.persist().catch(()=>{}); }
  render();
}

/* ---------------- calculations ---------------- */
let byDate = null, dayCache = {};
function invalidate(){ byDate = null; dayCache = {}; }
function entriesOn(s){
  if (!byDate){ byDate = {}; for (const e of S.entries) (byDate[e.date] ||= []).push(e);
    for (const k in byDate) byDate[k].sort((a,b) => a.start.localeCompare(b.start)); }
  return byDate[s] || [];
}
function day(s){
  if (dayCache[s]) return dayCache[s];
  const ents = entriesOn(s), rec = S.days[s], hol = holidayName(s);
  const base = S.settings.targets[dow(s)] || 0;
  const type = rec?.type || (hol ? 'holiday' : (ents.length || base ? 'work' : null));
  let target = base;
  if (hol || type === 'holiday' || type === 'vacation' || type === 'sick') target = 0;
  else if (type === 'vacation_half') target = Math.round(base/2);
  const worked = ents.reduce((a,e) => a + entryMin(e), 0);
  const t = today();
  const counted = s >= S.settings.start && (s < t || (s === t && (ents.length > 0 || !!rec?.type)));
  // breaks incl. gaps between blocks, for the legal-break hint (ArbZG §4)
  let brk = ents.reduce((a,e) => a + (e.brk||0), 0);
  for (let i = 1; i < ents.length; i++){ const g = hm2min(ents[i].start) - hm2min(ents[i-1].end); if (g > 0) brk += g; }
  let warn = null;
  if (worked > 540 && brk < 45) warn = 'Over 9 h worked: German law requires ≥ 45 min break.';
  else if (worked > 360 && brk < 30) warn = 'Over 6 h worked: German law requires ≥ 30 min break.';
  if (worked > 600) warn = 'Over 10 h worked in one day (legal maximum).';
  return dayCache[s] = { date:s, ents, rec, hol, base, type, explicit: !!rec?.type, target, worked, counted,
    balance: counted ? worked - target : 0, brk, warn };
}
function agg(from, to){
  const r = { worked:0, target:0, balance:0, days:0 };
  if (to < from) return r;
  for (let s = from; s <= to; s = addDays(s,1)){ const d = day(s); if (!d.counted) continue;
    r.worked += d.worked; r.target += d.target; r.balance += d.balance; r.days++; }
  return r;
}
const accountAt = s => S.settings.opening + agg(S.settings.start, s).balance;
const monthRange = (y, m) => [`${y}-${pad(m+1)}-01`, ymd(new Date(y, m+1, 0))];

/* ---------------- UI plumbing ---------------- */
const $ = (sel, root=document) => root.querySelector(sel);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let tab = (() => { try { return localStorage.getItem(KEY+'.tab') || 'home'; } catch { return 'home'; } })();
const ui = { calY: new Date().getFullYear(), calM: new Date().getMonth(), sumY: new Date().getFullYear(), open: new Set(), sel: null, skipWk: true };
let toastT;
function toast(msg, actLabel, actFn){
  const t = $('#toast'); t.textContent = msg; t.classList.toggle('act', !!actFn);
  if (actFn){ const b = document.createElement('button'); b.textContent = actLabel; b.onclick = () => { t.classList.remove('show'); actFn(); }; t.append(' ', b); }
  t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), actFn ? 6000 : 2400);
}
const typeTag = t => t ? `<span class="tag" style="--c:${TYPES[t].color}"><span class="dot"></span>${TYPES[t].label}</span>` : '';

function setTab(t){ tab = t; try { localStorage.setItem(KEY+'.tab', t); } catch {} render(); $('#view').scrollTop = 0; window.scrollTo(0,0); }
document.querySelectorAll('.tabbar button').forEach(b => b.addEventListener('click', () => setTab(b.dataset.tab)));

function render(){
  document.querySelectorAll('.tabbar button').forEach(b => b.dataset.tab === tab ? b.setAttribute('aria-current','page') : b.removeAttribute('aria-current'));
  const acc = accountAt(today());
  $('#topBalance').innerHTML = `<span class="${balCls(acc)}">${fmtBal(acc)}</span>`;
  const v = $('#view');
  v.innerHTML = tab === 'home' ? viewHome() : tab === 'cal' ? viewCal() : tab === 'sum' ? viewSum() : viewSettings();
  bind[tab]?.(v);
}

/* ---------------- Today view ---------------- */
function viewHome(){
  const t = today(), acc = accountAt(t), d = parseD(t);
  const wk = agg(mondayOf(t), t), [m0] = monthRange(d.getFullYear(), d.getMonth()), mo = agg(m0, t), yr = agg(`${d.getFullYear()}-01-01`, t);
  const td = day(t);
  const recent = []; for (let s = t, i = 0; i < 10; i++, s = addDays(s,-1)){ const x = day(s); if (x.ents.length || x.explicit) recent.push(x); }
  const backupDays = S.settings.lastBackup ? Math.floor((Date.now() - S.settings.lastBackup)/864e5) : null;
  const L = S.last;
  return `
  ${!S.settings.setupDone ? `<div class="card banner"><strong>Welcome!</strong><div class="small mt">First set your weekly target hours, your Bundesland (for public holidays) and the date you start tracking from.</div>
     <button class="btn primary mt" data-go="set">Open settings</button></div>` : ''}
  ${S.entries.length >= 5 && (backupDays === null || backupDays > 30) ? `<div class="card banner small">Your data lives only on this phone. ${backupDays===null?'You have never made a backup.':`Last backup ${backupDays} days ago.`} <button class="linkbtn" data-go="set">Back up now</button></div>` : ''}
  <div class="card hero">
    <div class="label">Time account (overall)</div>
    <div class="big ${balCls(acc)}">${fmtBal(acc)}</div>
    <div class="stats">
      <div class="stat"><div class="k">This week</div><div class="v ${balCls(wk.balance)}">${fmtBal(wk.balance)}</div></div>
      <div class="stat"><div class="k">${MONTHS[d.getMonth()]}</div><div class="v ${balCls(mo.balance)}">${fmtBal(mo.balance)}</div></div>
      <div class="stat"><div class="k">${d.getFullYear()}</div><div class="v ${balCls(yr.balance)}">${fmtBal(yr.balance)}</div></div>
    </div>
    <div class="small muted mt num">This week: ${fmtDur(wk.worked)} worked of ${fmtDur(wk.target)}</div>
  </div>

  <div class="card">
    ${S.running ? `
      <div class="running"><span class="pulse"></span><div class="spacer"><strong>Clocked in</strong><div class="small muted">since ${esc(S.running.start)}${S.running.date!==t?' on '+fmtDay(S.running.date):''}</div></div>
      <button class="btn primary" id="clockOut">Clock out</button></div>
      <button class="linkbtn small" id="clockCancel">Cancel clock-in</button>`
    : `<div class="row"><div class="spacer"><strong>Today</strong> <span class="small muted">${fmtDay(t)}</span>${td.hol?`<div class="small muted">${esc(td.hol)}</div>`:''}</div>
       <button class="btn" id="clockIn">▶ Clock in now</button></div>`}
    ${breakRow()}
  </div>

  <div class="card">
    <h2>Add entry</h2>
    <form id="addForm" autocomplete="off">
      <label class="f">Date<input type="date" name="date" value="${t}" required></label>
      <div class="grid3 mt">
        <label class="f">Start<input type="time" name="start" value="${esc(L.start)}" required></label>
        <label class="f">End<input type="time" name="end" value="${esc(L.end)}" required></label>
        <label class="f">Break (min)<input type="number" name="brk" min="0" max="600" step="5" inputmode="numeric" value="${L.brk}"></label>
      </div>
      <div class="seg mt" role="group" aria-label="Location">
        <button type="button" data-loc="work" aria-pressed="${L.loc!=='wfh'}">🏢 Office</button>
        <button type="button" data-loc="wfh" aria-pressed="${L.loc==='wfh'}">🏠 Home office</button>
      </div>
      <div class="row mt"><span class="small muted num spacer" id="addPreview"></span><button class="btn primary" type="submit">Save</button></div>
    </form>
    <div class="row mt small"><span class="muted spacer">Absent? Mark days as vacation, sick…</span><button class="linkbtn" id="markDay">Mark days</button></div>
  </div>

  <div class="card">
    <h2>Recent days</h2>
    ${recent.length ? `<ul class="list">${recent.map(dayLi).join('')}</ul>` : `<div class="muted small">No entries yet.</div>`}
  </div>`;
}
/* one-tap break: goes to the running clock-in, otherwise to today's latest entry */
function breakTarget(){
  if (S.running) return { kind:'running' };
  const ents = entriesOn(today());
  return ents.length ? { kind:'entry', id: ents[ents.length-1].id } : null;
}
function curBreak(tgt){ return !tgt ? 0 : tgt.kind === 'running' ? (S.running.brk||0) : (S.entries.find(e => e.id === tgt.id)?.brk||0); }
function breakLog(){ return S.pause && S.pause.date === today() ? S.pause.items : []; }
function breakRow(){
  const L = S.settings.breakLen, tgt = breakTarget(), cur = curBreak(tgt), n = breakLog().length;
  return `<button class="btn block mt" id="addBreak" ${tgt ? '' : 'disabled'}>☕ Break ${L} min</button>
    <div class="row small" style="margin-top:6px"><span class="muted spacer">${
      !tgt ? 'Clock in (or add today’s time) to log a break.'
      : cur ? `Break ${tgt.kind==='running' ? 'so far' : 'in today’s last entry'}: <strong>${cur} min</strong>` : 'No break logged yet.'}</span>
      ${n ? `<button class="linkbtn small" id="undoBreak">↶ Undo last break</button>` : ''}</div>`;
}
function addBreak(){
  const tgt = breakTarget(); if (!tgt) return;
  const L = S.settings.breakLen;
  if (tgt.kind === 'running') S.running.brk = (S.running.brk||0) + L;
  else {
    const e = S.entries.find(z => z.id === tgt.id); let span = hm2min(e.end) - hm2min(e.start); if (span < 0) span += 1440;
    if ((e.brk||0) + L >= span){ toast('Break would be longer than the working time'); return; }
    e.brk = (e.brk||0) + L;
  }
  if (!S.pause || S.pause.date !== today()) S.pause = { date: today(), items: [] };
  S.pause.items.push({ kind: tgt.kind, id: tgt.id || null, min: L });
  save(); toast(`☕ ${L} min break logged`, 'Undo', undoBreak);
}
function undoBreak(){
  const it = S.pause?.items.pop(); if (!it) return;
  if (it.kind === 'running'){ if (S.running) S.running.brk = Math.max(0, (S.running.brk||0) - it.min); }
  else { const e = S.entries.find(z => z.id === it.id); if (e) e.brk = Math.max(0, (e.brk||0) - it.min); }
  save(); toast(`Break of ${it.min} min removed`);
}

function dayLi(x){
  const times = x.ents.map(e => `${e.start}–${e.end}`).join(', ');
  return `<li><button class="rowbtn" data-day="${x.date}"><div class="main"><div class="t1">${fmtDay(x.date)} ${typeTag(x.type)}</div>
    <div class="t2 num">${times || (x.hol ? esc(x.hol) : '—')}${x.warn?' · ⚠︎':''}</div></div>
    <div class="right"><div class="num">${fmtDur(x.worked)} / ${fmtDur(x.target)}</div><div class="small ${balCls(x.balance)}">${x.counted?fmtBal(x.balance):'not counted'}</div></div></button></li>`;
}

/* ---------------- Calendar view ---------------- */
function viewCal(){
  const y = ui.calY, m = ui.calM, [a, b] = monthRange(y, m), t = today();
  const first = dow(a), cells = [];
  for (let i = 0; i < first; i++) cells.push(`<div class="cell out"></div>`);
  for (let s = a; s <= b; s = addDays(s,1)){
    const x = day(s), show = x.explicit || x.hol || x.ents.length;
    const c = x.type ? TYPES[x.type].color : 'transparent';
    const sel = ui.sel?.has(s);
    cells.push(`<button class="cell ${show?'typed':''} ${x.base===0?'wkend':''} ${s===t?'today':''} ${sel?'sel':''}" style="--c:${c}" data-day="${s}"
      ${ui.sel ? `aria-pressed="${!!sel}"` : ''} aria-label="${fmtDayLong(s)}${x.type?', '+TYPES[x.type].label:''}${x.counted?', balance '+fmtBal(x.balance):''}">
      <span class="d">${parseD(s).getDate()}</span>${sel?'<span class="mark selmark">✓</span>':x.warn?'<span class="mark warn">⚠︎</span>':''}
      <span class="b ${balCls(x.balance)}">${x.counted && (x.target || x.worked) ? fmtBal(x.balance) : (x.ents.length ? fmtDur(x.worked) : '')}</span></button>`);
  }
  const mo = agg(a, b < t ? b : t);
  const n = ui.sel?.size || 0;
  return `${ui.sel ? `<div class="card selhint small"><strong>Select days:</strong> tap each day, or tap the first and last day and then “Fill range”. You can switch months.</div>` : ''}
  <div class="card">
    <div class="calnav"><button class="iconbtn" id="calPrev" aria-label="Previous month">‹</button>
      <h2>${MONTHS[m]} ${y}</h2><button class="iconbtn" id="calNext" aria-label="Next month">›</button></div>
    <div class="cal">${DOW.map(d => `<div class="dow">${d}</div>`).join('')}${cells.join('')}</div>
    <div class="legend">${Object.entries(TYPES).map(([k,v]) => `<span><i class="dot" style="--c:${v.color}"></i>${v.label}</span>`).join('')}</div>
    ${ui.sel ? '' : `<button class="btn block mt" id="selStart">☑ Select several days</button>`}
  </div>
  ${ui.sel ? `<div class="selbar" role="region" aria-label="Selection">
    <div class="row"><strong class="spacer">${n} day${n===1?'':'s'} selected</strong>
      <button class="linkbtn small" id="selRange" ${n>=2?'':'disabled'}>Fill range</button>
      <button class="linkbtn small" id="selClear" ${n?'':'disabled'} style="margin-left:12px">Clear</button></div>
    <div class="small muted" style="margin:6px 0">Mark selected days as:</div>
    <div class="chips">${Object.entries(TYPES).map(([k,v]) => `<button class="chip" style="--c:${v.color}" data-apply="${k}" ${n?'':'disabled'}><span class="dot"></span>${v.label}</button>`).join('')}
      <button class="chip" data-apply="" ${n?'':'disabled'}>↺ Reset to default</button></div>
    <label class="small row mt" style="gap:8px"><input type="checkbox" id="skipWk" ${ui.skipWk?'checked':''}> Skip weekends &amp; public holidays</label>
    <button class="btn block mt" id="selDone">Done</button>
  </div>` : ''}
  <div class="card"><h2>${MONTHS[m]} total</h2>
    <div class="stats" style="margin-top:0">
      <div class="stat"><div class="k">Worked</div><div class="v">${fmtDur(mo.worked)}</div></div>
      <div class="stat"><div class="k">Target</div><div class="v">${fmtDur(mo.target)}</div></div>
      <div class="stat"><div class="k">Balance</div><div class="v ${balCls(mo.balance)}">${fmtBal(mo.balance)}</div></div>
    </div>
    <div class="small muted mt">Tap a day to add times or mark it as vacation, sick, home office…</div>
  </div>`;
}

function applyToSelection(type){
  const days = [...ui.sel].sort().filter(s => type === 'holiday' || !ui.skipWk || (day(s).base > 0 && !day(s).hol));
  if (!days.length){ toast('No working days in the selection'); return; }
  const before = days.map(s => [s, S.days[s] ? { ...S.days[s] } : undefined]);
  days.forEach(s => setDayType(s, type));
  ui.sel = null; save();
  toast(`${days.length} day${days.length===1?'':'s'} ${type ? 'marked as ' + TYPES[type].label : 'reset'}`, 'Undo', () => {
    before.forEach(([s, rec]) => { if (rec) S.days[s] = rec; else delete S.days[s]; }); save(); toast('Undone'); });
}

/* ---------------- Balances view ---------------- */
function viewSum(){
  const y = ui.sumY, t = today(), yEnd = `${y}-12-31`, upto = yEnd < t ? yEnd : t;
  const yr = agg(`${y}-01-01`, upto);
  const counts = {}; for (let s = `${y}-01-01`; s <= upto; s = addDays(s,1)){ const x = day(s); if (x.counted && x.type && x.type!=='work' && x.base > 0 && (x.type==='holiday' || !x.hol)) counts[x.type] = (counts[x.type]||0) + (x.type==='vacation_half'?0.5:1); }
  if (counts.vacation_half){ counts.vacation = (counts.vacation||0) + counts.vacation_half; delete counts.vacation_half; }
  let months = '';
  for (let m = 11; m >= 0; m--){
    const [a, b] = monthRange(y, m); if (a > t || b < S.settings.start) continue;
    const r = agg(a, b < t ? b : t);
    const key = `m${y}-${m}`;
    // weeks belonging to this month (ISO rule: the week's Thursday lies in the month)
    let weeks = '';
    const mondays = []; for (let mon = mondayOf(a); mon <= b; mon = addDays(mon,7)){ const th = addDays(mon,3); if (th >= a && th <= b) mondays.push(mon); }
    for (const mon of mondays.reverse()){
      const sun = addDays(mon,6); if (mon > t || sun < S.settings.start) continue;
      const w = agg(mon, sun < t ? sun : t), wk = `w${mon}`;
      let rows = '';
      for (let s = mon; s <= sun; s = addDays(s,1)){ const x = day(s); if (!(x.counted || x.ents.length || x.explicit)) continue;
        rows += `<div class="dayrow" data-day="${s}"><span>${fmtDay(s).slice(0,-4)}</span>
          <span class="muted">${x.type?TYPES[x.type].label:''}${x.ents.length?' · '+fmtDur(x.worked):''}${x.warn?' ⚠︎':''}</span>
          <span class="bal ${balCls(x.balance)}">${x.counted?fmtBal(x.balance):'–'}</span></div>`; }
      weeks += `<details class="acc" data-k="${wk}" ${ui.open.has(wk)?'open':''}><summary><div class="sumrow">
        <span><span class="nm">Week ${isoWeek(mon)}</span> <span class="small muted">${parseD(mon).getMonth()===parseD(sun).getMonth() ? parseD(mon).getDate() : fmtDay(mon).slice(4)}–${fmtDay(sun).slice(4)}</span></span>
        <span class="fig">${fmtDur(w.worked)} / ${fmtDur(w.target)}</span><span class="bal ${balCls(w.balance)}">${fmtBal(w.balance)}</span></div></summary>
        <div class="inner">${rows || '<div class="small muted">Nothing counted.</div>'}</div></details>`;
    }
    months += `<details class="acc" data-k="${key}" ${ui.open.has(key)?'open':''}><summary><div class="sumrow">
      <span class="nm">${MONTHS[m]}</span><span class="fig">${fmtDur(r.worked)} / ${fmtDur(r.target)}</span>
      <span class="bal ${balCls(r.balance)}">${fmtBal(r.balance)}</span></div></summary>
      <div class="inner"><div class="small muted" style="margin-bottom:4px">Account at end of ${MONTHS[m].slice(0,3)}: <strong class="${balCls(accountAt(b<t?b:t))}">${fmtBal(accountAt(b<t?b:t))}</strong></div>${weeks}</div></details>`;
  }
  return `<div class="card">
    <div class="calnav"><button class="iconbtn" id="yPrev" aria-label="Previous year">‹</button><h2>${y}</h2><button class="iconbtn" id="yNext" aria-label="Next year">›</button></div>
    <div class="stats" style="margin-top:0">
      <div class="stat"><div class="k">Worked</div><div class="v">${fmtDur(yr.worked)}</div></div>
      <div class="stat"><div class="k">Target</div><div class="v">${fmtDur(yr.target)}</div></div>
      <div class="stat"><div class="k">Year balance</div><div class="v ${balCls(yr.balance)}">${fmtBal(yr.balance)}</div></div>
    </div>
    <div class="small muted mt">Account ${y < new Date().getFullYear() ? 'at year end' : 'today'}: <strong class="${balCls(accountAt(upto))}">${fmtBal(accountAt(upto))}</strong>
      ${Object.keys(counts).length ? '<br>' + Object.entries(counts).map(([k,n]) => `${TYPES[k].label}: ${n} d`).join(' · ') : ''}</div>
  </div>
  <div class="card"><h2>Months → weeks → days</h2>${months || '<div class="small muted">Nothing tracked in this year.</div>'}
    <div class="small muted mt">Weeks are ISO weeks (Mon–Sun) and appear under the month that contains their Thursday.</div></div>`;
}

/* ---------------- Settings view ---------------- */
function viewSettings(){
  const st = S.settings, wkTotal = st.targets.reduce((a,b) => a+b, 0);
  return `<form id="setForm" autocomplete="off">
  <div class="card"><h2>Target hours</h2>
    <div class="grid3">${DOW.map((d,i) => `<label class="f">${d}<input name="t${i}" inputmode="decimal" value="${fmtDur(st.targets[i])}"></label>`).join('')}</div>
    <div class="small muted mt">Per weekday, e.g. <code>8</code>, <code>7.5</code> or <code>7:42</code>. Week total: <strong id="wkTotal">${fmtDur(wkTotal)}</strong></div>
  </div>
  <div class="card"><h2>Public holidays</h2>
    <label class="f">Bundesland<select name="state">${Object.entries(STATES).map(([k,v]) => `<option value="${k}" ${k===st.state?'selected':''}>${v}</option>`).join('')}</select></label>
    <div class="small muted mt">Statewide holidays are marked automatically. Local ones (e.g. Augsburg's Friedensfest, Fronleichnam in parts of Sachsen/Thüringen) can be set by tapping the day in the calendar.</div>
  </div>
  <div class="card"><h2>Tracking</h2>
    <div class="grid2">
      <label class="f">Count from<input type="date" name="start" value="${st.start}" required></label>
      <label class="f">Opening balance<input name="opening" inputmode="text" value="${fmtBal(st.opening).replace('±','')}"></label>
    </div>
    <div class="small muted mt">Days before “count from” are ignored. Opening balance is your existing overtime (e.g. <code>+12:30</code> or <code>-3:00</code>).</div>
  </div>
  <div class="card"><h2>Break button</h2>
    <label class="f">Length of one break (minutes)<input type="number" name="breakLen" min="5" max="240" step="5" inputmode="numeric" value="${st.breakLen}"></label>
    <div class="small muted mt">Each tap on the ☕ button on the Today screen adds this much break time.</div>
  </div>
  <div class="row"><span class="spacer small muted" id="setMsg"></span><button class="btn primary" type="submit">Save settings</button></div>
  </form>

  <div class="card mt"><h2>Your data</h2>
    <div class="small muted">Everything is stored only on this device. Save a backup file regularly (e.g. to Google Drive) – you can restore it on any phone or computer.</div>
    <div class="grid2 mt">
      <button class="btn" id="expJson">⬇ Backup (.json)</button>
      <button class="btn" id="expCsv">⬇ Table (.csv)</button>
    </div>
    ${navigator.canShare ? `<button class="btn block mt" id="shareJson">Share backup to Drive / mail…</button>` : ''}
    <label class="btn block mt" style="display:flex;align-items:center;justify-content:center;cursor:pointer">⬆ Restore from backup<input type="file" id="impJson" accept=".json,application/json" hidden></label>
    <label class="f mt">CSV format<select id="csvFmt">
      <option value="de" ${st.csv==='de'?'selected':''}>Excel (German): ; and decimal comma</option>
      <option value="intl" ${st.csv==='intl'?'selected':''}>International: , and decimal point</option></select></label>
    <div class="small muted mt">${S.entries.length} entries · ${Object.keys(S.days).length} marked days · last backup: ${st.lastBackup ? new Date(st.lastBackup).toLocaleDateString('en-GB') : 'never'}<br><span id="persist"></span></div>
  </div>
  <div class="card"><h2>App</h2>
    <div class="row"><div class="spacer"><strong>Version ${APP_VERSION}</strong><div class="small muted">Works offline</div></div><button class="btn" id="chkUpd">Check for updates</button></div>
    <details class="acc mt" id="whatsNew"><summary><span class="nm">What’s new</span></summary><div class="inner small">
      ${Object.keys(CHANGELOG).sort((a,b) => b-a).map(v => `<div class="mt"><strong>Version ${v}</strong><ul style="margin:4px 0;padding-left:18px">${CHANGELOG[v].map(c => `<li>${esc(c)}</li>`).join('')}</ul></div>`).join('')}
    </div></details>
  </div>
  <div class="card"><h2>Danger zone</h2><button class="btn danger" id="wipe">Delete all data</button></div>`;
}

/* ---------------- day sheet & entry editor ---------------- */
function openModal(html, onBind){
  const m = $('#modal'); m.innerHTML = `<div class="sheet" role="dialog" aria-modal="true">${html}</div>`; m.hidden = false;
  m.onclick = e => { if (e.target === m) closeModal(); };
  onBind?.(m.firstElementChild);
  setTimeout(() => m.querySelector('[autofocus]')?.focus(), 50);
}
function closeModal(){ const m = $('#modal'); m.hidden = true; m.innerHTML = ''; }
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#modal').hidden) closeModal(); });

function confirmBox(title, text, okLabel, danger){
  return new Promise(res => openModal(`<h3>${esc(title)}</h3><div class="sub">${esc(text)}</div>
    <div class="row end mt"><button class="btn" data-a="no">Cancel</button><button class="btn ${danger?'danger':'primary'}" data-a="ok">${esc(okLabel)}</button></div>`,
    el => el.addEventListener('click', e => { const a = e.target.closest('[data-a]')?.dataset.a; if (a){ closeModal(); res(a==='ok'); } })));
}

function setDayType(s, type){
  const rec = { ...(S.days[s] || {}) };
  if (type) rec.type = type; else delete rec.type;
  if (!rec.type && !rec.note) delete S.days[s]; else S.days[s] = rec;
}

function openDay(s){
  const x = day(s);
  const autoType = x.hol ? 'holiday' : null;
  openModal(`
    <div class="row"><div class="spacer"><h3>${fmtDayLong(s)}</h3><div class="sub">${x.hol?esc(x.hol)+' · ':''}Week ${isoWeek(s)} · target normally ${fmtDur(x.base)}</div></div>
      <button class="iconbtn" data-a="close" aria-label="Close">✕</button></div>
    <div class="stats" style="margin-top:0">
      <div class="stat"><div class="k">Worked</div><div class="v">${fmtDur(x.worked)}</div></div>
      <div class="stat"><div class="k">Target</div><div class="v">${fmtDur(x.target)}</div></div>
      <div class="stat"><div class="k">Balance</div><div class="v ${balCls(x.balance)}">${x.counted?fmtBal(x.balance):'–'}</div></div>
    </div>
    ${!x.counted ? `<div class="small muted mt">${s < S.settings.start ? 'Before your tracking start date – not counted.' : 'In the future – counted once the day arrives.'}</div>` : ''}
    ${x.warn ? `<div class="warn mt">⚠︎ ${esc(x.warn)}</div>` : ''}
    <section><div class="lbl">Day type</div><div class="chips">
      ${Object.entries(TYPES).map(([k,v]) => `<button class="chip" style="--c:${v.color}" data-type="${k}" aria-pressed="${x.type===k}"><span class="dot"></span>${v.label}</button>`).join('')}
    </div><div class="small muted mt">${x.type ? esc(TYPE_HELP[x.type]) : 'No target on this day.'}${x.explicit ? ` <button class="linkbtn small" data-a="reset">Reset to ${autoType?'holiday':'default'}</button>` : ''}</div></section>
    <section><div class="lbl">Times</div>
      ${x.ents.length ? `<ul class="list">${x.ents.map(e => `<li><button class="rowbtn" data-edit="${e.id}"><div class="main"><div class="t1 num">${e.start} – ${e.end}</div><div class="t2">break ${e.brk||0} min</div></div><div class="right num">${fmtDur(entryMin(e))} ›</div></button></li>`).join('')}</ul>` : '<div class="small muted">No times logged.</div>'}
      <button class="btn block mt" data-a="add">+ Add time</button></section>
    <section><label class="f">Note<textarea id="dayNote" placeholder="optional">${esc(x.rec?.note||'')}</textarea></label></section>`,
  el => {
    el.addEventListener('click', e => {
      const t = e.target.closest('button'); if (!t) return;
      if (t.dataset.a === 'close') closeModal();
      else if (t.dataset.type){ setDayType(s, t.dataset.type === x.type && x.explicit ? null : t.dataset.type); save(); openDay(s); }
      else if (t.dataset.a === 'reset'){ setDayType(s, null); save(); openDay(s); }
      else if (t.dataset.a === 'add') openEntry({ date:s }, () => openDay(s));
      else if (t.dataset.edit) openEntry(S.entries.find(z => z.id === t.dataset.edit), () => openDay(s));
    });
    $('#dayNote', el).addEventListener('change', e => { const rec = { ...(S.days[s]||{}) }; const v = e.target.value.trim();
      if (v) rec.note = v; else delete rec.note; if (!rec.type && !rec.note) delete S.days[s]; else S.days[s] = rec; save(); toast('Note saved'); });
  });
}

function openEntry(e, after, onSaved){
  const isNew = !e.id, L = S.last;
  const v = { date: e.date || today(), start: e.start || L.start, end: e.end || L.end, brk: e.brk ?? L.brk };
  const curType = day(v.date).type;
  openModal(`<h3>${isNew ? 'Add time' : 'Edit time'}</h3><div class="sub">${fmtDayLong(v.date)}</div>
    <form id="entForm">
      <label class="f">Date<input type="date" name="date" value="${v.date}" required></label>
      <div class="grid3 mt">
        <label class="f">Start<input type="time" name="start" value="${v.start}" required></label>
        <label class="f">End<input type="time" name="end" value="${v.end}" required></label>
        <label class="f">Break (min)<input type="number" name="brk" min="0" max="600" step="5" inputmode="numeric" value="${v.brk}"></label>
      </div>
      ${isNew ? `<div class="seg mt" role="group" aria-label="Location">
        <button type="button" data-loc="work" aria-pressed="${curType!=='wfh'}">🏢 Office</button>
        <button type="button" data-loc="wfh" aria-pressed="${curType==='wfh'}">🏠 Home office</button></div>` : ''}
      <div class="small muted num mt" id="entPreview"></div>
      <div class="row mt">${isNew ? '' : '<button type="button" class="btn danger" data-a="del">Delete</button>'}<span class="spacer"></span>
        <button type="button" class="btn" data-a="cancel">Cancel</button><button class="btn primary" type="submit">Save</button></div>
    </form>`, el => {
      const f = $('#entForm', el);
      wireEntryForm(f, $('#entPreview', el));
      el.addEventListener('click', async ev => {
        const a = ev.target.closest('[data-a]')?.dataset.a;
        if (a === 'cancel'){ after ? after() : closeModal(); }
        if (a === 'del'){ S.entries = S.entries.filter(z => z.id !== e.id); save(); toast('Entry deleted'); after ? after() : closeModal(); }
      });
      f.addEventListener('submit', ev => { ev.preventDefault(); const r = submitEntry(f, isNew ? null : e.id); if (r){ onSaved?.(r); after ? after() : closeModal(); } });
    });
}

/* shared by the home form and the editor */
function wireEntryForm(f, preview){
  const upd = () => {
    const s = f.start.value, en = f.end.value, b = +f.brk.value || 0;
    if (!s || !en){ preview.textContent = ''; return; }
    const m = entryMin({ start:s, end:en, brk:b });
    preview.textContent = `= ${fmtDur(m)} h${hm2min(en) < hm2min(s) ? ' (ends next day)' : ''}`;
  };
  f.addEventListener('input', upd); upd();
  f.querySelectorAll('[data-loc]').forEach(b => b.addEventListener('click', () => {
    f.querySelectorAll('[data-loc]').forEach(z => z.setAttribute('aria-pressed', z === b)); }));
}
function submitEntry(f, id){
  const date = f.date.value, start = f.start.value, end = f.end.value, brk = Math.max(0, Math.round(+f.brk.value || 0));
  if (!date || !start || !end){ toast('Please fill date, start and end'); return false; }
  if (start === end){ toast('Start and end are the same'); return false; }
  let span = hm2min(end) - hm2min(start); if (span < 0) span += 1440;
  if (brk >= span){ toast('Break is longer than the working time'); return false; }
  const locBtn = f.querySelector('[data-loc][aria-pressed="true"]'), loc = locBtn?.dataset.loc;
  if (id){ const e = S.entries.find(z => z.id === id); Object.assign(e, { date, start, end, brk }); }
  else { id = Date.now().toString(36) + Math.random().toString(36).slice(2,6); S.entries.push({ id, date, start, end, brk }); }
  if (loc){
    const cur = S.days[date]?.type;
    if (!cur || cur === 'work' || cur === 'wfh') setDayType(date, loc === 'wfh' ? 'wfh' : null);
    S.last.loc = loc;
  }
  Object.assign(S.last, { start, end, brk });
  save(); toast(`Saved ${fmtDur(span - brk)} h on ${fmtDay(date)}`);
  return id;
}

/* ---------------- per-view event binding ---------------- */
const bind = {
  home(v){
    v.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => setTab(b.dataset.go)));
    v.querySelectorAll('[data-day]').forEach(b => b.addEventListener('click', () => openDay(b.dataset.day)));
    const f = $('#addForm', v); wireEntryForm(f, $('#addPreview', v));
    f.addEventListener('submit', e => { e.preventDefault(); submitEntry(f); });
    $('#markDay', v).addEventListener('click', () => { ui.sel = new Set(); const n = new Date(); ui.calY = n.getFullYear(); ui.calM = n.getMonth(); setTab('cal'); });
    $('#addBreak', v).addEventListener('click', addBreak);
    $('#undoBreak', v)?.addEventListener('click', undoBreak);
    $('#clockIn', v)?.addEventListener('click', () => { S.running = { date: today(), start: nowHM(), brk: 0 }; save(); toast('Clocked in at ' + S.running.start); });
    $('#clockCancel', v)?.addEventListener('click', () => {
      S.running = null; if (S.pause) S.pause.items = S.pause.items.filter(i => i.kind !== 'running'); save(); toast('Clock-in cancelled'); });
    $('#clockOut', v)?.addEventListener('click', () => {
      const r = S.running, end = nowHM();
      let span = hm2min(end) - hm2min(r.start); if (span < 0) span += 1440;
      // breaks logged with the ☕ button win; otherwise suggest the legal minimum
      const brk = r.brk ? r.brk : S.settings.autoBreak ? (span > 9*60+45 ? 45 : span > 6*60+30 ? 30 : 0) : S.last.brk;
      // clock stays running until the entry is actually saved
      openEntry({ date: r.date, start: r.start, end, brk }, null, id => {
        S.running = null;
        if (S.pause) S.pause.items.forEach(i => { if (i.kind === 'running'){ i.kind = 'entry'; i.id = id; } });
        save(); });
    });
  },
  cal(v){
    $('#calPrev', v).onclick = () => { if (--ui.calM < 0){ ui.calM = 11; ui.calY--; } render(); };
    $('#calNext', v).onclick = () => { if (++ui.calM > 11){ ui.calM = 0; ui.calY++; } render(); };
    v.querySelectorAll('[data-day]').forEach(b => b.addEventListener('click', () => {
      const s = b.dataset.day;
      if (!ui.sel) return openDay(s);
      ui.sel.has(s) ? ui.sel.delete(s) : ui.sel.add(s); render();
    }));
    $('#selStart', v)?.addEventListener('click', () => { ui.sel = new Set(); render(); });
    if (ui.sel){
      $('#selDone', v).onclick = () => { ui.sel = null; render(); };
      $('#selClear', v).onclick = () => { ui.sel.clear(); render(); };
      $('#selRange', v).onclick = () => { const d = [...ui.sel].sort(); for (let s = d[0]; s <= d[d.length-1]; s = addDays(s,1)) ui.sel.add(s); render(); };
      $('#skipWk', v).onchange = e => { ui.skipWk = e.target.checked; };
      v.querySelectorAll('[data-apply]').forEach(b => b.addEventListener('click', () => applyToSelection(b.dataset.apply || null)));
    }
    let x0 = null; const g = $('.cal', v);
    g.addEventListener('touchstart', e => { x0 = e.touches[0].clientX; }, { passive:true });
    g.addEventListener('touchend', e => { if (x0 === null) return; const dx = e.changedTouches[0].clientX - x0; x0 = null;
      if (Math.abs(dx) > 60) (dx < 0 ? $('#calNext', v) : $('#calPrev', v)).click(); });
  },
  sum(v){
    $('#yPrev', v).onclick = () => { ui.sumY--; render(); };
    $('#yNext', v).onclick = () => { ui.sumY++; render(); };
    v.querySelectorAll('details.acc').forEach(d => d.addEventListener('toggle', () => d.open ? ui.open.add(d.dataset.k) : ui.open.delete(d.dataset.k)));
    v.querySelectorAll('[data-day]').forEach(b => b.addEventListener('click', () => openDay(b.dataset.day)));
  },
  set(v){
    const f = $('#setForm', v);
    f.addEventListener('input', () => { let t = 0; for (let i = 0; i < 7; i++){ const m = parseDur(f['t'+i].value); if (m !== null) t += m; } $('#wkTotal', v).textContent = fmtDur(t); });
    f.addEventListener('submit', e => {
      e.preventDefault();
      const targets = []; for (let i = 0; i < 7; i++){ const m = parseDur(f['t'+i].value); if (m === null || m < 0 || m > 1440){ toast(`Check the value for ${DOW[i]}`); return; } targets.push(m); }
      const opening = parseDur(f.opening.value); if (opening === null){ toast('Opening balance: use e.g. +12:30 or -3:00'); return; }
      const breakLen = Math.round(+f.breakLen.value); if (!(breakLen >= 1 && breakLen <= 240)){ toast('Break length: 1–240 minutes'); return; }
      Object.assign(S.settings, { targets, state: f.state.value, start: f.start.value || today(), opening, breakLen, setupDone: true });
      save(); toast('Settings saved');
    });
    $('#csvFmt', v).addEventListener('change', e => { S.settings.csv = e.target.value; save(); });
    $('#chkUpd', v).addEventListener('click', () => checkForUpdate(true));
    $('#expJson', v).addEventListener('click', () => { download(backupName(), backupBlob()); markBackup(); });
    $('#expCsv', v).addEventListener('click', () => download(`zeitkonto-${today()}.csv`, csvBlob()));
    $('#shareJson', v)?.addEventListener('click', async () => {
      const file = new File([backupBlob()], backupName(), { type:'application/json' });
      if (!navigator.canShare({ files:[file] })){ toast('Sharing files is not supported here'); return; }
      try { await navigator.share({ files:[file], title:'Zeitkonto backup' }); markBackup(); } catch (err) { if (err.name !== 'AbortError') toast('Share failed'); }
    });
    $('#impJson', v).addEventListener('change', async e => {
      const file = e.target.files[0]; e.target.value = ''; if (!file) return;
      try {
        const o = JSON.parse(await file.text());
        if (!o || !o.settings || !Array.isArray(o.entries)) throw new Error('not a Zeitkonto backup');
        const ok = await confirmBox('Restore backup?', `This replaces all data on this device with the backup (${o.entries.length} entries).`, 'Replace data', true);
        if (ok){ S = normalize(o); save(); toast('Backup restored'); }
      } catch (err) { toast('Could not read file: ' + err.message); }
    });
    $('#wipe', v).addEventListener('click', async () => {
      if (await confirmBox('Delete all data?', 'All entries, marked days and settings on this device will be removed. Make a backup first if unsure.', 'Delete everything', true)){
        S = defaultState(); save(); toast('All data deleted'); }
    });
    if (navigator.storage?.persisted) navigator.storage.persisted().then(p => { const el = $('#persist', v); if (el) el.textContent = p ? 'Storage: protected from automatic clean-up ✓' : 'Storage: not yet protected – install the app to your home screen.'; });
  },
};

/* ---------------- export ---------------- */
const backupName = () => `zeitkonto-backup-${today()}.json`;
const backupBlob = () => new Blob([JSON.stringify({ app:'zeitkonto', exported: new Date().toISOString(), ...S }, null, 1)], { type:'application/json' });
function markBackup(){ S.settings.lastBackup = Date.now(); save(); }
function download(name, blob){
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
function csvBlob(){
  const de = S.settings.csv === 'de', sep = de ? ';' : ',';
  const dec = m => (Math.round(m)/60).toFixed(2).replace('.', de ? ',' : '.');
  const q = v => { v = String(v ?? ''); return (v.includes(sep) || /["\r\n]/.test(v)) ? `"${v.replace(/"/g,'""')}"` : v; };
  const sb = m => fmtBal(m).replace('−','-').replace('+','').replace('±','');   // no leading "+" (Excel would read it as a formula)
  const head = ['Date','Weekday','ISO week','Type','Holiday','Times','Break (min)','Worked','Target','Balance','Account','Worked (h)','Target (h)','Balance (h)','Account (h)','Note'];
  const lines = [head.map(q).join(sep)];
  const last = S.entries.reduce((a,e) => e.date > a ? e.date : a, today());
  let accMin = S.settings.opening;
  for (let s = S.settings.start; s <= last; s = addDays(s,1)){
    const x = day(s); if (!(x.counted || x.ents.length || x.explicit)) continue;
    if (x.counted) accMin += x.balance;
    lines.push([s, DOW[dow(s)], isoWeek(s), x.type ? TYPES[x.type].label : '', x.hol || '', x.ents.map(e => `${e.start}-${e.end}`).join(' / '),
      x.ents.reduce((a,e) => a + (e.brk||0), 0), fmtDur(x.worked), fmtDur(x.target), x.counted ? sb(x.balance) : '',
      x.counted ? sb(accMin) : '', dec(x.worked), dec(x.target), x.counted ? dec(x.balance) : '', x.counted ? dec(accMin) : '', x.rec?.note || ''].map(q).join(sep));
  }
  return new Blob(['﻿' + lines.join('\r\n')], { type:'text/csv;charset=utf-8' });
}

/* ---------------- updates ---------------- */
let swReg = null, reloading = false;
function showUpdate(worker){
  let b = $('#updBanner');
  if (!b){ b = document.createElement('div'); b.id = 'updBanner'; b.className = 'updbanner'; document.body.appendChild(b); }
  b.innerHTML = `<span>✨ A new version is available</span><button>Reload</button>`;
  b.querySelector('button').onclick = () => { b.querySelector('button').disabled = true; worker.postMessage('skipWaiting'); };
}
function watchWorker(w){ if (!w) return; w.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) showUpdate(w); }); }
async function checkForUpdate(manual){
  if (!swReg){ if (manual) toast('Updates are checked when the app runs from your web address'); return; }
  try { await swReg.update(); } catch { if (manual) toast('Offline – could not check'); return; }
  if (swReg.waiting) showUpdate(swReg.waiting);
  else if (swReg.installing) { watchWorker(swReg.installing); if (manual) toast('Downloading new version…'); }
  else if (manual) toast(`You have the latest version (v${APP_VERSION})`);
}
if ('serviceWorker' in navigator && location.protocol !== 'file:'){
  navigator.serviceWorker.register('sw.js').then(reg => {
    swReg = reg;
    if (reg.waiting && navigator.serviceWorker.controller) showUpdate(reg.waiting);
    watchWorker(reg.installing);
    reg.addEventListener('updatefound', () => watchWorker(reg.installing));
    // the browser may already be downloading a new version in the background: look again shortly
    setTimeout(() => { if (reg.waiting && navigator.serviceWorker.controller) showUpdate(reg.waiting); else watchWorker(reg.installing); }, 2500);
    setTimeout(() => checkForUpdate(false), 8000);
  }).catch(() => {});
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (!reloading){ reloading = true; location.reload(); } });
}

/* ---------------- start ---------------- */
render();
if (S.settings.seenVersion !== APP_VERSION){
  const was = S.settings.seenVersion; S.settings.seenVersion = APP_VERSION; save();
  if (was && was < APP_VERSION) setTimeout(() => toast(`Updated to version ${APP_VERSION}`, 'What’s new', () => { setTab('set'); setTimeout(() => { const d = $('#whatsNew'); if (d){ d.open = true; d.scrollIntoView({ block:'center' }); } }, 50); }), 400);
}
// re-render after midnight / when returning to the app so "today" stays right; also look for updates
document.addEventListener('visibilitychange', () => { if (!document.hidden){ invalidate(); render(); checkForUpdate(false); } });
window.__zk = { day, agg, accountAt, holidaysFor, parseDur, get S(){ return S; } }; // for debugging
