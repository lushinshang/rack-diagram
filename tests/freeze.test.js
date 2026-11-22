const assert=require('assert');
const file=process.argv[2]||require('./helpers.js').HTML.estimated;
const {ctx,items}=require('./helpers.js')(file);
const where=(R)=>{const m={};R.racks.forEach(r=>r.devices.forEach(d=>m[d.id]=r.unit));return m;};
const loads=(R)=>JSON.stringify(R.racks.map(r=>r.pdus.map(p=>[Math.round(p.load*1000),p.ports.length])));
const portMap=(R)=>JSON.stringify(R.racks.map(r=>r.pdus.map(p=>p.ports.map(x=>x.dev.id+'#'+x.psu))));
let n=0;
for(const pct of [100,90,80,70,60]){
  const R=ctx.allocate(items,pct/100);
  const snap=ctx.snapshotPins(R);
  const R2=ctx.allocate(items,pct/100,snap);
  assert.strictEqual(JSON.stringify(where(R2)),JSON.stringify(where(R)),`${pct}% 快照改變了所在櫃`);
  assert.strictEqual(loads(R2),loads(R),`${pct}% 快照改變了 PDU 負載`);
  assert.strictEqual(portMap(R2),portMap(R),`${pct}% 快照改變了插孔分配`);
  assert.strictEqual(R2.unplaced.length,R.unplaced.length);
  // 對每一台設備做「拖到每一座別的櫃」：只有它改櫃
  const w0=where(R);
  for(const id of Object.keys(w0)){
    for(const r of R.racks){ if(r.unit===w0[id]) continue;
      const pins={...snap,[id]:r.unit};
      const R3=ctx.allocate(items,pct/100,pins);const w3=where(R3);
      const changed=Object.keys(w0).filter(k=>w3[k]!==w0[k]);
      assert.strictEqual(JSON.stringify(changed),JSON.stringify([id]),`${pct}% 拖 ${id}→${r.unit} 變動:${changed}`);
      assert.strictEqual(Object.keys(w3).length+R3.unplaced.length,54);
      // 沒被動到的櫃不得出現違規
      R3.racks.filter(x=>x.unit!==r.unit).forEach(x=>assert.strictEqual(x.violations.length,0,`${x.unit} 不應違規`));
      n++;
    }
  }
}
console.log('快照冪等；',n,'種「拖一台到別櫃」組合：只有該台改櫃、其他櫃無違規、總數 54');
// 使用者情境：80%，把單位C的 DL380 Gen11 拖到單位D
const R=ctx.allocate(items,0.8);const snap=ctx.snapshotPins(R);
const cnt=(R,u,m)=>R.racks.find(r=>r.unit===u).devices.filter(d=>d.model===m).length;
const srcRack=R.racks.find(r=>r.unit!=='單位D'&&r.devices.some(d=>d.model==='HPE DL380 Gen11'));
const dl=srcRack.devices.find(d=>d.model==='HPE DL380 Gen11');
const SRC=srcRack.unit;
const R4=ctx.allocate(items,0.8,{...snap,[dl.id]:'單位D'});
console.log('使用者情境 DL380 Gen11：'+SRC+' '+cnt(R,SRC,'HPE DL380 Gen11')+'→'+cnt(R4,SRC,'HPE DL380 Gen11')+'；單位D '+cnt(R,'單位D','HPE DL380 Gen11')+'→'+cnt(R4,'單位D','HPE DL380 Gen11'));
assert.strictEqual(cnt(R4,SRC,'HPE DL380 Gen11'),cnt(R,SRC,'HPE DL380 Gen11')-1);
assert.strictEqual(cnt(R4,'單位D','HPE DL380 Gen11'),cnt(R,'單位D','HPE DL380 Gen11')+1);
console.log('通過');
