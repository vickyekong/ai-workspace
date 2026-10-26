pub mod conversations;
pub mod documents;
pub mod projects;
pub mod settings;

use std::path::Path;
use std::sync::{Mutex, MutexGuard};
use std::time::{SystemTime, UNIX_EPOCH};

use rusqlite::Connection;

use crate::error::{AppError, AppResult};

/// Ordered schema migrations. Each entry is applied once and tracked through
/// `PRAGMA user_version`; never edit a shipped migration, append a new one.
const MIGRATIONS: &[&str] = &[r#"
    CREATE TABLE projects (
        id          TEXT PRIMARY KEY,
        name        TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        color       TEXT NOT NULL DEFAULT 'blue',
        created_at  INTEGER NOT NULL,
        updated_at  INTEGER NOT NULL
    );

    CREATE TABLE conversations (
        id          TEXT PRIMARY KEY,
        title       TEXT NOT NULL DEFAULT '',
        project_id  TEXT REFERENCES projects(id) ON DELETE SET NULL,
        created_at  INTEGER NOT NULL,
        updated_at  INTEGER NOT NULL
    );
    CREATE INDEX idx_conversations_updated ON conversations(updated_at DESC);
    CREATE INDEX idx_conversations_project ON conversations(project_id);

    CREATE TABLE messages (
        id              TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        role            TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
        content         TEXT NOT NULL,
        status          TEXT NOT NULL DEFAULT 'complete'
                        CHECK (status IN ('complete', 'error', 'cancelled')),
        model           TEXT,
        error           TEXT,
        created_at      INTEGER NOT NULL
    );
    CREATE INDEX idx_messages_conversation ON messages(conversation_id, created_at);

    CREATE TABLE documents (
        id          TEXT PRIMARY KEY,
        name        TEXT NOT NULL,
        path        TEXT NOT NULL UNIQUE,
        extension   TEXT NOT NULL,
        kind        TEXT NOT NULL,
        size_bytes  INTEGER NOT NULL,
        modified_at INTEGER,
        imported_at INTEGER NOT NULL,
        excerpt     TEXT,
        project_id  TEXT REFERENCES projects(id) ON DELETE SET NULL
    );
    CREATE INDEX idx_documents_project ON documents(project_id);

    CREATE TABLE settings (
        key        TEXT PRIMARY KEY,
        value      TEXT NOT NULL,
        updated_at INTEGER NOT NULL
    );
"#];

pub struct Database {
    conn: Mutex<Connection>,
}

impl Database {
    pub fn open(path: &Path) -> AppResult<Self> {
        prepare_storage(path)?;
        let conn = Connection::open(path)?;
        conn.pragma_update(None, "journal_mode", "WAL")?;
        Self::init(conn)
    }

    #[cfg(test)]
    pub fn open_in_memory() -> AppResult<Self> {
        Self::init(Connection::open_in_memory()?)
    }

    fn init(mut conn: Connection) -> AppResult<Self> {
        conn.pragma_update(None, "foreign_keys", "ON")?;
        migrate(&mut conn)?;
        Ok(Self {
            conn: Mutex::new(conn),
        })
    }

    pub fn conn(&self) -> AppResult<MutexGuard<'_, Connection>> {
        self.conn
            .lock()
            .map_err(|_| AppError::Internal("database lock poisoned".into()))
    }
}

/// The database contains private conversations and imported document excerpts.
/// Protect the containing directory before SQLite can create WAL/SHM files.
fn prepare_storage(path: &Path) -> AppResult<()> {
    let parent = path.parent().filter(|p| !p.as_os_str().is_empty())
        .ok_or_else(|| AppError::InvalidInput("database requires a storage directory".into()))?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::{DirBuilderExt, OpenOptionsExt, PermissionsExt};
        std::fs::DirBuilder::new().recursive(true).mode(0o700).create(parent)?;
        let metadata = std::fs::symlink_metadata(parent)?;
        if !metadata.is_dir() || metadata.file_type().is_symlink() {
            return Err(AppError::InvalidInput("storage directory must not be a symlink".into()));
        }
        std::fs::set_permissions(parent, std::fs::Permissions::from_mode(0o700))?;
        // Reject redirects and tighten existing files before opening SQLite.
        for suffix in ["", "-wal", "-shm", "-journal"] {
            let mut name = path.as_os_str().to_os_string();
            name.push(suffix);
            let file = std::path::PathBuf::from(name);
            match std::fs::symlink_metadata(&file) {
                Ok(meta) => {
                    if !meta.is_file() || meta.file_type().is_symlink() {
                        return Err(AppError::InvalidInput("database files must be regular files".into()));
                    }
                    std::fs::set_permissions(&file, std::fs::Permissions::from_mode(0o600))?;
                }
                Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
                Err(e) => return Err(e.into()),
            }
        }
        match std::fs::OpenOptions::new().write(true).create_new(true).mode(0o600).open(path) {
            Ok(_) => {}
            Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => {}
            Err(e) => return Err(e.into()),
        }
    }
    #[cfg(not(unix))]
    std::fs::create_dir_all(parent)?;
    Ok(())
}

