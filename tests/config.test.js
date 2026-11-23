// index2.html 可調設定測試。用法：node tests/config.test.js [index2.html]
const fs = require('fs'), vm = require('vm'), path = require('path'), assert = require('assert');
const ROOT = path.join(__dirname, '..');
const file = path.join(ROOT, process.argv[2] || 'index2.html');
const ctx = {}; vm.createContext(ctx);
const code = fs.readFileSync(file, 'utf8').match(/<script id="logic">([\s\S]*?)<\/script>/)[1];
vm.runInContext(code + ';this.parseCSV=parseCSV;this.allocate=allocate;this.clampCfg=clampCfg;this.DEFAULT_CFG=DEFAULT_CFG;', ctx);
const items = ctx.parseCSV(fs.readFileSync(path.join(ROOT, '機櫃配置範例-1151120.csv'), 'utf8'));
const { allocate, clampCfg, DEFAULT_CFG } = ctx;
const movedN = R => R.racks.reduce((s, r) => s + r.movedIn.length, 0);
const total = R => R.racks.reduce((s, r) => s + r.devices.length, 0) + R.unplaced.length;
const sig = R => JSON.stringify(R.racks.map(r => [r.unit, r.devices.map(d => d.id + ':' + d.label), r.pdus.map(p => Math.round(p.load))]));
let n = 0; const ok = (c, m) => { assert(c, m); n++; };

// 1 預設值：搬移數與現有兩頁相同
[[1, 2, 14], [0.9, 6, 20], [0.8, 9, 22]].forEach(([ratio, est, rated]) => {
  ok(movedN(allocate(items, ratio, {}, { ...DEFAULT_CFG, basis: 'estimated' })) === est, `預估 ${ratio}`);
  ok(movedN(allocate(items, ratio, {}, { ...DEFAULT_CFG, basis: 'rated' })) === rated, `額定 ${ratio}`);
});
ok(sig(allocate(items, 0.8)) === sig(allocate(items, 0.8, {}, DEFAULT_CFG)), '省略 cfg = 預設');

// 2 clamp
const c = clampCfg({ pduCount: 20, ports: 11, maxW: 50, spare: 9, basis: 'x' });
ok(c.pduCount === 12 && c.ports === 10 && c.maxW === 1000 && c.spare === 5 && c.basis === 'estimated', 'clamp 上限／下限');
ok(clampCfg({ pduCount: 0, ports: 7, maxW: 99999, spare: -1 }).pduCount === 1, 'clamp pdu 下限');
ok(clampCfg({ pduCount: 'abc' }).pduCount === 5, '非數字退預設');
ok(clampCfg({ pduCount: 3.4 }).pduCount === 3, '非整數取整');
ok(clampCfg({ pduCount: '' }).pduCount === 5, '清空退預設');

// 3 PDU 數／孔數／容量
const r8 = allocate(items, 0.8, {}, { ...DEFAULT_CFG, pduCount: 8 });
ok(r8.racks.every(r => r.pdus.length === 8), 'PDU 數 8');
ok(total(r8) === 54 + 0 || total(r8) === total(allocate(items, 0.8)), '設備總數不變');
const r10 = allocate(items, 1, {}, { ...DEFAULT_CFG, ports: 10 });
ok(r10.racks.every(r => r.pdus.every(p => p.ports.length <= 10)), '孔數上限 10');
const r33 = allocate(items, 1, {}, { ...DEFAULT_CFG, maxW: 3300 });
ok(r33.cap === 3300 && r33.racks.every(r => r.pdus.every(p => p.load <= 3300 + 1e-6)), '容量 3300 不超載');

// 4 空櫃：部門櫃放得下時保持空
const s2 = allocate(items, 0.8, {}, { ...DEFAULT_CFG, spare: 2 });
ok(s2.racks.length === allocate(items, 0.8).racks.length + 2, '多 2 櫃');
ok(s2.racks.slice(-2).every(r => r.devices.length === 0 && r.unit.startsWith('空櫃')), '放得下時空櫃為空');
ok(sig({ racks: s2.racks.slice(0, -2) }) === sig(allocate(items, 0.8)), '部門櫃結果與無空櫃相同');
// 5 溢出：縮小容量使部門櫃放不下 → 溢出到空櫃，且 unplaced 減少
const tight = { ...DEFAULT_CFG, maxW: 2000 };
const a0 = allocate(items, 0.8, {}, tight), a2 = allocate(items, 0.8, {}, { ...tight, spare: 3 });
ok(a2.unplaced.length < a0.unplaced.length, `空櫃減少無法放置 ${a0.unplaced.length}→${a2.unplaced.length}`);
ok(a2.racks.slice(-3).some(r => r.devices.length > 0), '有設備溢出到空櫃');
ok(a2.racks.every(r => r.pdus.every(p => p.load <= 1600 + 1e-6)), '溢出後無超載');
// 6 拖進空櫃
const pin = allocate(items, 0.8, { '0-0': '空櫃1' }, { ...DEFAULT_CFG, spare: 1 });
ok(pin.racks.at(-1).devices.some(d => d.id === '0-0'), '可拖進空櫃');
// 7 PDU 數 3、PSU 4 顆 → psu 違規
const pin3 = allocate(items, 0.8, {}, { ...DEFAULT_CFG, pduCount: 3 });
const big = items.filter(i => i.psuCount > 3);
if (big.length) {
  const id = items.indexOf(big[0]) + '-0';
  const p = allocate(items, 0.8, { [id]: pin3.racks[0].unit }, { ...DEFAULT_CFG, pduCount: 3 });
  ok(p.racks[0].violations.some(v => v.type === 'psu'), 'PSU 顆數 > PDU 數 → psu 違規');
  ok(pin3.unplaced.some(u => /超過每櫃 3 個 PDU/.test(u.reason)), '自動排櫃：PSU > PDU 數列為無法放置');
}
console.log(`config.test.js 通過 ${n} 項 ← ${path.basename(file)}`);
