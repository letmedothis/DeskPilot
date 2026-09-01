import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import Database from 'better-sqlite3';
import started from 'electron-squirrel-startup';

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
}

let database;

const initializeDatabase = () => {
  database = new Database(path.join(app.getPath('userData'), 'deskpilot.db'));
  database.pragma('journal_mode = WAL');
  database.exec(`CREATE TABLE IF NOT EXISTS notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT '项目规划',
    content TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at TEXT,
    source_type TEXT,
    source_ref TEXT
  )`);
  const columns = database.prepare('PRAGMA table_info(notes)').all();
  if (!columns.some((column) => column.name === 'deleted_at')) {
    database.exec('ALTER TABLE notes ADD COLUMN deleted_at TEXT');
  }
  if (!columns.some((column) => column.name === 'source_type')) database.exec('ALTER TABLE notes ADD COLUMN source_type TEXT');
  if (!columns.some((column) => column.name === 'source_ref')) database.exec('ALTER TABLE notes ADD COLUMN source_ref TEXT');
  database.exec(`CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(
    title, category, content,
    content='notes', content_rowid='id',
    tokenize='unicode61'
  )`);
  database.exec(`
    CREATE TRIGGER IF NOT EXISTS notes_ai AFTER INSERT ON notes BEGIN
      INSERT INTO notes_fts(rowid, title, category, content) VALUES (new.id, new.title, new.category, new.content);
    END;
    CREATE TRIGGER IF NOT EXISTS notes_au AFTER UPDATE ON notes BEGIN
      INSERT INTO notes_fts(notes_fts, rowid, title, category, content) VALUES ('delete', old.id, old.title, old.category, old.content);
      INSERT INTO notes_fts(rowid, title, category, content) VALUES (new.id, new.title, new.category, new.content);
    END;
    CREATE TRIGGER IF NOT EXISTS notes_ad AFTER DELETE ON notes BEGIN
      INSERT INTO notes_fts(notes_fts, rowid, title, category, content) VALUES ('delete', old.id, old.title, old.category, old.content);
    END;
  `);
  database.prepare("INSERT INTO notes_fts(notes_fts) VALUES ('rebuild')").run();
  const count = database.prepare('SELECT COUNT(*) AS count FROM notes').get().count;
  if (count === 0) {
    const insert = database.prepare('INSERT INTO notes (title, category, content) VALUES (?, ?, ?)');
    insert.run('DeskPilot 项目规划', '项目规划', '# DeskPilot 项目规划\n\nDeskPilot 是一个面向开发者的本地优先知识管理工作台。');
    insert.run('Electron 安全通信笔记', '技术学习', '# Electron 安全通信笔记\n\n通过 preload 暴露最小化 API，使用 IPC 在主进程和渲染进程之间传递数据。');
    insert.run('产品使用说明', '项目规划', '# 产品使用说明\n\n记录功能说明、使用方法和后续改进计划。');
  }
};

