use std::path::Path;

use rusqlite::{Connection, OptionalExtension, Row, params};
use serde::Serialize;

use super::{new_id, now_ms};
use crate::error::{AppError, AppResult};
use crate::library::ProbedFile;

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Document {
    pub id: String,
    pub name: String,
    pub path: String,
    pub extension: String,
    pub kind: String,
    pub size_bytes: i64,
    pub modified_at: Option<i64>,
    pub imported_at: i64,
    pub excerpt: Option<String>,
    pub project_id: Option<String>,
    /// False when the original file has been moved or deleted since import.
    pub available: bool,
}

const SELECT_DOCUMENT: &str = "SELECT id, name, path, extension, kind, size_bytes, modified_at,
    imported_at, excerpt, project_id FROM documents";

fn map_document(row: &Row<'_>) -> rusqlite::Result<Document> {
    let path: String = row.get(2)?;
    let available = Path::new(&path).exists();
    Ok(Document {
        id: row.get(0)?,
        name: row.get(1)?,
        path,
        extension: row.get(3)?,
        kind: row.get(4)?,
        size_bytes: row.get(5)?,
        modified_at: row.get(6)?,
        imported_at: row.get(7)?,
        excerpt: row.get(8)?,
        project_id: row.get(9)?,
        available,
    })
}

pub fn list(conn: &Connection) -> AppResult<Vec<Document>> {
    let sql = format!("{SELECT_DOCUMENT} ORDER BY imported_at DESC, rowid DESC");
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map([], map_document)?;
    Ok(rows.collect::<Result<_, _>>()?)
}

pub fn get(conn: &Connection, id: &str) -> AppResult<Document> {
    let sql = format!("{SELECT_DOCUMENT} WHERE id = ?1");
    conn.query_row(&sql, [id], map_document)
        .optional()?
        .ok_or(AppError::NotFound("document"))
}

/// Inserts a probed file. Returns `None` when the same path is already in the library.
pub fn insert(conn: &Connection, file: &ProbedFile) -> AppResult<Option<Document>> {
    let id = new_id();
    let inserted = conn.execute(
        "INSERT OR IGNORE INTO documents
            (id, name, path, extension, kind, size_bytes, modified_at, imported_at, excerpt)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        params![
            id,
            file.name,
            file.path,
            file.extension,
            file.kind,
            file.size_bytes,
            file.modified_at,
            now_ms(),
            file.excerpt
        ],
    )?;
    if inserted == 0 {
        return Ok(None);
    }
    get(conn, &id).map(Some)
}

pub fn set_project(conn: &Connection, id: &str, project_id: Option<&str>) -> AppResult<Document> {
    let changed = conn.execute(
        "UPDATE documents SET project_id = ?2 WHERE id = ?1",
        params![id, project_id],
    )?;
    if changed == 0 {
        return Err(AppError::NotFound("document"));
    }
    get(conn, id)
}

/// Removes the library entry only; the file on disk is never touched.
pub fn remove(conn: &Connection, id: &str) -> AppResult<()> {
    conn.execute("DELETE FROM documents WHERE id = ?1", [id])?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{Database, projects};

    fn probed(path: &str) -> ProbedFile {
        ProbedFile {
            name: "notes.md".into(),
            path: path.into(),
            extension: "md".into(),
            kind: "markdown".into(),
            size_bytes: 42,
            modified_at: Some(1),
            excerpt: Some("Hello".into()),
        }
    }

    #[test]
    fn insert_dedupes_by_path_and_reports_availability() {
        let db = Database::open_in_memory().unwrap();
        let conn = db.conn().unwrap();
        let doc = insert(&conn, &probed("/definitely/missing/notes.md"))
            .unwrap()
            .unwrap();
        assert!(!doc.available);
        assert_eq!(doc.kind, "markdown");
        assert!(insert(&conn, &probed("/definitely/missing/notes.md")).unwrap().is_none());
        assert_eq!(list(&conn).unwrap().len(), 1);
    }

    #[test]
    fn assign_project_and_remove() {
        let db = Database::open_in_memory().unwrap();
        let conn = db.conn().unwrap();
        let doc = insert(&conn, &probed("/tmp/a.md")).unwrap().unwrap();
        let project = projects::create(
            &conn,
            projects::ProjectInput {
                name: "Docs".into(),
                description: String::new(),
                color: None,
            },
        )
        .unwrap();
        let doc = set_project(&conn, &doc.id, Some(&project.id)).unwrap();
        assert_eq!(doc.project_id.as_deref(), Some(project.id.as_str()));
        assert!(set_project(&conn, &doc.id, Some("missing-project")).is_err());
        remove(&conn, &doc.id).unwrap();
        assert!(matches!(get(&conn, &doc.id), Err(AppError::NotFound(_))));
    }
}
