## 问题根因

Vite 把 `better-sqlite3` 的 JavaScript 代码打包进了 `.vite/build/main.js`，导致运行时 `__dirname` 指向 `.vite/build/` 而非 `node_modules/better-sqlite3/lib/`，从而找不到 `.node` 原生文件。

## 修复步骤

1. **修改 `vite.main.config.mjs`** — 将 `better-sqlite3` 加入 Vite 的 external 列表，使其不被打包，运行时从 `node_modules/` 正确加载
2. **修改 `forge.config.js`** — 恢复 asar 启用 + 添加 asarUnpack 配置
3. **重新打包** — 运行 `npm run make` 生成可运行的 exe