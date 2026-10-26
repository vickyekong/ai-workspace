use rusqlite::{Connection, OptionalExtension, params};

use super::now_ms;
use crate::error::{AppError, AppResult};

const MAX_VALUE_BYTES: usize = 64 * 1024;

/// Returns the stored JSON value for `key`, if any.
pub fn get(conn: &Connection, key: &str) -> AppResult<Option<serde_json::Value>> {
    let raw: Option<String> = conn
        .query_row("SELECT value FROM settings WHERE key = ?1", [key], |r| r.get(0))
        .optional()?;
    // A corrupt value falls back to defaults instead of blocking app launch.
    Ok(raw.and_then(|v| serde_json::from_str(&v).ok()))
}

pub fn set(conn: &Connection, key: &str, value: &serde_json::Value) -> AppResult<()> {
    if !value.is_object() {
        return Err(AppError::InvalidInput("settings must be a JSON object".into()));
    }
    let raw = value.to_string();
    if raw.len() > MAX_VALUE_BYTES {
        return Err(AppError::InvalidInput("settings payload too large".into()));
    }
    conn.execute(
        "INSERT INTO settings (key, value, updated_at) VALUES (?1, ?2, ?3)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
        params![key, raw, now_ms()],
    )?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::Database;
    use serde_json::json;

    #[test]
    fn round_trips_and_upserts() {
        let db = Database::open_in_memory().unwrap();
        let conn = db.conn().unwrap();
        assert_eq!(get(&conn, "app").unwrap(), None);
        set(&conn, "app", &json!({ "theme": "dark" })).unwrap();
        set(&conn, "app", &json!({ "theme": "light" })).unwrap();
        assert_eq!(get(&conn, "app").unwrap(), Some(json!({ "theme": "light" })));
    }

    #[test]
    fn rejects_non_objects_and_tolerates_corruption() {
        let db = Database::open_in_memory().unwrap();
        let conn = db.conn().unwrap();
        assert!(set(&conn, "app", &json!("dark")).is_err());
        conn.execute(
            "INSERT INTO settings (key, value, updated_at) VALUES ('app', '{broken', 0)",
            [],
        )
        .unwrap();
        assert_eq!(get(&conn, "app").unwrap(), None);
    }
}
