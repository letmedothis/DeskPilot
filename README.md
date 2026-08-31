# DeskPilot

DeskPilot 是一个面向开发者的本地优先知识管理工作台。它将笔记、项目文档和代码片段集中在一个轻量的桌面应用中，支持离线使用，并为后续的全文检索和 AI 辅助功能提供基础。

## 当前功能

- 深色桌面端界面
- 笔记列表、分类和搜索过滤
- 新建笔记与编辑内容
- SQLite 本地持久化
- 通过 preload 和 IPC 在渲染进程与主进程之间安全通信
- 首次运行自动创建示例数据

## 技术栈

- Electron
- Vite
- 原生 JavaScript
- SQLite（better-sqlite3）

## 开发

安装依赖：

```bash
npm install
```

启动开发环境：

```bash
npm start
```

构建应用：

```bash
npm run package
```

## 数据存储

应用使用 SQLite 保存笔记数据，数据库文件位于 Electron 用户数据目录下，文件名为 `deskpilot.db`。应用首次启动时会自动创建数据库表和示例笔记。

## 项目结构

```text
src/
├── main.js       # Electron 主进程、窗口和数据库
├── preload.js    # 安全暴露给渲染进程的 API
├── renderer.js   # 界面和交互逻辑
└── index.css     # 应用样式
```

## 计划中的功能

- Markdown 编辑与预览
- SQLite FTS5 全文检索
- 文件和网页内容导入
- 数据导出与备份恢复
- 基于本地文档的 AI 总结与问答
- 代码片段管理

## License

MIT
