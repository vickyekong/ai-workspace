use rusqlite::{Connection, OptionalExtension, Row, params};
use serde::{Deserialize, Serialize};

use super::{new_id, now_ms};
use crate::error::{AppError, AppResult};

pub const MAX_TITLE_CHARS: usize = 120;
pub const MAX_MESSAGE_CHARS: usize = 200_000;
const PREVIEW_CHARS: i64 = 160;
const AUTO_TITLE_CHARS: usize = 56;

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Conversation {
    pub id: String,
    /// Empty until the first user message gives it an automatic title.
    pub title: String,
    pub project_id: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
    pub message_count: i64,
    pub preview: Option<String>,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewConversation {
    pub title: Option<String>,
    pub project_id: Option<String>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Role {
    User,
    Assistant,
    System,
}

impl Role {
    fn as_str(self) -> &'static str {
        match self {
            Role::User => "user",
            Role::Assistant => "assistant",
            Role::System => "system",
        }
    }

    fn parse(value: &str) -> rusqlite::Result<Self> {
        match value {
            "user" => Ok(Role::User),
            "assistant" => Ok(Role::Assistant),
            "system" => Ok(Role::System),
            other => Err(rusqlite::Error::InvalidColumnType(
                0,
                format!("role:{other}"),
                rusqlite::types::Type::Text,
            )),
        }
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "lowercase")]
pub enum MessageStatus {
    #[default]
    Complete,
    Error,
    Cancelled,
}

impl MessageStatus {
    fn as_str(self) -> &'static str {
        match self {
            MessageStatus::Complete => "complete",
            MessageStatus::Error => "error",
            MessageStatus::Cancelled => "cancelled",
        }
    }

    fn parse(value: &str) -> rusqlite::Result<Self> {
        match value {
            "complete" => Ok(MessageStatus::Complete),
            "error" => Ok(MessageStatus::Error),
            "cancelled" => Ok(MessageStatus::Cancelled),
            other => Err(rusqlite::Error::InvalidColumnType(
                0,
                format!("status:{other}"),
                rusqlite::types::Type::Text,
            )),
        }
    }
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Message {
    pub id: String,
    pub conversation_id: String,
    pub role: Role,
    pub content: String,
    pub status: MessageStatus,
    pub model: Option<String>,
    pub error: Option<String>,
    pub created_at: i64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewMessage {
    pub conversation_id: String,
    pub role: Role,
    pub content: String,
    #[serde(default)]
    pub status: MessageStatus,
    pub model: Option<String>,
    pub error: Option<String>,
}

const SELECT_CONVERSATION: &str = r#"
    SELECT c.id, c.title, c.project_id, c.created_at, c.updated_at,
           (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id),
           (SELECT substr(m.content, 1, ?) FROM messages m
             WHERE m.conversation_id = c.id
             ORDER BY m.created_at DESC, m.rowid DESC LIMIT 1)
    FROM conversations c
"#;

fn map_conversation(row: &Row<'_>) -> rusqlite::Result<Conversation> {
    Ok(Conversation {
        id: row.get(0)?,
        title: row.get(1)?,
        project_id: row.get(2)?,
        created_at: row.get(3)?,
        updated_at: row.get(4)?,
        message_count: row.get(5)?,
        preview: row.get(6)?,
    })
}

fn map_message(row: &Row<'_>) -> rusqlite::Result<Message> {
    let role: String = row.get(2)?;
    let status: String = row.get(4)?;
    Ok(Message {
        id: row.get(0)?,
        conversation_id: row.get(1)?,
        role: Role::parse(&role)?,
        content: row.get(3)?,
        status: MessageStatus::parse(&status)?,
        model: row.get(5)?,
        error: row.get(6)?,
        created_at: row.get(7)?,
    })
}

fn clean_title(title: &str) -> AppResult<String> {
    let title = title.split_whitespace().collect::<Vec<_>>().join(" ");
    if title.chars().count() > MAX_TITLE_CHARS {
        return Err(AppError::InvalidInput(format!(
            "title must be at most {MAX_TITLE_CHARS} characters"
        )));
    }
    Ok(title)
}

/// Builds a short, single-line title from the first user message.
pub fn derive_title(content: &str) -> String {
    let line = content
        .lines()
        .map(str::trim)
        .find(|l| !l.is_empty())
        .unwrap_or_default();
    let collapsed = line.split_whitespace().collect::<Vec<_>>().join(" ");
    if collapsed.chars().count() <= AUTO_TITLE_CHARS {
        return collapsed;
    }
    let truncated: String = collapsed.chars().take(AUTO_TITLE_CHARS).collect();
    let cut = truncated.rfind(' ').filter(|&i| i > AUTO_TITLE_CHARS / 2);
    let base = cut.map_or(truncated.as_str(), |i| &truncated[..i]);
    format!("{}…", base.trim_end_matches(|c: char| c.is_ascii_punctuation()))
}

pub fn list(conn: &Connection) -> AppResult<Vec<Conversation>> {
    let sql = format!("{SELECT_CONVERSATION} ORDER BY c.updated_at DESC, c.rowid DESC");
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map([PREVIEW_CHARS], map_conversation)?;
    Ok(rows.collect::<Result<_, _>>()?)
}

pub fn get(conn: &Connection, id: &str) -> AppResult<Conversation> {
    let sql = format!("{SELECT_CONVERSATION} WHERE c.id = ?");
    conn.query_row(&sql, params![PREVIEW_CHARS, id], map_conversation)
        .optional()?
        .ok_or(AppError::NotFound("conversation"))
}

pub fn create(conn: &Connection, input: NewConversation) -> AppResult<Conversation> {
    let id = new_id();
    let now = now_ms();
    let title = clean_title(input.title.as_deref().unwrap_or_default())?;
    conn.execute(
        "INSERT INTO conversations (id, title, project_id, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?4)",
        params![id, title, input.project_id, now],
    )?;
    get(conn, &id)
}

pub fn rename(conn: &Connection, id: &str, title: &str) -> AppResult<Conversation> {
    let title = clean_title(title)?;
    if title.is_empty() {
        return Err(AppError::InvalidInput("title cannot be empty".into()));
    }
    let changed = conn.execute(
        "UPDATE conversations SET title = ?2, updated_at = ?3 WHERE id = ?1",
        params![id, title, now_ms()],
    )?;
    if changed == 0 {
        return Err(AppError::NotFound("conversation"));
    }
    get(conn, id)
}

pub fn set_project(
    conn: &Connection,
    id: &str,
    project_id: Option<&str>,
) -> AppResult<Conversation> {
    let changed = conn.execute(
        "UPDATE conversations SET project_id = ?2 WHERE id = ?1",
        params![id, project_id],
    )?;
    if changed == 0 {
        return Err(AppError::NotFound("conversation"));
    }
    get(conn, id)
}

pub fn delete(conn: &Connection, id: &str) -> AppResult<()> {
    conn.execute("DELETE FROM conversations WHERE id = ?1", [id])?;
    Ok(())
}

pub fn delete_all(conn: &Connection) -> AppResult<usize> {
    Ok(conn.execute("DELETE FROM conversations", [])?)
}

pub fn list_messages(conn: &Connection, conversation_id: &str) -> AppResult<Vec<Message>> {
    let mut stmt = conn.prepare(
        "SELECT id, conversation_id, role, content, status, model, error, created_at
         FROM messages WHERE conversation_id = ?1
         ORDER BY created_at ASC, rowid ASC",
    )?;
    let rows = stmt.query_map([conversation_id], map_message)?;
    Ok(rows.collect::<Result<_, _>>()?)
}

/// Appends a message, bumps the conversation's `updated_at`, and assigns an
/// automatic title from the first user message when none was set.
pub fn append_message(conn: &mut Connection, input: NewMessage) -> AppResult<Message> {
    if input.content.chars().count() > MAX_MESSAGE_CHARS {
        return Err(AppError::InvalidInput(format!(
            "message must be at most {MAX_MESSAGE_CHARS} characters"
        )));
    }
    if input.role == Role::User && input.content.trim().is_empty() {
        return Err(AppError::InvalidInput("message cannot be empty".into()));
    }

    let tx = conn.transaction()?;
    let exists: bool = tx.query_row(
        "SELECT EXISTS(SELECT 1 FROM conversations WHERE id = ?1)",
        [&input.conversation_id],
        |r| r.get(0),
    )?;
    if !exists {
        return Err(AppError::NotFound("conversation"));
    }

    // Keep ordering strictly increasing even when messages land in the same ms.
    let last: Option<i64> = tx.query_row(
        "SELECT MAX(created_at) FROM messages WHERE conversation_id = ?1",
        [&input.conversation_id],
        |r| r.get(0),
    )?;
    let now = now_ms().max(last.map_or(0, |t| t + 1));

    let id = new_id();
    tx.execute(
        "INSERT INTO messages (id, conversation_id, role, content, status, model, error, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        params![
            id,
            input.conversation_id,
            input.role.as_str(),
            input.content,
            input.status.as_str(),
            input.model,
            input.error,
            now
        ],
    )?;
    tx.execute(
        "UPDATE conversations SET updated_at = ?2 WHERE id = ?1",
        params![input.conversation_id, now],
    )?;
    if input.role == Role::User {
        tx.execute(
            "UPDATE conversations SET title = ?2 WHERE id = ?1 AND title = ''",
            params![input.conversation_id, derive_title(&input.content)],
        )?;
    }
    tx.commit()?;

    Ok(Message {
        id,
        conversation_id: input.conversation_id,
        role: input.role,
        content: input.content,
        status: input.status,
        model: input.model,
        error: input.error,
        created_at: now,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::Database;

    fn user(conversation_id: &str, content: &str) -> NewMessage {
        NewMessage {
            conversation_id: conversation_id.into(),
            role: Role::User,
            content: content.into(),
            status: MessageStatus::Complete,
            model: None,
            error: None,
        }
    }

    #[test]
    fn create_list_and_get() {
        let db = Database::open_in_memory().unwrap();
        let conn = db.conn().unwrap();
        let a = create(&conn, NewConversation::default()).unwrap();
        let b = create(
            &conn,
            NewConversation {
                title: Some("  Planning   notes ".into()),
                project_id: None,
            },
        )
        .unwrap();
        assert_eq!(a.title, "");
        assert_eq!(b.title, "Planning notes");
        let all = list(&conn).unwrap();
        assert_eq!(all.len(), 2);
        assert_eq!(get(&conn, &a.id).unwrap().id, a.id);
        assert!(matches!(get(&conn, "missing"), Err(AppError::NotFound(_))));
    }

    #[test]
    fn append_message_sets_auto_title_once_and_orders_messages() {
        let db = Database::open_in_memory().unwrap();
        let mut conn = db.conn().unwrap();
        let c = create(&conn, NewConversation::default()).unwrap();

        append_message(&mut conn, user(&c.id, "\n  How do I plan a launch?\nMore")).unwrap();
        let reply = NewMessage {
            role: Role::Assistant,
            model: Some("mock".into()),
            ..user(&c.id, "Here is a plan.")
        };
        append_message(&mut conn, reply).unwrap();
        append_message(&mut conn, user(&c.id, "Second question")).unwrap();

        let updated = get(&conn, &c.id).unwrap();
        assert_eq!(updated.title, "How do I plan a launch?");
        assert_eq!(updated.message_count, 3);
        assert_eq!(updated.preview.as_deref(), Some("Second question"));

        let messages = list_messages(&conn, &c.id).unwrap();
        let roles: Vec<_> = messages.iter().map(|m| m.role).collect();
        assert_eq!(roles, [Role::User, Role::Assistant, Role::User]);
        assert!(messages.windows(2).all(|w| w[0].created_at < w[1].created_at));
    }

    #[test]
    fn append_message_validates_input() {
        let db = Database::open_in_memory().unwrap();
        let mut conn = db.conn().unwrap();
        let c = create(&conn, NewConversation::default()).unwrap();
        assert!(matches!(
            append_message(&mut conn, user(&c.id, "   ")),
            Err(AppError::InvalidInput(_))
        ));
        assert!(matches!(
            append_message(&mut conn, user("nope", "hi")),
            Err(AppError::NotFound(_))
        ));
        let huge = "x".repeat(MAX_MESSAGE_CHARS + 1);
        assert!(append_message(&mut conn, user(&c.id, &huge)).is_err());
    }

    #[test]
    fn manual_title_is_not_overwritten() {
        let db = Database::open_in_memory().unwrap();
        let mut conn = db.conn().unwrap();
        let c = create(&conn, NewConversation::default()).unwrap();
        rename(&conn, &c.id, "Custom").unwrap();
        append_message(&mut conn, user(&c.id, "Hello there")).unwrap();
        assert_eq!(get(&conn, &c.id).unwrap().title, "Custom");
        assert!(rename(&conn, &c.id, "   ").is_err());
        assert!(rename(&conn, "missing", "x").is_err());
    }

    #[test]
    fn deleting_conversation_cascades_messages() {
        let db = Database::open_in_memory().unwrap();
        let mut conn = db.conn().unwrap();
        let c = create(&conn, NewConversation::default()).unwrap();
        append_message(&mut conn, user(&c.id, "hi")).unwrap();
        delete(&conn, &c.id).unwrap();
        let orphans: i64 = conn
            .query_row("SELECT COUNT(*) FROM messages", [], |r| r.get(0))
            .unwrap();
        assert_eq!(orphans, 0);
    }

    #[test]
    fn derive_title_truncates_on_word_boundary() {
        assert_eq!(derive_title("Short title"), "Short title");
        assert_eq!(derive_title(""), "");
        let long = "Please help me design a comprehensive onboarding flow for new enterprise customers";
        let title = derive_title(long);
        assert!(title.ends_with('…'));
        assert!(title.chars().count() <= AUTO_TITLE_CHARS + 1);
        assert!(!title.contains("  "));
    }
}
