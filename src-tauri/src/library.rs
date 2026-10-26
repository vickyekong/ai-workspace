//! Reads metadata from user-selected files. Files are referenced in place and
//! only a bounded prefix of text documents is read to build a search excerpt.

use std::fs::File;
use std::io::Read;
use std::path::Path;
use std::time::UNIX_EPOCH;

use crate::error::{AppError, AppResult};

/// Extensions offered in the import dialog.
pub const IMPORTABLE_EXTENSIONS: &[&str] = &[
    "pdf", "txt", "md", "markdown", "rtf", "doc", "docx", "csv", "tsv", "xls", "xlsx", "json",
    "html", "htm", "xml", "yaml", "yml",
];

const EXCERPT_READ_BYTES: u64 = 16 * 1024;
const EXCERPT_CHARS: usize = 600;

#[derive(Debug, Clone, PartialEq)]
pub struct ProbedFile {
    pub name: String,
    pub path: String,
    pub extension: String,
    pub kind: String,
    pub size_bytes: i64,
    pub modified_at: Option<i64>,
    pub excerpt: Option<String>,
}

pub fn kind_for_extension(extension: &str) -> &'static str {
    match extension {
        "pdf" => "pdf",
        "md" | "markdown" => "markdown",
        "txt" | "rtf" => "text",
        "doc" | "docx" => "word",
        "csv" | "tsv" | "xls" | "xlsx" => "spreadsheet",
        "json" | "html" | "htm" | "xml" | "yaml" | "yml" => "code",
        _ => "other",
    }
}

fn is_plain_text(extension: &str) -> bool {
    matches!(
        extension,
        "txt" | "md" | "markdown" | "csv" | "tsv" | "json" | "html" | "htm" | "xml" | "yaml" | "yml"
    )
}

fn read_excerpt(path: &Path) -> Option<String> {
    let mut buf = Vec::new();
    File::open(path)
        .ok()?
        .take(EXCERPT_READ_BYTES)
        .read_to_end(&mut buf)
        .ok()?;
    let text = String::from_utf8_lossy(&buf);
    let collapsed: String = text
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .chars()
        .take(EXCERPT_CHARS)
        .collect();
    (!collapsed.is_empty()).then_some(collapsed)
}

pub fn probe(path: &Path) -> AppResult<ProbedFile> {
    let meta = std::fs::metadata(path)?;
    if !meta.is_file() {
        return Err(AppError::InvalidInput("not a regular file".into()));
    }
    let name = path
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .ok_or_else(|| AppError::InvalidInput("file has no name".into()))?;
    let extension = path
        .extension()
        .map(|e| e.to_string_lossy().to_ascii_lowercase())
        .unwrap_or_default();
    let modified_at = meta
        .modified()
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as i64);
    let excerpt = if is_plain_text(&extension) {
        read_excerpt(path)
    } else {
        None
    };
    Ok(ProbedFile {
        name,
        path: path.to_string_lossy().into_owned(),
        kind: kind_for_extension(&extension).into(),
        extension,
        size_bytes: meta.len() as i64,
        modified_at,
        excerpt,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn probes_text_file_with_bounded_excerpt() {
        let dir = std::env::temp_dir().join(format!("aiw-probe-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("Brief.MD");
        std::fs::write(&path, format!("# Title\n\n{}", "word ".repeat(1000))).unwrap();

        let probed = probe(&path).unwrap();
        assert_eq!(probed.name, "Brief.MD");
        assert_eq!(probed.extension, "md");
        assert_eq!(probed.kind, "markdown");
        let excerpt = probed.excerpt.unwrap();
        assert!(excerpt.starts_with("# Title word"));
        assert!(excerpt.chars().count() <= EXCERPT_CHARS);

        assert!(probe(&dir).is_err());
        std::fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn maps_kinds() {
        assert_eq!(kind_for_extension("pdf"), "pdf");
        assert_eq!(kind_for_extension("xlsx"), "spreadsheet");
        assert_eq!(kind_for_extension("zip"), "other");
    }
}
