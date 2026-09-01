# DeskPilot

DeskPilot 是一个本地优先的开发者知识管理工作台，用于整理笔记、项目文档和代码片段。数据默认保存在本机，支持离线使用。

## 当前功能

- 创建、编辑和预览 Markdown 笔记
- 编辑标题与分类
- SQLite 本地持久化
- SQLite FTS5 全文检索（标题、分类、正文）
- 笔记软删除、回收站恢复和彻底删除
- 导入 Markdown、纯文本和 JSON 文件
- 导入 HTTP/HTTPS 网页文本
- JSON 备份导出与合并恢复
- 安全的 preload + IPC 通信

## 技术栈

- Electron
- Electron Forge + Vite
- 原生 JavaScript
- SQLite / better-sqlite3

## 开发

部署、打包、签名和发布说明见 [DEPLOYMENT.md](DEPLOYMENT.md)。

安装依赖：

```bash
npm install
```

启动开发环境：

```bash
npm start
```

运行自动化测试：

```bash
npm test
```

构建生产 bundle 并尝试打包：

```bash
npm run package
```

注意：Forge 在打包时可能需要从 GitHub 下载 Electron 或平台工具；如果遇到 `getaddrinfo EAI_AGAIN github.com`，请检查网络或稍后重试。Vite bundle 构建本身仍会先完成。

## 数据与备份

数据库文件位于 Electron 用户数据目录：

```text
deskpilot.db
```

应用启动时会自动创建数据库、FTS5 索引和必要的触发器。删除采用软删除，普通列表和全文搜索不会展示回收站内容。

备份为 `deskpilot-backup.json`，包含普通笔记和回收站内容。恢复采用合并策略，不覆盖已有笔记，并为恢复内容生成新的 ID。

## 导入限制

- 文件导入：`.md`、`.markdown`、`.txt`、`.json`，单文件最大 5 MB
- 网页导入：仅 HTTP/HTTPS，HTML 或纯文本，单次响应最大 10 MB，超时 15 秒
- 网页导入会移除脚本和样式标签，并拒绝常见本地/内网地址

## 项目结构

```text
src/
├── main.js       # Electron 主进程、数据库、IPC 和文件/网页访问
├── preload.js    # 暴露给渲染进程的白名单 API
├── renderer.js   # 页面渲染和交互逻辑
└── index.css     # 全局样式
```

## 当前验证状态

- JavaScript 语法检查通过
- `npm test`：3 项数据层测试通过
- FTS5 SQL smoke test 通过
- `git diff --check` 通过
- Vite 生产构建通过
- 完整 Forge 打包可能受外部网络下载影响

## 后续计划

1. 文件拖拽导入和更完整的文本提取
2. 导入内容的来源元数据与去重
3. 组件拆分、自动化测试、数据库迁移和跨平台发布

## License

MIT
