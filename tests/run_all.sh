#!/bin/bash
# 執行全部測試（兩份 html 各跑一次，另跑 index2.html 的設定測試）。用法：bash tests/run_all.sh
set -u
cd "$(dirname "${BASH_SOURCE[0]}")/.." || exit 1
fail=0
for f in "機櫃配置圖_預估最大功耗.html" "機櫃配置圖_額定功率.html"; do
  for t in pins freeze; do
    echo "== ${t}.test.js ← ${f}"
    node "tests/${t}.test.js" "${f}" || fail=1
  done
done
echo "== config.test.js ← index2.html"
node tests/config.test.js index2.html || fail=1
if [ "${fail}" -eq 0 ]; then echo "全部測試通過"; else echo "有測試失敗"; fi
exit "${fail}"
