use std::fs;
use std::path::Path;

const LEGACY_SYNC_FILE_NAME: &str = "daily-planner-sync.json";
const DEVICE_SYNC_FILE_PREFIX: &str = "daily-planner-sync-";

fn is_sync_file_name(name: &str) -> bool {
    name == LEGACY_SYNC_FILE_NAME
        || (name.starts_with(DEVICE_SYNC_FILE_PREFIX) && name.ends_with(".json"))
}

#[tauri::command]
fn read_text_file(path: String) -> Result<Option<String>, String> {
    match fs::read_to_string(&path) {
        Ok(contents) => Ok(Some(contents)),
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(err) => Err(err.to_string()),
    }
}

#[tauri::command]
fn write_text_file(path: String, contents: String) -> Result<(), String> {
    let target = Path::new(&path);
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    let tmp = format!("{path}.tmp");
    fs::write(&tmp, contents).map_err(|e| e.to_string())?;
    if let Err(first_error) = fs::rename(&tmp, &path) {
        if target.exists() {
            fs::remove_file(target).map_err(|e| e.to_string())?;
            fs::rename(&tmp, target).map_err(|e| e.to_string())?;
        } else {
            return Err(first_error.to_string());
        }
    }
    Ok(())
}

#[tauri::command]
fn list_sync_files(folder: String) -> Result<Vec<String>, String> {
    let directory = Path::new(&folder);
    let entries = match fs::read_dir(directory) {
        Ok(entries) => entries,
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(err) => return Err(err.to_string()),
    };

    let mut paths = Vec::new();
    for entry in entries {
        let entry = entry.map_err(|e| e.to_string())?;
        if !entry.file_type().map_err(|e| e.to_string())?.is_file() {
            continue;
        }

        let name = entry.file_name();
        if name.to_str().is_some_and(is_sync_file_name) {
            paths.push(entry.path().to_string_lossy().into_owned());
        }
    }
    paths.sort();
    Ok(paths)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .invoke_handler(tauri::generate_handler![
            read_text_file,
            write_text_file,
            list_sync_files
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::is_sync_file_name;

    #[test]
    fn identifies_only_sync_snapshots() {
        assert!(is_sync_file_name("daily-planner-sync.json"));
        assert!(is_sync_file_name(
            "daily-planner-sync-550e8400-e29b-41d4-a716-446655440000.json"
        ));
        assert!(!is_sync_file_name("daily-planner-sync.json.tmp"));
        assert!(!is_sync_file_name("daily-planner.json"));
        assert!(!is_sync_file_name("notes.json"));
    }
}
