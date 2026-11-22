// 測試共用：把 html 內 <script id="logic"> 抽出，用 Node vm 執行（不需瀏覽器）。
const fs = require('fs'), vm = require('vm'), path = require('path');
const ROOT = path.join(__dirname, '..');
const CSV = path.join(ROOT, '機櫃配置範例-1151120.csv');
const HTML = {
  estimated: path.join(ROOT, '機櫃配置圖_預估最大功耗.html'),
  rated: path.join(ROOT, '機櫃配置圖_額定功率.html'),
};
module.exports = function load(file) {
  const ctx = {};
  vm.createContext(ctx);
  const code = fs.readFileSync(file, 'utf8').match(/<script id="logic">([\s\S]*?)<\/script>/)[1];
  vm.runInContext(code + ';this.parseCSV=parseCSV;this.allocate=allocate;this.snapshotPins=snapshotPins;this.BASIS=BASIS;', ctx);
  const items = ctx.parseCSV(fs.readFileSync(CSV, 'utf8'));
  return { ctx, items };
};
module.exports.HTML = HTML;
