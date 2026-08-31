#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::{env, fs, path::PathBuf, process::Command};

use serde_json::Value;
use tauri::{Emitter, Manager};

fn supported_book(argument: &str) -> bool {
    let lower = argument.to_lowercase();
    [".pdf", ".epub", ".azw3", ".mobi"]
        .iter()
        .any(|extension| lower.ends_with(extension))
}

#[tauri::command]
fn initial_book_path() -> Option<String> {
    env::args()
        .skip(1)
        .find(|argument| supported_book(argument))
}

fn user_data_dir() -> Result<PathBuf, String> {
    let home = env::var_os("USERPROFILE")
        .or_else(|| env::var_os("HOME"))
        .ok_or_else(|| "Could not find the current user's home directory.".to_string())?;
    Ok(PathBuf::from(home).join(".openthebook"))
}

fn read_json_file(name: &str) -> Result<Option<Value>, String> {
    let path = user_data_dir()?.join(name);
    if !path.exists() {
        return Ok(None);
    }
    let contents = fs::read_to_string(path).map_err(|error| error.to_string())?;
    serde_json::from_str(&contents)
        .map(Some)
        .map_err(|error| error.to_string())
}

fn write_json_file(name: &str, value: &Value) -> Result<(), String> {
    let directory = user_data_dir()?;
    fs::create_dir_all(&directory).map_err(|error| error.to_string())?;
    let path = directory.join(name);
    let temporary = directory.join(format!(".{name}.tmp"));
    let contents = serde_json::to_vec_pretty(value).map_err(|error| error.to_string())?;
    fs::write(&temporary, contents).map_err(|error| error.to_string())?;
    if path.exists() {
        fs::remove_file(&path).map_err(|error| error.to_string())?;
    }
    fs::rename(&temporary, &path).map_err(|error| error.to_string())
}

#[tauri::command]
fn user_data_path() -> Result<String, String> {
    Ok(user_data_dir()?.to_string_lossy().into_owned())
}

#[tauri::command]
fn load_settings() -> Result<Option<Value>, String> {
    read_json_file("config.json")
}

#[tauri::command]
fn save_settings(settings: Value) -> Result<(), String> {
    if !settings.is_object() {
        return Err("Settings must be a JSON object.".to_string());
    }
    write_json_file("config.json", &settings)
}

#[tauri::command]
fn load_highlights() -> Result<Value, String> {
    Ok(read_json_file("highlights.json")?.unwrap_or_else(|| Value::Array(Vec::new())))
}

#[tauri::command]
fn save_highlights(highlights: Value) -> Result<(), String> {
    if !highlights.is_array() {
        return Err("Highlights must be a JSON array.".to_string());
    }
    write_json_file("highlights.json", &highlights)
}

#[tauri::command]
fn load_reading_state() -> Result<Option<Value>, String> {
    read_json_file("reading_state.json")
}

#[tauri::command]
fn save_reading_state(state: Value) -> Result<(), String> {
    if !state.is_object() {
        return Err("Reading state must be a JSON object.".to_string());
    }
    write_json_file("reading_state.json", &state)
}

#[tauri::command]
fn open_default_apps() -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        Command::new("cmd")
            .args(["/C", "start", "", "ms-settings:defaultapps"])
            .spawn()
            .map_err(|error| error.to_string())?;
    }
    #[cfg(target_os = "linux")]
    {
        Command::new("xdg-open")
            .arg("settings://")
            .spawn()
            .map_err(|error| error.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn open_url(url: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        Command::new("cmd")
            .args(["/C", "start", "", &url])
            .spawn()
            .map_err(|error| error.to_string())?;
    }
    #[cfg(target_os = "linux")]
    {
        Command::new("xdg-open")
            .arg(&url)
            .spawn()
            .map_err(|error| error.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn show_main_window(window: tauri::Window) -> Result<(), String> {
    window.show().map_err(|error| error.to_string())?;
    window.set_focus().map_err(|error| error.to_string())?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            if let Some(path) = argv
                .iter()
                .skip(1)
                .find(|argument| supported_book(argument))
            {
                let _ = app.emit("open-file", path.clone());
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.emit("open-file", path.clone());
                }
            }
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .invoke_handler(tauri::generate_handler![
            initial_book_path,
            user_data_path,
            load_settings,
            save_settings,
            load_highlights,
            save_highlights,
            load_reading_state,
            save_reading_state,
            open_default_apps,
            open_url,
            show_main_window
        ])
        .run(tauri::generate_context!())
        .expect("error while running OpenTheBook");
}

fn main() {
    run();
}
