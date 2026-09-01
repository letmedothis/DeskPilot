# DeskPilot 部署与发布

本文档整理本项目从本地开发到安装包发布的完整方法。

## 1. 环境要求

- Node.js 20 或更高版本
- npm 10 或更高版本
- 能访问 npm registry
- 首次打包通常还需要访问 GitHub 下载 Electron 或平台工具

安装依赖：

```bash
npm install
```

如果 npm 提示安装脚本待批准，需要允许 `better-sqlite3` 的安装脚本，否则原生 SQLite 模块可能无法重新编译。安装后可验证：

```bash
node -e "const Database=require('better-sqlite3'); const db=new Database(':memory:'); console.log(db.prepare('select 1 as ok').get()); db.close()"
```

## 2. 本地开发运行

```bash
npm start
```

这会启动 Electron Forge 的 Vite 开发环境，适合日常开发和交互验证。

运行测试：

```bash
npm test
```

## 3. 生成可运行目录

```bash
npm run package
```

该命令会先构建 main、preload 和 renderer bundle，再生成平台相关的应用目录，通常位于 `out/`。它适合内部测试和免安装分发。

## 4. 生成安装包

```bash
npm run make
```

当前 Forge 配置包含以下 maker：

| 平台 | 输出形式 | Maker |
| --- | --- | --- |
| Windows | Squirrel 安装包 | `maker-squirrel` |
| macOS | ZIP | `maker-zip` |
| Linux | Debian 包 | `maker-deb` |
| Linux | RPM 包 | `maker-rpm` |

Electron 原生模块和安装包应在目标平台构建。建议使用各平台 CI runner 分别执行，不要依赖跨平台本机构建。

## 5. 发布流程

发布前建议依次执行：

```bash
npm install
npm test
npm run package
npm run make
```

确认安装包可以启动、创建笔记、全文搜索、导入文件、导出备份和恢复备份后，再上传 `out/make/` 中的产物。

当前 `publish` 脚本仍未配置 publisher，因此不要直接执行：

```bash
npm run publish
```

如需自动发布，需要在 `forge.config.js` 中配置 GitHub、S3 或其他 publisher，并通过环境变量提供凭据。

## 6. 签名与自动更新

当前项目尚未配置代码签名和自动更新。正式发布前应补充：

- Windows 代码签名证书
- macOS Developer ID、notarization 和 hardened runtime
- Linux 包签名或仓库发布配置
- 自动更新服务和版本策略

未签名安装包适合内部测试，不建议作为正式生产分发版本。

## 7. 网络失败处理

如果出现：

```text
getaddrinfo EAI_AGAIN github.com
```

表示 Forge 下载外部资源时 DNS 或网络暂时不可用。可检查代理、DNS 和防火墙后重试。Vite bundle 可能已经构建成功，但这不代表完整安装包已经生成。

## 8. 数据迁移与用户数据

用户数据库位于 Electron `userData` 目录中的 `deskpilot.db`。升级应用前建议从应用内导出 JSON 备份。应用启动时会自动执行必要的字段迁移和 FTS5 索引初始化。

不要将用户数据库打包进安装包，也不要在卸载或升级流程中主动删除它。

## 9. 发布检查清单

- [ ] `npm install` 成功
- [ ] `npm test` 全部通过
- [ ] 原生 `better-sqlite3` 可以加载
- [ ] `npm run package` 完成
- [ ] `npm run make` 完成
- [ ] 安装包可以启动
- [ ] 新建、编辑、搜索和删除恢复正常
- [ ] 文件/网页导入正常
- [ ] 备份导出和恢复正常
- [ ] 已完成目标平台签名
- [ ] 已验证升级不会丢失 `deskpilot.db`
