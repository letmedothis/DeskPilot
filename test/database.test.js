import assert from 'node:assert/strict';
import test from 'node:test';
import Database from 'better-sqlite3';

function createDatabase() {
  const database = new Database(':memory:');
  database.exec(`
    CREATE TABLE notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      category TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      deleted_at TEXT
    );
    CREATE VIRTUAL TABLE notes_fts USING fts5(
      title, category, content, content='notes', content_rowid='id', tokenize='unicode61'
    );
    CREATE TRIGGER notes_ai AFTER INSERT ON notes BEGIN
      INSERT INTO notes_fts(rowid, title, category, content) VALUES (new.id, new.title, new.category, new.content);
    END;
    CREATE TRIGGER notes_au AFTER UPDATE ON notes BEGIN
      INSERT INTO notes_fts(notes_fts, rowid, title, category, content) VALUES ('delete', old.id, old.title, old.category, old.content);
      INSERT INTO notes_fts(rowid, title, category, content) VALUES (new.id, new.title, new.category, new.content);
    END;
    CREATE TRIGGER notes_ad AFTER DELETE ON notes BEGIN
      INSERT INTO notes_fts(notes_fts, rowid, title, category, content) VALUES ('delete', old.id, old.title, old.category, old.content);
    END;
  `);
  return database;
}

test('FTS5 searches title, category and content', () => {
  const database = createDatabase();
  const insert = database.prepare('INSERT INTO notes (title, category, content) VALUES (?, ?, ?)');
  insert.run('项目规划', '工作', '记录发布计划');
  insert.run('学习笔记', '技术', 'SQLite 本地数据库');
  const query = (term) => database.prepare(`SELECT n.id FROM notes_fts f JOIN notes n ON n.id = f.rowid WHERE notes_fts MATCH ?`).all(`"${term}"*`);
  assert.equal(query('SQLite').length, 1);
  assert.equal(query('项目').length, 1);
  assert.equal(query('技术').length, 1);
  database.close();
});

test('soft deleted notes stay out of active results and can be restored', () => {
  const database = createDatabase();
  const id = database.prepare('INSERT INTO notes (title, category, content) VALUES (?, ?, ?)').run('可恢复笔记', '测试', '正文').lastInsertRowid;
  database.prepare('UPDATE notes SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?').run(id);
  assert.equal(database.prepare('SELECT count(*) AS count FROM notes WHERE id = ? AND deleted_at IS NULL').get(id).count, 0);
  database.prepare('UPDATE notes SET deleted_at = NULL WHERE id = ?').run(id);
  assert.equal(database.prepare('SELECT count(*) AS count FROM notes WHERE id = ? AND deleted_at IS NULL').get(id).count, 1);
  database.close();
});

test('backup restore inserts records without reusing IDs', () => {
  const database = createDatabase();
  const insert = database.prepare('INSERT INTO notes (title, category, content) VALUES (?, ?, ?)');
  const originalId = insert.run('现有笔记', '项目', '原内容').lastInsertRowid;
  const restoredId = insert.run('备份笔记', '备份', '恢复内容').lastInsertRowid;
  assert.notEqual(originalId, restoredId);
  assert.equal(database.prepare('SELECT count(*) AS count FROM notes').get().count, 2);
  database.close();
});
