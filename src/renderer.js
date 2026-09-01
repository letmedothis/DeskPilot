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

DeskPilot 是一个面向开发者的本地优先知识管理工作台。

## 项目目标

将笔记、代码片段和项目文档放在一个安静、专注的桌面空间里。

## 下一步

- 完成 SQLite 数据层
- 增加 Markdown 编辑器
- 接入文档全文检索` ,
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
let editorMode = 'edit';
let saveTimer;
let currentView = 'notes';
let deletedNotes = [];
let searchTimer;
let theme = localStorage.getItem('deskpilot-theme') || 'dark';
let selectedCategory = '';
let settingsOpen = false;
const storage = window.deskPilot?.notes;

const app = document.querySelector('#app');

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[character]);
}

function markdownToHtml(markdown) {
  const inline = (value) => escapeHtml(value)
    .replace(/`([^`\n]+)`/g, '<code>$1</code>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/~~([^~]+)~~/g, '<del>$1</del>');
  const blocks = [];
  const paragraph = [];
  const flushParagraph = () => {
    if (paragraph.length) blocks.push(`<p>${inline(paragraph.join('\n')).replace(/\n/g, '<br>')}</p>`);
    paragraph.length = 0;
  };
  const lines = String(markdown).split('\n');
  let codeLines = null;
  for (const line of lines) {
    if (/^```/.test(line)) {
      if (codeLines) blocks.push(`<pre><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`);
      else flushParagraph();
      codeLines = codeLines ? null : [];
    } else if (codeLines) {
      codeLines.push(line);
    } else if (!line.trim()) {
      flushParagraph();
    } else if (/^### (.+)$/.test(line)) {
      flushParagraph(); blocks.push(`<h3>${inline(line.slice(4))}</h3>`);
    } else if (/^## (.+)$/.test(line)) {
      flushParagraph(); blocks.push(`<h2>${inline(line.slice(3))}</h2>`);
    } else if (/^# (.+)$/.test(line)) {
      flushParagraph(); blocks.push(`<h1>${inline(line.slice(2))}</h1>`);
    } else if (/^[-*] (.+)$/.test(line)) {
      flushParagraph(); blocks.push(`<ul><li>${inline(line.slice(2))}</li></ul>`);
    } else if (/^\d+\. (.+)$/.test(line)) {
      flushParagraph(); blocks.push(`<ol><li>${inline(line.replace(/^\d+\. /, ''))}</li></ol>`);
    } else {
      paragraph.push(line);
    }
  }
  if (codeLines) blocks.push(`<pre><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`);
  flushParagraph();
  return blocks.join('').replace(/<\/ul><ul>/g, '').replace(/<\/ol><ol>/g, '');
}

function setSaveStatus(text, state = '') {
  const status = document.querySelector('.status');
  if (status) status.innerHTML = `<span class="saved-dot ${state}"></span> ${text}`;
}

function selectNextNote() {
  const currentIndex = notes.findIndex((note) => note.id === activeNoteId);
  activeNoteId = notes[currentIndex >= 0 && currentIndex < notes.length - 1 ? currentIndex + 1 : 0]?.id;
}

function categoryCount(category) {
  return notes.filter((note) => note.category === category).length;
}

function setTheme(nextTheme) {
  theme = nextTheme;
  document.documentElement.dataset.theme = theme;
  localStorage.setItem('deskpilot-theme', theme);
}

function render() {
  const activeNote = notes.find((note) => note.id === activeNoteId && (!selectedCategory || note.category === selectedCategory))
    ?? notes.find((note) => !selectedCategory || note.category === selectedCategory);
  const sourceNotes = currentView === 'trash' ? deletedNotes : notes;
  const visibleNotes = currentView === 'trash' ? sourceNotes.filter((note) =>
    `${note.title} ${note.category} ${note.content}`.toLowerCase().includes(searchTerm.toLowerCase()),
  ) : sourceNotes.filter((note) => !selectedCategory || note.category === selectedCategory);

  app.innerHTML = `
    <div class="shell">
      <aside class="sidebar">
        <div class="brand"><div class="brand-mark">D</div><div><strong>DeskPilot</strong><span>Developer workspace</span></div></div>
        <button class="new-note" id="new-note"><span>＋</span> 新建笔记 <kbd>⌘ N</kbd></button><button class="import-note" id="import-note"><span>↥</span> 导入文件</button><button class="import-note" id="import-url"><span>↗</span> 导入网页</button>
        <nav class="nav"><a class="nav-item ${currentView === 'notes' ? 'active' : ''}" id="notes-view"><span>▤</span> 我的笔记 <em>${notes.length}</em></a><a class="nav-item"><span>◈</span> 收藏夹</a><a class="nav-item"><span>⌘</span> 代码片段</a><a class="nav-item ${currentView === 'trash' ? 'active' : ''}" id="trash-view"><span>⌫</span> 回收站 <em>${deletedNotes.length}</em></a></nav>
        <div class="section-label">工作区</div><button class="workspace-item ${selectedCategory === '项目规划' ? 'active' : ''}" data-category="项目规划"><span class="dot purple"></span> 项目规划 <span class="count">${categoryCount('项目规划')}</span></button><button class="workspace-item ${selectedCategory === '技术学习' ? 'active' : ''}" data-category="技术学习"><span class="dot blue"></span> 技术学习 <span class="count">${categoryCount('技术学习')}</span></button><button class="workspace-item ${selectedCategory === '日常记录' ? 'active' : ''}" data-category="日常记录"><span class="dot orange"></span> 日常记录 <span class="count">${categoryCount('日常记录')}</span></button>
        <div class="sidebar-bottom"><div class="storage"><div><span>本地存储</span><span>24%</span></div><div class="progress"><i></i></div><small>1.2 GB / 5 GB</small></div><div class="backup-actions"><button id="export-backup">导出备份</button><button id="restore-backup">恢复备份</button></div><div class="profile"><div class="avatar">L</div><div><strong>LetMeDoThis</strong><span>离线模式</span></div><span class="more">•••</span></div></div>
      </aside>
      <main class="main"><header class="topbar"><div class="breadcrumb">${currentView === 'trash' ? '回收站' : '我的笔记'} ${activeNote && currentView === 'notes' ? `<span>/</span> ${escapeHtml(activeNote.category)}` : ''}</div><div class="top-actions"><label class="search"><span>⌕</span><input id="search" placeholder="搜索笔记..." value="${escapeHtml(searchTerm)}"/><kbd>⌘ K</kbd></label><button class="icon-button" id="theme-toggle" title="切换主题">${theme === 'dark' ? '☼' : '☾'}</button><button class="icon-button" id="settings-toggle" title="设置">⚙</button></div></header>
        <section class="content"><div class="list-panel"><div class="list-heading"><div><h1>${currentView === 'trash' ? '回收站' : '我的笔记'}</h1><p>${currentView === 'trash' ? '已删除的笔记可以恢复或彻底清除' : '捕捉想法，整理知识'}</p></div><button class="filter">最近更新⌄</button></div><div class="note-list">${visibleNotes.length ? visibleNotes.map((note) => `<div class="note-card ${note.id === activeNoteId && currentView === 'notes' ? 'selected' : ''}"><div class="note-card-top"><span class="note-icon">✦</span><time>${escapeHtml(note.updated ?? note.deleted)}</time></div><strong>${escapeHtml(note.title)}</strong><span>${escapeHtml(note.category)}</span><div class="preview">${escapeHtml(note.content.split('\n').filter(Boolean)[1] ?? '')}</div>${currentView === 'trash' ? `<div class="trash-actions"><button class="restore-note" data-restore-id="${note.id}">恢复笔记</button><button class="purge-note" data-purge-id="${note.id}">彻底删除</button></div>` : `<button class="note-select" data-note-id="${note.id}" aria-label="打开笔记"></button>`}</div>`).join('') : `<div class="empty-state">${currentView === 'trash' ? '回收站为空' : '没有找到匹配的笔记'}</div>`}</div></div>
        <article class="editor">${currentView === 'notes' && activeNote ? `<div class="editor-toolbar"><div class="status"><span class="saved-dot"></span> 已保存</div><div class="editor-actions"><button class="delete-note" id="delete-note">删除</button><div class="mode-switch"><button class="mode ${editorMode === 'edit' ? 'active' : ''}" data-mode="edit">编辑</button><button class="mode ${editorMode === 'preview' ? 'active' : ''}" data-mode="preview">预览</button></div></div></div><div class="editor-body"><div class="editor-meta"><input class="title-input" id="title" value="${escapeHtml(activeNote.title)}" aria-label="笔记标题"/><input class="category-input" id="category" value="${escapeHtml(activeNote.category)}" aria-label="笔记分类"/><time>最后编辑于 ${escapeHtml(activeNote.updated)}</time>${activeNote.source_type ? `<small class="source-label">来源：${escapeHtml(activeNote.source_type === 'url' ? '网页' : '文件')}</small>` : ''}</div>${editorMode === 'edit' ? `<textarea id="editor" spellcheck="false">${escapeHtml(activeNote.content)}</textarea>` : `<div class="markdown-preview">${markdownToHtml(activeNote.content)}</div>`}</div>` : '<div class="empty-editor">暂无可编辑笔记<br><small>从左侧选择一条笔记</small></div>'}</article></section>
      </main>
      ${settingsOpen ? `<div class="settings-backdrop" id="settings-backdrop"><section class="settings-panel" role="dialog" aria-modal="true" aria-labelledby="settings-title"><div class="settings-heading"><div><h2 id="settings-title">设置</h2><p>DeskPilot 的本地应用设置</p></div><button class="settings-close" id="settings-close" aria-label="关闭设置">×</button></div><label class="settings-row"><span><strong>外观主题</strong><small>当前：${theme === 'dark' ? '深色' : '浅色'}</small></span><button class="settings-theme" id="settings-theme">${theme === 'dark' ? '切换浅色' : '切换深色'}</button></label><div class="settings-row settings-info"><span><strong>数据存储</strong><small>笔记保存在本机，支持离线使用</small></span></div><div class="settings-footer">数据备份请使用侧边栏的“导出备份”功能。</div></section></div>` : ''}
    </div>`;

  document.querySelectorAll('[data-note-id]').forEach((button) => button.addEventListener('click', () => { activeNoteId = Number(button.dataset.noteId); render(); }));
  document.querySelectorAll('[data-restore-id]').forEach((button) => button.addEventListener('click', async () => { try { const id = Number(button.dataset.restoreId); const restored = storage ? await storage.restore(id) : deletedNotes.find((note) => note.id === id); deletedNotes = deletedNotes.filter((note) => note.id !== id); if (restored) notes.unshift(restored); render(); } catch (error) { console.error(error); } }));
  document.querySelectorAll('[data-purge-id]').forEach((button) => button.addEventListener('click', async () => { const id = Number(button.dataset.purgeId); if (!window.confirm('彻底删除后将无法恢复，确定继续吗？')) return; try { if (storage) await storage.purge(id); deletedNotes = deletedNotes.filter((note) => note.id !== id); render(); } catch (error) { console.error(error); } }));
  document.querySelector('#search').addEventListener('input', (event) => { searchTerm = event.target.value; render(); const input = document.querySelector('#search'); input.focus(); input.setSelectionRange(searchTerm.length, searchTerm.length); if (storage && currentView === 'notes') { window.clearTimeout(searchTimer); searchTimer = window.setTimeout(async () => { notes = await storage.search(searchTerm); activeNoteId = notes.find((note) => note.id === activeNoteId)?.id ?? notes[0]?.id; render(); }, 250); } });
  document.querySelector('#theme-toggle').addEventListener('click', () => { setTheme(theme === 'dark' ? 'light' : 'dark'); render(); });
  document.querySelector('#settings-toggle').addEventListener('click', () => { settingsOpen = true; render(); });
  document.querySelector('#settings-close')?.addEventListener('click', () => { settingsOpen = false; render(); });
  document.querySelector('#settings-backdrop')?.addEventListener('click', (event) => { if (event.target.id === 'settings-backdrop') { settingsOpen = false; render(); } });
  document.querySelector('#settings-theme')?.addEventListener('click', () => { setTheme(theme === 'dark' ? 'light' : 'dark'); render(); });
  document.querySelectorAll('[data-category]').forEach((button) => button.addEventListener('click', async () => { selectedCategory = selectedCategory === button.dataset.category ? '' : button.dataset.category; currentView = 'notes'; searchTerm = ''; if (storage) notes = await storage.list(); activeNoteId = notes.find((note) => !selectedCategory || note.category === selectedCategory)?.id; render(); }));
  document.querySelector('#new-note').addEventListener('click', async () => { const note = { title: '未命名笔记', category: '项目规划', content: '# 未命名笔记\n\n开始记录你的想法...' }; const created = storage ? await storage.create(note) : { ...note, id: Date.now(), updated: '刚刚' }; notes.unshift(created); activeNoteId = created.id; currentView = 'notes'; searchTerm = ''; render(); });
  document.querySelector('#import-note').addEventListener('click', async () => { try { const imported = storage ? await storage.importFile() : null; if (imported) { notes.unshift(imported); activeNoteId = imported.id; currentView = 'notes'; searchTerm = ''; render(); } } catch (error) { console.error(error); window.alert(error.message || '导入失败，请重试'); } });
  document.querySelector('.editor')?.addEventListener('dragover', (event) => { event.preventDefault(); event.currentTarget.classList.add('drop-target'); });
  document.querySelector('.editor')?.addEventListener('dragleave', (event) => { if (!event.currentTarget.contains(event.relatedTarget)) event.currentTarget.classList.remove('drop-target'); });
  document.querySelector('.editor')?.addEventListener('drop', async (event) => { event.preventDefault(); event.currentTarget.classList.remove('drop-target'); const file = event.dataTransfer.files[0]; if (!file || !storage) return; try { const imported = await storage.importDroppedFile(file); if (imported) { notes.unshift(imported); activeNoteId = imported.id; currentView = 'notes'; searchTerm = ''; render(); } } catch (error) { console.error(error); window.alert(error.message || '拖拽导入失败，请重试'); } });
  document.querySelector('#import-url').addEventListener('click', async () => { const url = window.prompt('输入网页地址（HTTP/HTTPS）'); if (!url) return; try { const imported = storage ? await storage.importUrl(url) : null; if (imported) { notes.unshift(imported); activeNoteId = imported.id; currentView = 'notes'; searchTerm = ''; render(); } } catch (error) { console.error(error); window.alert(error.message || '网页导入失败，请重试'); } });
  document.querySelector('#export-backup').addEventListener('click', async () => { try { if (storage && await storage.exportBackup()) window.alert('备份导出成功'); } catch (error) { console.error(error); window.alert(error.message || '导出失败，请重试'); } });
  document.querySelector('#restore-backup').addEventListener('click', async () => { try { if (!storage) return; const count = await storage.restoreBackup(); if (count > 0) { notes = await storage.list(); deletedNotes = await storage.listDeleted(); activeNoteId = notes[0]?.id; currentView = 'notes'; render(); window.alert(`已恢复 ${count} 条笔记`); } } catch (error) { console.error(error); window.alert(error.message || '恢复失败，请重试'); } });
  document.querySelector('#trash-view').addEventListener('click', async () => { currentView = 'trash'; searchTerm = ''; if (storage) deletedNotes = await storage.listDeleted(); render(); });
  document.querySelector('#notes-view').addEventListener('click', async () => { currentView = 'notes'; searchTerm = ''; selectedCategory = ''; if (storage) notes = await storage.list(); activeNoteId = notes[0]?.id; render(); });
  document.querySelector('#delete-note')?.addEventListener('click', async () => { if (!activeNote || !window.confirm('确定删除这条笔记吗？')) return; try { if (storage) await storage.delete(activeNote.id); notes = notes.filter((note) => note.id !== activeNote.id); selectNextNote(); render(); } catch (error) { console.error(error); setSaveStatus('删除失败，请重试', 'error'); } });
  document.querySelectorAll('[data-mode]').forEach((button) => button.addEventListener('click', () => { editorMode = button.dataset.mode; render(); }));
  const save = () => { setSaveStatus('保存中...', 'saving'); window.clearTimeout(saveTimer); saveTimer = window.setTimeout(async () => { try { const saved = storage ? await storage.update(activeNote) : { ...activeNote, updated: '刚刚' }; const index = notes.findIndex((note) => note.id === saved.id); if (index >= 0) notes[index] = saved; setSaveStatus('已保存'); } catch (error) { console.error(error); setSaveStatus('保存失败，请重试', 'error'); } }, 500); };
  ['title', 'category', 'editor'].forEach((field) => document.querySelector(`#${field}`)?.addEventListener('input', (event) => { activeNote[field === 'editor' ? 'content' : field] = event.target.value; save(); }));
}

setTheme(theme);
render();

window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && settingsOpen) { settingsOpen = false; render(); return; }
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); document.querySelector('#search')?.focus(); }
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'n') { event.preventDefault(); document.querySelector('#new-note')?.click(); }
});

if (storage) {
  storage.list().then((savedNotes) => {
    if (savedNotes.length > 0) {
      notes = savedNotes;
      activeNoteId = notes[0].id;
      render();
    }
  });
}
