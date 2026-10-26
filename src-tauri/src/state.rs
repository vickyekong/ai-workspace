use std::path::PathBuf;

use crate::ai::AiRegistry;
use crate::db::Database;

pub struct AppState {
    pub db: Database,
    pub ai: AiRegistry,
    pub data_dir: PathBuf,
}
