import { app, BrowserWindow, ipcMain } from 'electron';
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
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  const count = database.prepare('SELECT COUNT(*) AS count FROM notes').get().count;
  if (count === 0) {
    const insert = database.prepare('INSERT INTO notes (title, category, content) VALUES (?, ?, ?)');
    insert.run('DeskPilot 项目规划', '项目规划', '# DeskPilot 项目规划\n\nDeskPilot 是一个面向开发者的本地优先知识管理工作台。');
    insert.run('Electron 安全通信笔记', '技术学习', '# Electron 安全通信笔记\n\n通过 preload 暴露最小化 API，使用 IPC 在主进程和渲染进程之间传递数据。');
    insert.run('产品使用说明', '项目规划', '# 产品使用说明\n\n记录功能说明、使用方法和后续改进计划。');
  }
};

ipcMain.handle('notes:list', () => database.prepare('SELECT id, title, category, content, updated_at AS updated FROM notes ORDER BY datetime(updated_at) DESC').all());
ipcMain.handle('notes:create', (_, note) => {
  const result = database.prepare('INSERT INTO notes (title, category, content, updated_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)').run(note.title, note.category, note.content);
  return database.prepare('SELECT id, title, category, content, updated_at AS updated FROM notes WHERE id = ?').get(result.lastInsertRowid);
});
ipcMain.handle('notes:update', (_, note) => {
  database.prepare('UPDATE notes SET title = ?, category = ?, content = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(note.title, note.category, note.content, note.id);
  return true;
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
