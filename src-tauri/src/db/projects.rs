use rusqlite::{Connection, OptionalExtension, Row, params};
use serde::{Deserialize, Serialize};

use super::{new_id, now_ms};
use crate::error::{AppError, AppResult};

pub const PROJECT_COLORS: &[&str] = &["blue", "violet", "pink", "orange", "green", "teal", "gray"];
const MAX_NAME_CHARS: usize = 80;
const MAX_DESCRIPTION_CHARS: usize = 500;

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Project {
    pub id: String,
    pub name: String,
    pub description: String,
    pub color: String,
    pub created_at: i64,
    pub updated_at: i64,
    pub conversation_count: i64,
    pub document_count: i64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectInput {
    pub name: String,
    #[serde(default)]
    pub description: String,
    pub color: Option<String>,
}

const SELECT_PROJECT: &str = r#"
    SELECT p.id, p.name, p.description, p.color, p.created_at, p.updated_at,
           (SELECT COUNT(*) FROM conversations c WHERE c.project_id = p.id),
           (SELECT COUNT(*) FROM documents d WHERE d.project_id = p.id)
    FROM projects p
"#;

fn map_project(row: &Row<'_>) -> rusqlite::Result<Project> {
    Ok(Project {
        id: row.get(0)?,
        name: row.get(1)?,
        description: row.get(2)?,
        color: row.get(3)?,
        created_at: row.get(4)?,
        updated_at: row.get(5)?,
        conversation_count: row.get(6)?,
        document_count: row.get(7)?,
    })
}

fn validate(input: &ProjectInput) -> AppResult<(String, String, String)> {
    let name = input.name.split_whitespace().collect::<Vec<_>>().join(" ");
    if name.is_empty() {
        return Err(AppError::InvalidInput("project name cannot be empty".into()));
    }
    if name.chars().count() > MAX_NAME_CHARS {
        return Err(AppError::InvalidInput(format!(
            "project name must be at most {MAX_NAME_CHARS} characters"
        )));
    }
    let description = input.description.trim().to_string();
    if description.chars().count() > MAX_DESCRIPTION_CHARS {
        return Err(AppError::InvalidInput(format!(
            "description must be at most {MAX_DESCRIPTION_CHARS} characters"
        )));
    }
    let color = input.color.clone().unwrap_or_else(|| "blue".into());
    if !PROJECT_COLORS.contains(&color.as_str()) {
        return Err(AppError::InvalidInput(format!("unknown color '{color}'")));
    }
    Ok((name, description, color))
}

pub fn list(conn: &Connection) -> AppResult<Vec<Project>> {
    let sql = format!("{SELECT_PROJECT} ORDER BY p.updated_at DESC, p.rowid DESC");
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map([], map_project)?;
    Ok(rows.collect::<Result<_, _>>()?)
}

pub fn get(conn: &Connection, id: &str) -> AppResult<Project> {
    let sql = format!("{SELECT_PROJECT} WHERE p.id = ?1");
    conn.query_row(&sql, [id], map_project)
        .optional()?
        .ok_or(AppError::NotFound("project"))
}

pub fn create(conn: &Connection, input: ProjectInput) -> AppResult<Project> {
    let (name, description, color) = validate(&input)?;
    let id = new_id();
    conn.execute(
        "INSERT INTO projects (id, name, description, color, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?5)",
        params![id, name, description, color, now_ms()],
    )?;
    get(conn, &id)
}

pub fn update(conn: &Connection, id: &str, input: ProjectInput) -> AppResult<Project> {
    let (name, description, color) = validate(&input)?;
    let changed = conn.execute(
        "UPDATE projects SET name = ?2, description = ?3, color = ?4, updated_at = ?5
         WHERE id = ?1",
        params![id, name, description, color, now_ms()],
    )?;
    if changed == 0 {
        return Err(AppError::NotFound("project"));
    }
    get(conn, id)
}

/// Deletes the project; its conversations and documents are kept and unassigned.
pub fn delete(conn: &Connection, id: &str) -> AppResult<()> {
    conn.execute("DELETE FROM projects WHERE id = ?1", [id])?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{Database, conversations};

    fn input(name: &str) -> ProjectInput {
        ProjectInput {
            name: name.into(),
            description: String::new(),
            color: None,
        }
    }

    #[test]
    fn create_update_and_validate() {
        let db = Database::open_in_memory().unwrap();
        let conn = db.conn().unwrap();
        let p = create(&conn, input("  Launch   plan ")).unwrap();
        assert_eq!(p.name, "Launch plan");
        assert_eq!(p.color, "blue");

        let updated = update(
            &conn,
            &p.id,
            ProjectInput {
                name: "Launch".into(),
                description: "Q4".into(),
                color: Some("violet".into()),
            },
        )
        .unwrap();
        assert_eq!(updated.color, "violet");
        assert_eq!(updated.description, "Q4");

        assert!(create(&conn, input("  ")).is_err());
        assert!(
            create(
                &conn,
                ProjectInput {
                    color: Some("neon".into()),
                    ..input("x")
                }
            )
            .is_err()
        );
        assert!(matches!(
            update(&conn, "missing", input("x")),
            Err(AppError::NotFound(_))
        ));
    }

    #[test]
    fn deleting_project_unassigns_conversations() {
        let db = Database::open_in_memory().unwrap();
        let conn = db.conn().unwrap();
        let p = create(&conn, input("Research")).unwrap();
        let c = conversations::create(
            &conn,
            conversations::NewConversation {
                title: None,
                project_id: Some(p.id.clone()),
            },
        )
        .unwrap();
        assert_eq!(get(&conn, &p.id).unwrap().conversation_count, 1);

        delete(&conn, &p.id).unwrap();
        let c = conversations::get(&conn, &c.id).unwrap();
        assert_eq!(c.project_id, None);
        assert!(list(&conn).unwrap().is_empty());
    }
}
