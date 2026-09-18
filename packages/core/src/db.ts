// @ts-ignore: node:sqlite is built into Node 24
import { DatabaseSync } from 'node:sqlite';
import { resolve } from 'path';
import { mkdirSync } from 'fs';
import { env } from './config.js';
import { logger } from './logger.js';
import type {
  DbUser,
  DbProject,
  DbProjectStyle,
  DbGeneration,
  DbQaResult,
  DbRender,
  ProjectStatus,
  GenerationStatus,
  RenderStatus,
} from './types.js';

let _db: any = null;

export function getDb(): any {
  if (_db) return _db;

  const dbPath = resolve(env.storagePath, 'interior-bot.db');
  mkdirSync(resolve(env.storagePath), { recursive: true });

  _db = new DatabaseSync(dbPath);
  _db.exec('PRAGMA journal_mode = WAL;');
  _db.exec('PRAGMA foreign_keys = ON;');

  runMigrations(_db);
  logger.info('Database initialized', { path: dbPath });
  return _db;
}

function runMigrations(db: any): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      telegram_user_id INTEGER UNIQUE NOT NULL,
      username TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      telegram_user_id INTEGER NOT NULL,
      telegram_chat_id INTEGER NOT NULL,
      telegram_progress_message_id INTEGER,
      source_image TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'WAITING_IMAGE',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (telegram_user_id) REFERENCES users(telegram_user_id)
    );

    CREATE TABLE IF NOT EXISTS project_styles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id TEXT NOT NULL,
      style_id TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (project_id) REFERENCES projects(id),
      UNIQUE(project_id, style_id)
    );

    CREATE TABLE IF NOT EXISTS generations (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      style_id TEXT NOT NULL,
      attempt INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL DEFAULT 'PENDING',
      image_path TEXT,
      prompt TEXT,
      geometry_score REAL,
      geometry_report TEXT,
      error TEXT,
      started_at TEXT,
      finished_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (project_id) REFERENCES projects(id)
    );

    CREATE TABLE IF NOT EXISTS qa_results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      generation_id TEXT NOT NULL,
      passed INTEGER NOT NULL,
      score REAL NOT NULL,
      camera_score REAL,
      lines_score REAL,
      windows_score REAL,
      doors_score REAL,
      warnings TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (generation_id) REFERENCES generations(id)
    );

    CREATE TABLE IF NOT EXISTS renders (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDING',
      storyboard_path TEXT,
      output_path TEXT,
      duration_sec REAL,
      error TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (project_id) REFERENCES projects(id)
    );

    CREATE INDEX IF NOT EXISTS idx_projects_user ON projects(telegram_user_id);
    CREATE INDEX IF NOT EXISTS idx_generations_project ON generations(project_id);
    CREATE INDEX IF NOT EXISTS idx_generations_status ON generations(status);
  `);
}

// ---- Users ----

export function upsertUser(telegramUserId: number, username?: string): DbUser {
  const db = getDb();
  db.prepare(`
    INSERT INTO users (telegram_user_id, username)
    VALUES (?, ?)
    ON CONFLICT(telegram_user_id) DO UPDATE SET
      username = excluded.username,
      updated_at = datetime('now')
  `).run(telegramUserId, username ?? null);
  return db.prepare('SELECT * FROM users WHERE telegram_user_id = ?').get(telegramUserId) as DbUser;
}

// ---- Projects ----

export function createProject(params: {
  id: string;
  telegramUserId: number;
  telegramChatId: number;
  sourceImage: string;
}): DbProject {
  const db = getDb();
  db.prepare(`
    INSERT INTO projects (id, telegram_user_id, telegram_chat_id, source_image, status)
    VALUES (?, ?, ?, ?, 'WAITING_STYLES')
  `).run(params.id, params.telegramUserId, params.telegramChatId, params.sourceImage);
  return getProject(params.id)!;
}

export function getProject(id: string): DbProject | null {
  return getDb().prepare('SELECT * FROM projects WHERE id = ?').get(id) as DbProject | null;
}

export function updateProjectStatus(id: string, status: ProjectStatus): void {
  getDb().prepare(`
    UPDATE projects SET status = ?, updated_at = datetime('now') WHERE id = ?
  `).run(status, id);
}

export function updateProjectProgressMessage(id: string, messageId: number): void {
  getDb().prepare(`
    UPDATE projects SET telegram_progress_message_id = ?, updated_at = datetime('now') WHERE id = ?
  `).run(messageId, id);
}

export function getUnfinishedProjects(): DbProject[] {
  return getDb().prepare(`
    SELECT * FROM projects
    WHERE status NOT IN ('COMPLETED', 'FAILED')
    ORDER BY created_at ASC
  `).all() as DbProject[];
}

// ---- Project Styles ----

export function addProjectStyles(projectId: string, styleIds: string[]): void {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO project_styles (project_id, style_id, sort_order)
    VALUES (?, ?, ?)
  `);
  db.exec('BEGIN;');
  try {
    styleIds.forEach((id, i) => stmt.run(projectId, id, i));
    db.exec('COMMIT;');
  } catch (err) {
    db.exec('ROLLBACK;');
    throw err;
  }
}

