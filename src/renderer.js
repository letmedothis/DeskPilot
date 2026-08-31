/**
 * This file will automatically be loaded by vite and run in the "renderer" context.
 * To learn more about the differences between the "main" and the "renderer" context in
 * Electron, visit:
 *
 * https://electronjs.org/docs/tutorial/process-model
 *
 * By default, Node.js integration in this file is disabled. When enabling Node.js integration
 * in a renderer process, please be aware of potential security implications. You can read
 * more about security risks here:
 *
 * https://electronjs.org/docs/tutorial/security
 *
 * To enable Node.js integration in this file, open up `main.js` and enable the `nodeIntegration`
 * flag:
 *
 * ```
 *  // Create the browser window.
 *  mainWindow = new BrowserWindow({
 *    width: 800,
 *    height: 600,
 *    webPreferences: {
 *      nodeIntegration: true
 *    }
 *  });
 * ```
 */

import './index.css';

let notes = [
  {
    id: 1,
    title: 'DeskPilot 项目规划',
    category: '项目规划',
    updated: '刚刚',
    content: `# DeskPilot 项目规划

DeskPilot 是一个面向开发者的本地优先 AI 工作台。

## 项目目标

将笔记、代码片段、项目文档和 AI 助手放在一个安静、专注的桌面空间里。

## 下一步

- 完成 SQLite 数据层
- 增加 Markdown 编辑器
- 接入文档全文检索
- 添加基于文档的 AI 问答`,
  },
  {
    id: 2,
    title: 'Electron 安全通信笔记',
    category: '技术学习',
    updated: '昨天',
    content: '# Electron 安全通信笔记\n\n通过 preload 暴露最小化 API，使用 IPC 在主进程和渲染进程之间传递数据。',
  },
  {
    id: 3,
    title: '产品使用说明',
    category: '项目规划',
    updated: '8 月 28 日',
    content: '# 产品使用说明\n\n记录功能说明、使用方法和后续改进计划。',
  },
];

let activeNoteId = 1;
let searchTerm = '';
const storage = window.deskPilot?.notes;

const app = document.querySelector('#app');

function render() {
  const activeNote = notes.find((note) => note.id === activeNoteId) ?? notes[0];
  const visibleNotes = notes.filter((note) =>
    `${note.title} ${note.category}`.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  app.innerHTML = `
    <div class="shell">
      <aside class="sidebar">
        <div class="brand"><div class="brand-mark">D</div><div><strong>DeskPilot</strong><span>Developer workspace</span></div></div>
        <button class="new-note" id="new-note"><span>＋</span> 新建笔记 <kbd>⌘ N</kbd></button>
        <nav class="nav"><a class="nav-item active"><span>▤</span> 我的笔记 <em>${notes.length}</em></a><a class="nav-item"><span>◈</span> 收藏夹</a><a class="nav-item"><span>⌘</span> 代码片段</a><a class="nav-item"><span>◌</span> AI 助手<span class="soon">Soon</span></a></nav>
        <div class="section-label">工作区</div><div class="workspace-item"><span class="dot purple"></span> 项目规划 <span class="count">12</span></div><div class="workspace-item"><span class="dot blue"></span> 技术学习 <span class="count">8</span></div><div class="workspace-item"><span class="dot orange"></span> 日常记录 <span class="count">5</span></div>
        <div class="sidebar-bottom"><div class="storage"><div><span>本地存储</span><span>24%</span></div><div class="progress"><i></i></div><small>1.2 GB / 5 GB</small></div><div class="profile"><div class="avatar">L</div><div><strong>LetMeDoThis</strong><span>离线模式</span></div><span class="more">•••</span></div></div>
      </aside>
      <main class="main"><header class="topbar"><div class="breadcrumb">我的笔记 <span>/</span> ${activeNote.category}</div><div class="top-actions"><label class="search"><span>⌕</span><input id="search" placeholder="搜索笔记..." value="${searchTerm}"/><kbd>⌘ K</kbd></label><button class="icon-button">☼</button><button class="icon-button">⚙</button></div></header>
        <section class="content"><div class="list-panel"><div class="list-heading"><div><h1>我的笔记</h1><p>捕捉想法，整理知识</p></div><button class="filter">最近更新⌄</button></div><div class="note-list">${visibleNotes.map((note) => `<button class="note-card ${note.id === activeNoteId ? 'selected' : ''}" data-note-id="${note.id}"><div class="note-card-top"><span class="note-icon">✦</span><time>${note.updated}</time></div><strong>${note.title}</strong><span>${note.category}</span><div class="preview">${note.content.split('\n').filter(Boolean)[1] ?? ''}</div></button>`).join('')}</div></div>
        <article class="editor"><div class="editor-toolbar"><div class="status"><span class="saved-dot"></span> 已保存</div><div><button class="tool">⌁</button><button class="tool">⋮</button></div></div><div class="editor-body"><div class="editor-meta"><span class="tag">${activeNote.category}</span><time>最后编辑于 ${activeNote.updated}</time></div><textarea id="editor" spellcheck="false">${activeNote.content}</textarea></div></article></section>
      </main>
    </div>`;

  document.querySelectorAll('[data-note-id]').forEach((button) => button.addEventListener('click', () => { activeNoteId = Number(button.dataset.noteId); render(); }));
  document.querySelector('#search').addEventListener('input', (event) => { searchTerm = event.target.value; render(); const input = document.querySelector('#search'); input.focus(); input.setSelectionRange(searchTerm.length, searchTerm.length); });
  document.querySelector('#new-note').addEventListener('click', async () => { const note = { title: '未命名笔记', category: '项目规划', content: '# 未命名笔记\n\n开始记录你的想法...' }; const created = storage ? await storage.create(note) : { ...note, id: Date.now(), updated: '刚刚' }; notes.unshift(created); activeNoteId = created.id; searchTerm = ''; render(); });
  document.querySelector('#editor').addEventListener('input', (event) => { activeNote.content = event.target.value; document.querySelector('.status').innerHTML = '<span class="saved-dot saving"></span> 保存中...'; window.clearTimeout(activeNote.saveTimer); activeNote.saveTimer = window.setTimeout(async () => { if (storage) await storage.update(activeNote); document.querySelector('.status').innerHTML = '<span class="saved-dot"></span> 已保存'; }, 500); });
}

render();

if (storage) {
  storage.list().then((savedNotes) => {
    if (savedNotes.length > 0) {
      notes = savedNotes;
      activeNoteId = notes[0].id;
      render();
    }
  });
}