fn migrate(conn: &mut Connection) -> AppResult<()> {
    let current: i64 = conn.pragma_query_value(None, "user_version", |row| row.get(0))?;
    let latest = MIGRATIONS.len() as i64;
    if current > latest {
        return Err(AppError::Internal(format!(
            "database schema v{current} is newer than this app supports (v{latest})"
        )));
    }
    for (version, sql) in (1..).zip(MIGRATIONS.iter()).skip(current.max(0) as usize) {
        let tx = conn.transaction()?;
        tx.execute_batch(sql)?;
        tx.pragma_update(None, "user_version", version as i64)?;
        tx.commit()?;
    }
    Ok(())
}

pub fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or_default()
}

pub fn new_id() -> String {
    uuid::Uuid::new_v4().to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[cfg(unix)]
    #[test]
    fn storage_is_private_and_existing_permissions_are_repaired() {
        use std::os::unix::fs::PermissionsExt;
        let dir = std::env::temp_dir().join(format!("aiw-private-{}", new_id()));
        let path = dir.join("workspace.db");
        let db = Database::open(&path).unwrap();
        let mode = |p: &Path| std::fs::metadata(p).unwrap().permissions().mode() & 0o777;
        assert_eq!(mode(&dir), 0o700);
        assert_eq!(mode(&path), 0o600);
        for suffix in ["-wal", "-shm"] {
            let sidecar = dir.join(format!("workspace.db{suffix}"));
            if sidecar.exists() { assert_eq!(mode(&sidecar), 0o600); }
        }
        drop(db);
        std::fs::set_permissions(&dir, std::fs::Permissions::from_mode(0o755)).unwrap();
        std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o644)).unwrap();
        drop(Database::open(&path).unwrap());
        assert_eq!(mode(&dir), 0o700);
        assert_eq!(mode(&path), 0o600);
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn rejects_symlinked_database_without_modifying_target() {
        use std::os::unix::fs::{symlink, PermissionsExt};
        let dir = std::env::temp_dir().join(format!("aiw-link-{}", new_id()));
        std::fs::create_dir_all(&dir).unwrap();
        let target = dir.join("target");
        std::fs::write(&target, "untouched").unwrap();
        std::fs::set_permissions(&target, std::fs::Permissions::from_mode(0o644)).unwrap();
        symlink(&target, dir.join("workspace.db")).unwrap();
        assert!(Database::open(&dir.join("workspace.db")).is_err());
        assert_eq!(std::fs::read_to_string(&target).unwrap(), "untouched");
        assert_eq!(std::fs::metadata(&target).unwrap().permissions().mode() & 0o777, 0o644);
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn migrations_apply_and_are_idempotent() {
        let db = Database::open_in_memory().unwrap();
        let mut conn = db.conn().unwrap();
        let version: i64 = conn
            .pragma_query_value(None, "user_version", |r| r.get(0))
            .unwrap();
        assert_eq!(version, MIGRATIONS.len() as i64);
        migrate(&mut conn).unwrap();
        let fk: i64 = conn
            .pragma_query_value(None, "foreign_keys", |r| r.get(0))
            .unwrap();
        assert_eq!(fk, 1);
    }

    #[test]
    fn rejects_newer_schema() {
        let mut conn = Connection::open_in_memory().unwrap();
        conn.pragma_update(None, "user_version", 99).unwrap();
        assert!(migrate(&mut conn).is_err());
    }

    #[test]
    fn persists_to_disk_across_reopen() {
        let dir = std::env::temp_dir().join(format!("aiw-test-{}", new_id()));
        let path = dir.join("workspace.db");
        {
            let db = Database::open(&path).unwrap();
            let conn = db.conn().unwrap();
            conversations::create(&conn, conversations::NewConversation::default()).unwrap();
        }
        let db = Database::open(&path).unwrap();
        let conn = db.conn().unwrap();
        assert_eq!(conversations::list(&conn).unwrap().len(), 1);
        drop(conn);
        drop(db);
        std::fs::remove_dir_all(dir).ok();
    }
}