export function getProjectStyles(projectId: string): DbProjectStyle[] {
  return getDb().prepare(`
    SELECT * FROM project_styles WHERE project_id = ? ORDER BY sort_order ASC
  `).all(projectId) as DbProjectStyle[];
}

// ---- Generations ----

export function createGeneration(params: {
  id: string;
  projectId: string;
  styleId: string;
  attempt: number;
  prompt: string;
}): DbGeneration {
  const db = getDb();
  db.prepare(`
    INSERT INTO generations (id, project_id, style_id, attempt, prompt, status)
    VALUES (?, ?, ?, ?, ?, 'PENDING')
  `).run(params.id, params.projectId, params.styleId, params.attempt, params.prompt);
  return getGeneration(params.id)!;
}

export function getGeneration(id: string): DbGeneration | null {
  return getDb().prepare('SELECT * FROM generations WHERE id = ?').get(id) as DbGeneration | null;
}

export function getGenerationsForProject(projectId: string): DbGeneration[] {
  return getDb().prepare(`
    SELECT * FROM generations WHERE project_id = ? ORDER BY created_at ASC
  `).all(projectId) as DbGeneration[];
}

export function getLatestGenerationForStyle(projectId: string, styleId: string): DbGeneration | null {
  return getDb().prepare(`
    SELECT * FROM generations
    WHERE project_id = ? AND style_id = ?
    ORDER BY attempt DESC LIMIT 1
  `).get(projectId, styleId) as DbGeneration | null;
}

export function updateGenerationStatus(
  id: string,
  status: GenerationStatus,
  extra?: { imagePath?: string; geometryScore?: number; geometryReport?: string; error?: string }
): void {
  const now = new Date().toISOString();
  const isFinished = ['PASSED', 'FAILED', 'NEEDS_REVIEW'].includes(status);
  getDb().prepare(`
    UPDATE generations SET
      status = ?,
      image_path = COALESCE(?, image_path),
      geometry_score = COALESCE(?, geometry_score),
      geometry_report = COALESCE(?, geometry_report),
      error = COALESCE(?, error),
      started_at = CASE WHEN status = 'PENDING' AND ? IS NOT NULL THEN ? ELSE started_at END,
      finished_at = CASE WHEN ? = 1 THEN ? ELSE finished_at END
    WHERE id = ?
  `).run(
    status,
    extra?.imagePath ?? null,
    extra?.geometryScore ?? null,
    extra?.geometryReport ?? null,
    extra?.error ?? null,
    status === 'UPLOADING' ? now : null,
    status === 'UPLOADING' ? now : null,
    isFinished ? 1 : 0,
    isFinished ? now : null,
    id
  );
}

export function getPendingGenerations(): DbGeneration[] {
  return getDb().prepare(`
    SELECT * FROM generations
    WHERE status IN ('PENDING', 'RETRYING')
    ORDER BY created_at ASC
  `).all() as DbGeneration[];
}

// ---- QA Results ----

export function saveQaResult(params: {
  generationId: string;
  passed: boolean;
  score: number;
  cameraScore?: number;
  linesScore?: number;
  windowsScore?: number;
  doorsScore?: number;
  warnings?: string[];
}): void {
  getDb().prepare(`
    INSERT INTO qa_results (generation_id, passed, score, camera_score, lines_score, windows_score, doors_score, warnings)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    params.generationId,
    params.passed ? 1 : 0,
    params.score,
    params.cameraScore ?? null,
    params.linesScore ?? null,
    params.windowsScore ?? null,
    params.doorsScore ?? null,
    params.warnings ? JSON.stringify(params.warnings) : null
  );
}

// ---- Renders ----

export function createRender(id: string, projectId: string): DbRender {
  getDb().prepare(`
    INSERT INTO renders (id, project_id, status) VALUES (?, ?, 'PENDING')
  `).run(id, projectId);
  return getRender(id)!;
}

export function getRender(id: string): DbRender | null {
  return getDb().prepare('SELECT * FROM renders WHERE id = ?').get(id) as DbRender | null;
}

export function getRenderForProject(projectId: string): DbRender | null {
  return getDb().prepare(
    'SELECT * FROM renders WHERE project_id = ? ORDER BY created_at DESC LIMIT 1'
  ).get(projectId) as DbRender | null;
}

export function updateRenderStatus(
  id: string,
  status: RenderStatus,
  extra?: { storyboardPath?: string; outputPath?: string; durationSec?: number; error?: string }
): void {
  getDb().prepare(`
    UPDATE renders SET
      status = ?,
      storyboard_path = COALESCE(?, storyboard_path),
      output_path = COALESCE(?, output_path),
      duration_sec = COALESCE(?, duration_sec),
      error = COALESCE(?, error),
      updated_at = datetime('now')
    WHERE id = ?
  `).run(
    status,
    extra?.storyboardPath ?? null,
    extra?.outputPath ?? null,
    extra?.durationSec ?? null,
    extra?.error ?? null,
    id
  );
}

// Re-export unused import to satisfy TypeScript (DbQaResult is exported via types.ts)
export type { DbQaResult };