ipcMain.handle('notes:list', () => database.prepare('SELECT id, title, category, content, source_type, updated_at AS updated FROM notes WHERE deleted_at IS NULL ORDER BY datetime(updated_at) DESC').all());
ipcMain.handle('notes:list-deleted', () => database.prepare('SELECT id, title, category, content, source_type, deleted_at AS deleted FROM notes WHERE deleted_at IS NOT NULL ORDER BY datetime(deleted_at) DESC').all());
ipcMain.handle('notes:search', (_, query) => {
  if (typeof query !== 'string' || !query.trim()) return database.prepare('SELECT id, title, category, content, source_type, updated_at AS updated FROM notes WHERE deleted_at IS NULL ORDER BY datetime(updated_at) DESC').all();
  const terms = query.trim().split(/\s+/).map((term) => `"${term.replaceAll('"', '""')}"*`).join(' ');
  return database.prepare(`SELECT n.id, n.title, n.category, n.content, n.updated_at AS updated
    FROM notes_fts f JOIN notes n ON n.id = f.rowid
    WHERE notes_fts MATCH ? AND n.deleted_at IS NULL
    ORDER BY rank, datetime(n.updated_at) DESC`).all(terms);
});
ipcMain.handle('notes:create', (_, note) => {
  const title = typeof note?.title === 'string' && note.title.trim() ? note.title.trim() : '未命名笔记';
  const category = typeof note?.category === 'string' && note.category.trim() ? note.category.trim() : '项目规划';
  const content = typeof note?.content === 'string' ? note.content : '';
  const result = database.prepare('INSERT INTO notes (title, category, content, updated_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)').run(title, category, content);
  return database.prepare('SELECT id, title, category, content, source_type, updated_at AS updated FROM notes WHERE id = ?').get(result.lastInsertRowid);
});
const importFilePath = async (filePath) => {
  const extension = path.extname(filePath).toLowerCase();
  if (!['.md', '.markdown', '.txt', '.json'].includes(extension)) throw new Error('不支持的文件类型');
  const file = await readFile(filePath);
  if (file.byteLength > 5 * 1024 * 1024) throw new Error('文件不能超过 5 MB');
  const title = path.basename(filePath, extension).trim() || '导入笔记';
  const content = file.toString('utf8');
  const existing = database.prepare('SELECT id, deleted_at FROM notes WHERE source_type = ? AND source_ref = ? ORDER BY id DESC LIMIT 1').get('file', filePath);
  if (existing) {
    if (existing.deleted_at) database.prepare('UPDATE notes SET deleted_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(existing.id);
    return database.prepare('SELECT id, title, category, content, source_type, updated_at AS updated FROM notes WHERE id = ?').get(existing.id);
  }
  const insert = database.prepare('INSERT INTO notes (title, category, content, updated_at, source_type, source_ref) VALUES (?, ?, ?, CURRENT_TIMESTAMP, ?, ?)').run(title, '文件导入', content, 'file', filePath);
  return database.prepare('SELECT id, title, category, content, source_type, updated_at AS updated FROM notes WHERE id = ?').get(insert.lastInsertRowid);
};
ipcMain.handle('notes:import-file', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [{ name: '文档', extensions: ['md', 'markdown', 'txt', 'json'] }],
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return importFilePath(result.filePaths[0]);
});
ipcMain.handle('notes:import-dropped-file', (_, filePath) => {
  if (typeof filePath !== 'string' || !path.isAbsolute(filePath)) throw new Error('无效的文件路径');
  return importFilePath(filePath);
});
ipcMain.handle('notes:import-url', async (_, rawUrl) => {
  if (typeof rawUrl !== 'string' || !rawUrl.trim()) throw new Error('请输入网页地址');
  let target;
  try { target = new URL(rawUrl.trim()); } catch { throw new Error('网页地址格式无效'); }
  if (!['http:', 'https:'].includes(target.protocol)) throw new Error('只支持 HTTP 或 HTTPS 地址');
  const hostname = target.hostname.toLowerCase();
  const isPrivateHost = hostname === 'localhost' || hostname === '::1' || hostname === '0.0.0.0' || hostname === '127.0.0.1' || hostname.startsWith('10.') || hostname.startsWith('192.168.') || /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname);
  if (isPrivateHost) throw new Error('不允许导入本地或内网地址');
  const response = await fetch(target, { signal: AbortSignal.timeout(15000), headers: { Accept: 'text/html,text/plain' } });
  if (!response.ok) throw new Error(`网页请求失败（${response.status}）`);
  const type = response.headers.get('content-type') || '';
  if (!type.includes('text/html') && !type.includes('text/plain')) throw new Error('该地址不是可导入的文本网页');
  const length = Number(response.headers.get('content-length') || 0);
  if (length > 10 * 1024 * 1024) throw new Error('网页内容不能超过 10 MB');
  const source = await response.text();
  if (Buffer.byteLength(source, 'utf8') > 10 * 1024 * 1024) throw new Error('网页内容不能超过 10 MB');
  const content = type.includes('text/html')
    ? source.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<[^>]+>/gi, ' ').replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/\s{2,}/g, ' ').trim()
    : source.trim();
  if (!content) throw new Error('网页没有可导入的文本内容');
  const title = target.hostname || '网页笔记';
  const existing = database.prepare('SELECT id, deleted_at FROM notes WHERE source_type = ? AND source_ref = ? ORDER BY id DESC LIMIT 1').get('url', target.href);
  if (existing) {
    if (existing.deleted_at) database.prepare('UPDATE notes SET deleted_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(existing.id);
    return database.prepare('SELECT id, title, category, content, source_type, updated_at AS updated FROM notes WHERE id = ?').get(existing.id);
  }
  const insert = database.prepare('INSERT INTO notes (title, category, content, updated_at, source_type, source_ref) VALUES (?, ?, ?, CURRENT_TIMESTAMP, ?, ?)').run(title, '网页导入', content, 'url', target.href);
  return database.prepare('SELECT id, title, category, content, source_type, updated_at AS updated FROM notes WHERE id = ?').get(insert.lastInsertRowid);
});
ipcMain.handle('notes:update', (_, note) => {
  if (!Number.isInteger(note?.id)) throw new Error('无效的笔记 ID');
  const title = typeof note.title === 'string' && note.title.trim() ? note.title.trim() : '未命名笔记';
  const category = typeof note.category === 'string' && note.category.trim() ? note.category.trim() : '项目规划';
  const content = typeof note.content === 'string' ? note.content : '';
  const result = database.prepare('UPDATE notes SET title = ?, category = ?, content = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(title, category, content, note.id);
  if (result.changes === 0) throw new Error('笔记不存在');
  return database.prepare('SELECT id, title, category, content, source_type, updated_at AS updated FROM notes WHERE id = ?').get(note.id);
});
ipcMain.handle('notes:delete', (_, id) => {
  if (!Number.isInteger(id)) throw new Error('无效的笔记 ID');
  const result = database.prepare('UPDATE notes SET deleted_at = CURRENT_TIMESTAMP WHERE id = ? AND deleted_at IS NULL').run(id);
  if (result.changes === 0) throw new Error('笔记不存在');
  return true;
});
ipcMain.handle('notes:restore', (_, id) => {
  if (!Number.isInteger(id)) throw new Error('无效的笔记 ID');
  const result = database.prepare('UPDATE notes SET deleted_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND deleted_at IS NOT NULL').run(id);
  if (result.changes === 0) throw new Error('笔记不存在或未被删除');
  return database.prepare('SELECT id, title, category, content, source_type, updated_at AS updated FROM notes WHERE id = ?').get(id);
});
ipcMain.handle('notes:purge', (_, id) => {
  if (!Number.isInteger(id)) throw new Error('无效的笔记 ID');
  const result = database.prepare('DELETE FROM notes WHERE id = ? AND deleted_at IS NOT NULL').run(id);
  if (result.changes === 0) throw new Error('笔记不存在或未被删除');
  return true;
});
ipcMain.handle('notes:export', async () => {
  const result = await dialog.showSaveDialog({
    defaultPath: 'deskpilot-backup.json',
    filters: [{ name: 'DeskPilot 备份', extensions: ['json'] }],
  });
  if (result.canceled || !result.filePath) return false;
  const backup = {
    format: 'deskpilot-backup',
    version: 1,
    exportedAt: new Date().toISOString(),
    notes: database.prepare('SELECT title, category, content, created_at, updated_at, deleted_at, source_type, source_ref FROM notes ORDER BY id').all(),
  };
  await writeFile(result.filePath, JSON.stringify(backup, null, 2), 'utf8');
  return true;
});
ipcMain.handle('notes:restore-backup', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [{ name: 'DeskPilot 备份', extensions: ['json'] }],
  });
  if (result.canceled || result.filePaths.length === 0) return 0;
  const file = await readFile(result.filePaths[0]);
  if (file.byteLength > 20 * 1024 * 1024) throw new Error('备份文件不能超过 20 MB');
  let backup;
  try { backup = JSON.parse(file.toString('utf8')); } catch { throw new Error('备份文件格式无效'); }
  if (backup?.format !== 'deskpilot-backup' || backup.version !== 1 || !Array.isArray(backup.notes)) throw new Error('不支持的备份文件');
  const validNotes = backup.notes.filter((note) => typeof note?.title === 'string' && typeof note?.category === 'string' && typeof note?.content === 'string');
  const insert = database.prepare('INSERT INTO notes (title, category, content, created_at, updated_at, deleted_at, source_type, source_ref) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
  const restore = database.transaction((items) => { for (const note of items) insert.run(note.title.slice(0, 500), note.category.slice(0, 100), note.content, note.created_at || new Date().toISOString(), note.updated_at || new Date().toISOString(), typeof note.deleted_at === 'string' ? note.deleted_at : null, typeof note.source_type === 'string' ? note.source_type.slice(0, 20) : null, typeof note.source_ref === 'string' ? note.source_ref.slice(0, 2000) : null); });
  restore(validNotes);
  return validNotes.length;
});

const createWindow = () => {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 1360,
    height: 820,
    minWidth: 1080,
    minHeight: 680,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // and load the index.html of the app.
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`));
  }

};

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  initializeDatabase();
  createWindow();

  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and import them here.
