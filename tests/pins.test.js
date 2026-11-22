const assert=require('assert');
const file=process.argv[2]||require('./helpers.js').HTML.estimated;
const {ctx,items}=require('./helpers.js')(file);
const total=items.reduce((s,i)=>s+i.qty,0);
const all=(R)=>R.racks.flatMap(r=>r.devices);
const sumLoad=(R)=>R.racks.reduce((s,r)=>s+r.pdus.reduce((a,p)=>a+p.load,0),0);
const expectLoad=(R)=>all(R).filter(d=>d.psuCount).reduce((s,d)=>s+d.w*d.psuCount,0);
// (a) 無 pins：任何比例都沒有違規
for(const pct of [100,90,80,70,60]){const R=ctx.allocate(items,pct/100);
  assert(R.racks.every(r=>r.violations.length===0),`無 pins ${pct}% 不應有違規`);
  assert(R.racks.every(r=>r.layoutU===41)); assert(all(R).every(d=>!d.pinned));}
console.log('(a) 無 pins：100~60% 皆 0 違規');

const R0=ctx.allocate(items,0.8);
const war=R0.racks.find(r=>r.unit==='單位C');
const dl=war.devices.find(d=>d.model.includes('380a'));
// (b) 把 DL380a 指定到單位A
const R1=ctx.allocate(items,0.8,{[dl.id]:'單位A'});
const low=R1.racks.find(r=>r.unit==='單位A'), w1=R1.racks.find(r=>r.unit==='單位C');
assert(low.devices.some(d=>d.id===dl.id)&&low.devices.find(d=>d.id===dl.id).pinned);
assert(!w1.devices.some(d=>d.id===dl.id));
assert.strictEqual(all(R1).length+R1.unplaced.length,total,'設備總數');
assert(Math.abs(sumLoad(R1)-expectLoad(R1))<1e-6,'負載守恆');
const idx=new Set();low.pdus.forEach((p,i)=>p.ports.forEach(pt=>{if(pt.dev.id===dl.id)idx.add(i)}));
assert.strictEqual(idx.size,5,'5 顆 PSU 在 5 個不同 PDU');
console.log('(b) 指定 DL380a→單位A：單位A',low.deviceCount,'台；違規',JSON.stringify(low.violations.map(v=>v.type+(v.index!=null?v.index+1:'')+':'+Math.round(v.over))));

const heavy={};all(R0).filter(d=>d.w>=400).forEach(d=>heavy[d.id]='單位A');
const Rh=ctx.allocate(items,0.8,heavy);const lh=Rh.racks.find(r=>r.unit==='單位A');
assert(lh.violations.some(v=>v.type==='pdu'),'應有 PDU 超載');
assert.strictEqual(all(Rh).length+Rh.unplaced.length,total);assert(Math.abs(sumLoad(Rh)-expectLoad(Rh))<1e-6);
const pv=lh.violations.filter(v=>v.type==='pdu');
console.log('(b2) 大量指定到單位A：PDU 超載',pv.length,'個，最多超出',Math.round(Math.max(...pv.map(v=>v.over))),'W；孔數違規',lh.violations.filter(v=>v.type==='ports').length,'個');
// (c) 指定一堆設備到單位D → U > 41 與違規；每台 id 唯一
const ids=all(R0).filter(d=>d.u>=2).map(d=>d.id);
const pins={};ids.forEach(id=>pins[id]='單位D');
const R2=ctx.allocate(items,0.8,pins);
const wx=R2.racks.find(r=>r.unit==='單位D');
assert(wx.usedU>41,'應超過 41U');
const vu=wx.violations.find(v=>v.type==='u');assert(vu&&vu.over===wx.usedU-41);
assert.strictEqual(wx.layoutU,wx.usedU);
assert(wx.placed.some(d=>d.over)&&wx.placed.filter(d=>!d.over).every(d=>d.start+d.u-1<=41));
assert.strictEqual(all(R2).length+R2.unplaced.length,total);
console.log('(c) '+ids.length+' 台(≥2U)全指定到單位D：已用',wx.usedU,'U 溢出',vu.over,'U；違規類型',[...new Set(wx.violations.map(v=>v.type))].join(','));

// (d) PSU 6 顆設備被指定 → 允許放入，標 psu 違規，負載守恆
const big=ctx.parseCSV('部門,項目名稱,廠牌,型號,U數,數量,PSU配置,單台預估最大功耗(W)\nA,GPU運算設備,N,DGX,10U,1,3300W x 6,14300W\nB,伺服器,H,X,2U,2,800W x 2,800W\n');
const Rb0=ctx.allocate(big,0.8);assert.strictEqual(Rb0.unplaced.length,1);
const dgx=ctx.allocate(big,0.8).unplaced[0].dev;
const Rb=ctx.allocate(big,0.8,{[dgx.id]:'A'});
const ra=Rb.racks.find(r=>r.unit==='A');
assert.strictEqual(Rb.unplaced.length,0);
assert(ra.violations.some(v=>v.type==='psu'&&v.k===6));
assert.strictEqual(ra.pdus.reduce((s,p)=>s+p.ports.length,0),6);
assert(Math.abs(sumLoad(Rb)-expectLoad(Rb))<1e-6);
console.log('(d) DGX(6 PSU) 指定放入：unplaced 0；psu 違規 OK；PDU 孔數',ra.pdus.map(p=>p.ports.length).join('/'));

// (e) 指定到不存在的櫃 → 忽略，結果等同無 pins
const Re=ctx.allocate(items,0.8,{[dl.id]:'不存在的櫃'});
assert.strictEqual(JSON.stringify(Re.racks.map(r=>r.devices.map(d=>d.id))),JSON.stringify(R0.racks.map(r=>r.devices.map(d=>d.id))));
assert(all(Re).every(d=>!d.pinned));
console.log('(e) 指定到不存在的櫃：忽略');

// (f) 拖回原櫃：視為指定（pinned=true），moved=false
const Rf=ctx.allocate(items,0.8,{[dl.id]:'單位C'});
const dd=all(Rf).find(d=>d.id===dl.id);assert(dd.pinned&&!dd.moved);
console.log('(f) 拖回原櫃：pinned=true、moved=false');
console.log('全部通過');
