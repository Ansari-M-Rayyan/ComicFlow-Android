#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::collections::{HashMap, HashSet};
use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use std::sync::{Mutex, OnceLock};
use rusqlite::{params, Connection};
use tauri::Manager;
use walkdir::WalkDir;
use zip::ZipArchive;
use unrar::Archive;
use base64::{engine::general_purpose, Engine as _};
use serde::{Deserialize, Serialize};
use tempfile::Builder;
use natord::compare;
use std::time::{Instant, Duration};

lazy_static::lazy_static! {
    static ref LAST_REQ_TIME: Mutex<Instant> = Mutex::new(Instant::now() - Duration::from_secs(10));
}

// --- DATA STRUCTURES ---
#[derive(Serialize, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
struct CachedComic {
    comic_id: String,
    absolute_path: String,
    vault_id: String,
    vault_name: String,
    series_id: String,
    series_name: String,
    issue_name: String,
    total_pages: usize,
    file_size: u64,
    added_at: u64,
}

#[derive(Serialize, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
struct UserProgress {
    comic_id: String,
    progress: u8,
    last_page_read: usize,
    last_read_timestamp: u64,
    #[serde(default)]
    reading_time_seconds: u64,
}

#[derive(Serialize, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
struct Moment {
    id: String,
    comic_id: String,
    comic_path: String,
    issue_title: String,
    page: usize,
    percent: u8,
    name: String,
    timestamp: u64,
}

#[derive(Serialize, Deserialize, Default, Clone)]
#[serde(rename_all = "camelCase")]
struct ReadingStats {
    issues_read: u32,
    reading_time_seconds: u64,
}

#[derive(Serialize, Deserialize, Default, Clone)]
#[serde(rename_all = "camelCase")]
struct VaultData {
    #[serde(default)] library_files: HashMap<String, CachedComic>,
    #[serde(default)] user_progress: HashMap<String, UserProgress>,
    #[serde(default)] stats: ReadingStats,
    #[serde(default)] moments: Vec<Moment>,
    #[serde(default)] issue_collections: HashMap<String, Vec<String>>,
    #[serde(default)] series_collections: HashMap<String, Vec<String>>,
    #[serde(default)] pub comic_vine_metadata: HashMap<String, serde_json::Value>,
    #[serde(default)] pub series_comic_vine_volume: HashMap<String, serde_json::Value>,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct Issue {
    id: String,
    vault_id: String,
    series_id: String,
    title: String,
    issue: String,
    path: String,
    total_pages: usize,
    progress: u8,
    last_page_read: usize,
    last_read: u64,
    reading_time: u64,
    collections: Vec<String>,
    added_at: u64,
    fresh: bool,
    #[serde(default)] comic_vine_metadata: Option<serde_json::Value>,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct Series {
    id: String,
    name: String,
    path: String,
    issues: Vec<Issue>,
    collections: Vec<String>,
    #[serde(default)] comic_vine_volume: Option<serde_json::Value>,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct Vault {
    id: String,
    name: String,
    path: String,
    series: Vec<Series>,
}

// --- HELPERS ---
fn format_title(s: &str) -> String {
    s.split(|c| c == '-' || c == '_')
        .map(|part| {
            let mut c = part.chars();
            match c.next() {
                None => String::new(),
                Some(f) => f.to_uppercase().collect::<String>() + c.as_str(),
            }
        })
        .collect::<Vec<String>>()
        .join(" ")
}

fn normalize_id_part(value: &str) -> String {
    value.trim().to_lowercase()
}

fn generate_series_id(vault: &str, series: &str) -> String {
    format!("{}::{}", normalize_id_part(vault), normalize_id_part(series))
}

fn generate_stable_id(vault: &str, series: &str, issue: &str) -> String {
    format!(
        "{}::{}::{}",
        normalize_id_part(vault),
        normalize_id_part(series),
        normalize_id_part(issue)
    )
}

static VAULT_LOCK: OnceLock<Mutex<()>> = OnceLock::new();

fn vault_lock() -> &'static Mutex<()> {
    VAULT_LOCK.get_or_init(|| Mutex::new(()))
}

#[derive(Clone)]
struct PageMetadata {
    ambient: String,
}

#[derive(Clone)]
struct ArchiveIndex {
    signature: u128,
    pages: Vec<String>,
    page_meta: HashMap<usize, PageMetadata>,
}

#[derive(Serialize)]
struct DictionaryEntry {
    word: String,
    #[serde(rename = "partOfSpeech")]
    part_of_speech: String,
    definition: String,
}

static ARCHIVE_INDEX_CACHE: OnceLock<Mutex<HashMap<String, ArchiveIndex>>> = OnceLock::new();

fn archive_index_cache() -> &'static Mutex<HashMap<String, ArchiveIndex>> {
    ARCHIVE_INDEX_CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}

fn file_signature(path: &Path) -> u128 {
    let metadata = match fs::metadata(path) {
        Ok(metadata) => metadata,
        Err(_) => return 0,
    };
    let modified = metadata
        .modified()
        .ok()
        .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
        .map(|duration| duration.as_secs())
        .unwrap_or(0);
    ((modified as u128) << 64) | metadata.len() as u128
}

fn get_vault_file_path(root_folder: &str) -> PathBuf {
    Path::new(root_folder).join("panel_vault_data.json")
}

fn load_vault_data(root_folder: &str) -> VaultData {
    let path = get_vault_file_path(root_folder);
    if path.exists() {
        if let Ok(file) = File::open(&path) {
            if let Ok(data) = serde_json::from_reader(file) { return data; }
        }
    }
    VaultData::default()
}

fn save_vault_data(root_folder: &str, data: &VaultData) -> Result<(), String> {
    let path = get_vault_file_path(root_folder);
    let temp_path = path.with_extension("tmp");
    let json_string = serde_json::to_string_pretty(data).map_err(|e| e.to_string())?;
    
    let mut file = File::create(&temp_path).map_err(|e| e.to_string())?;
    file.write_all(json_string.as_bytes()).map_err(|e| e.to_string())?;
    file.sync_all().map_err(|e| e.to_string())?;
    drop(file);

    #[cfg(target_os = "windows")]
    if path.exists() {
        fs::remove_file(&path).map_err(|e| e.to_string())?;
    }

    fs::rename(&temp_path, &path).map_err(|e| e.to_string())?;
    Ok(())
}

fn build_vaults(vault_data: &VaultData) -> Vec<Vault> {
    let mut vault_map: HashMap<String, HashMap<String, Vec<Issue>>> = HashMap::new();
    let mut vault_names: HashMap<String, String> = HashMap::new();
    let mut series_names: HashMap<String, String> = HashMap::new();
    let now_time = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs();

    for (comic_id, file) in &vault_data.library_files {
        let prog = vault_data.user_progress.get(comic_id);
        let progress = prog.map(|p| p.progress).unwrap_or(0);
        let last_page = prog.map(|p| p.last_page_read).unwrap_or(1);
        let last_read = prog.map(|p| p.last_read_timestamp).unwrap_or(0);
        let reading_time = prog.map(|p| p.reading_time_seconds).unwrap_or(0);
        let collections = vault_data.issue_collections.get(comic_id).cloned().unwrap_or_default();
        
        let fresh = progress == 0 && (now_time.saturating_sub(file.added_at) < 172800);

        let issue = Issue {
            id: file.comic_id.clone(),
            vault_id: file.vault_id.clone(),
            series_id: file.series_id.clone(),
            title: file.series_name.clone(),
            issue: file.issue_name.clone(),
            path: file.absolute_path.clone(),
            total_pages: file.total_pages,
            progress,
            last_page_read: last_page,
            last_read,
            reading_time,
            collections,
            added_at: file.added_at,
            fresh,
            comic_vine_metadata: vault_data.comic_vine_metadata.get(comic_id).cloned(),
        };

        vault_names.insert(file.vault_id.clone(), file.vault_name.clone());
        series_names.insert(file.series_id.clone(), file.series_name.clone());

        vault_map.entry(file.vault_id.clone())
            .or_default()
            .entry(file.series_id.clone())
            .or_default()
            .push(issue);
    }

    let mut vaults: Vec<Vault> = Vec::new();
    for (v_id, series_dict) in vault_map {
        let v_name = vault_names.get(&v_id).cloned().unwrap_or(v_id.clone());
        let mut series_vec: Vec<Series> = Vec::new();

        for (s_id, mut issues) in series_dict {
            issues.sort_by(|a, b| compare(&a.issue, &b.issue));
            let s_name = series_names.get(&s_id).cloned().unwrap_or(s_id.clone());
            let legacy_series_id = s_id.split("--").last().unwrap_or(&s_id);
            let collections = vault_data.series_collections.get(&s_id).cloned()
                .or_else(|| vault_data.series_collections.get(legacy_series_id).cloned())
                .unwrap_or_default();
            
            let comic_vine_volume = vault_data.series_comic_vine_volume.get(&s_name).cloned();
            
            series_vec.push(Series {
                id: s_id,
                name: s_name,
                path: String::new(),
                issues,
                collections,
                comic_vine_volume,
            });
        }

        series_vec.sort_by(|a, b| a.name.cmp(&b.name));
        vaults.push(Vault {
            id: v_id,
            name: v_name,
            path: String::new(),
            series: series_vec,
        });
    }

    vaults.sort_by(|a, b| a.name.cmp(&b.name));
    vaults
}

// --- ARCHIVE EXTRACTION ---
fn is_valid_comic_page(name: &str) -> bool {
    let lower = name.to_lowercase();
    if lower.contains("__macosx") || lower.contains(".ds_store") || name.ends_with('/') || name.ends_with('\\') { return false; }
    let file_name = name.split('/').last().unwrap_or("").split('\\').last().unwrap_or("");
    if file_name.starts_with('.') { return false; }
    lower.ends_with(".jpg") || lower.ends_with(".jpeg") || lower.ends_with(".png") || lower.ends_with(".webp")
}

fn build_archive_index(file_path: &Path) -> Result<Vec<String>, String> {
    let ext = file_path.extension().unwrap_or_default().to_string_lossy().to_lowercase();
    let mut pages = Vec::new();

    match ext.as_str() {
        "cbz" => {
            let file = File::open(file_path).map_err(|e| e.to_string())?;
            let mut archive = ZipArchive::new(file).map_err(|e| e.to_string())?;
            for i in 0..archive.len() {
                let entry = archive.by_index(i).map_err(|e| e.to_string())?;
                let name = entry.name().to_string();
                if is_valid_comic_page(&name) {
                    pages.push(name);
                }
            }
        }
        "cbr" => {
            let path_str = file_path.to_string_lossy().to_string();
            let mut archive = Archive::new(&path_str).open_for_processing().map_err(|e| e.to_string())?;
            while let Ok(Some(header)) = archive.read_header() {
                let name = header.entry().filename.to_string_lossy().to_string();
                if is_valid_comic_page(&name) {
                    pages.push(name);
                }
                archive = header.skip().map_err(|e| e.to_string())?;
            }
        }
        _ => return Err("Unsupported format".into()),
    }

    if pages.is_empty() {
        return Err("No images found".into());
    }

    pages.sort_by(|a, b| compare(a, b));
    Ok(pages)
}

fn get_archive_page_names(file_path: &Path) -> Result<Vec<String>, String> {
    let key = file_path.to_string_lossy().into_owned();
    let signature = file_signature(file_path);

    if let Ok(cache) = archive_index_cache().lock() {
        if let Some(index) = cache.get(&key) {
            if index.signature == signature {
                return Ok(index.pages.clone());
            }
        }
    }

    let pages = build_archive_index(file_path)?;
    if let Ok(mut cache) = archive_index_cache().lock() {
        cache.insert(key, ArchiveIndex { signature, pages: pages.clone(), page_meta: HashMap::new() });
    }
    Ok(pages)
}

fn get_comic_page_count(file_path: &Path) -> Result<usize, String> {
    get_archive_page_names(file_path).map(|pages| pages.len())
}

fn create_cbr_temp_dir() -> Result<tempfile::TempDir, String> {
    if let Ok(dir) = Builder::new().prefix("cf_cbr_extract").tempdir() {
        return Ok(dir);
    }
    // Fallback paths on Android when TMPDIR is not set or restricted
    let fallbacks = [
        "/data/user/0/com.ansari_rayyan.comicflow/cache",
        "/data/data/com.ansari_rayyan.comicflow/cache",
    ];
    for fb in &fallbacks {
        let p = Path::new(fb);
        if p.exists() {
            if let Ok(dir) = Builder::new().prefix("cf_cbr_extract").tempdir_in(p) {
                return Ok(dir);
            }
        }
    }
    Err("Failed to create temporary directory for CBR archive extraction".to_string())
}

fn get_page_buffer(file_path: &Path, page_index: usize) -> Result<(Vec<u8>, String, usize), String> {
    let ext = file_path.extension().unwrap_or_default().to_string_lossy().to_lowercase();
    let image_names = get_archive_page_names(file_path)?;
    let total_pages = image_names.len();
    let safe_index = page_index.min(total_pages.saturating_sub(1));
    let target_name = &image_names[safe_index];

    if ext == "cbz" {
        let file = File::open(file_path).map_err(|e| e.to_string())?;
        let mut archive = ZipArchive::new(file).map_err(|e| e.to_string())?;
        let mut target_file = archive.by_name(target_name).map_err(|e| e.to_string())?;
        let mut buffer = Vec::new();
        target_file.read_to_end(&mut buffer).map_err(|e| e.to_string())?;
        let lower = target_name.to_lowercase();
        let mime = if lower.ends_with(".png") { "image/png" } else if lower.ends_with(".webp") { "image/webp" } else { "image/jpeg" };
        Ok((buffer, mime.into(), total_pages))
    } else if ext == "cbr" {
        let path_str = file_path.to_string_lossy().to_string();
        let temp_dir = create_cbr_temp_dir()?;
        let mut archive = Archive::new(&path_str).open_for_processing().map_err(|e| e.to_string())?;
        let mut extracted_path = None;
        let lower_target = target_name.to_lowercase();
        let mime = if lower_target.ends_with(".png") { "image/png" } else if lower_target.ends_with(".webp") { "image/webp" } else { "image/jpeg" };

        while let Ok(Some(header)) = archive.read_header() {
            let name = header.entry().filename.to_string_lossy().to_string();
            if name == *target_name {
                let out_path = temp_dir.path().join("cf_page.bin");
                header.extract_to(&out_path).map_err(|e| e.to_string())?;
                extracted_path = Some(out_path);
                break;
            }
            archive = header.skip().map_err(|e| e.to_string())?;
        }

        let path = extracted_path.ok_or_else(|| "Failed to extract target CBR image".to_string())?;
        let mut file = File::open(path).map_err(|e| e.to_string())?;
        let mut buffer = Vec::new();
        file.read_to_end(&mut buffer).map_err(|e| e.to_string())?;
        Ok((buffer, mime.into(), total_pages))
    } else {
        Err("Unsupported format".into())
    }
}

fn optimize_reader_buffer(buffer: &[u8], mime: &str) -> (Vec<u8>, String, String) {
    let max_width: u32 = 1600;
    if let Ok(img) = image::load_from_memory(buffer) {
        // Fast ambient calculation from downsampled thumbnail
        let ambient = {
            let resized = img.resize_exact(16, 16, image::imageops::FilterType::Nearest).to_rgb8();
            let mut r = 0u64; let mut g = 0u64; let mut b = 0u64;
            let count = (16 * 16) as u64;
            for pixel in resized.pixels() { r += pixel[0] as u64; g += pixel[1] as u64; b += pixel[2] as u64; }
            let r_avg = (r / count) / 3; let g_avg = (g / count) / 3; let b_avg = (b / count) / 3;
            let r_final = std::cmp::max(r_avg, 12); let g_final = std::cmp::max(g_avg, 12); let b_final = std::cmp::max(b_avg, 12);
            format!("#{:02x}{:02x}{:02x}", r_final, g_final, b_final)
        };

        // If the comic page exceeds 1600px width, downscale for crystal-clear mobile display while saving ~80% RAM
        if img.width() > max_width {
            let resized = img.resize(max_width, u32::MAX, image::imageops::FilterType::Triangle);
            let mut encoded = Vec::new();
            if resized.write_to(&mut std::io::Cursor::new(&mut encoded), image::ImageFormat::Jpeg).is_ok() {
                return (encoded, "image/jpeg".to_string(), ambient);
            }
        }

        return (buffer.to_vec(), mime.to_string(), ambient);
    }
    (buffer.to_vec(), mime.to_string(), "#090909".to_string())
}

// --- SCAN ENGINE ---

#[tauri::command]
async fn load_cached_library(folder_path: String) -> Result<Vec<Vault>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let _vault_guard = vault_lock().lock().map_err(|e| e.to_string())?;
        let vault_data = load_vault_data(&folder_path);
        Ok(build_vaults(&vault_data))
    }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
async fn scan_library(folder_path: String) -> Result<Vec<Vault>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let root_path = Path::new(&folder_path);
        if !root_path.exists() { return Err("Folder does not exist".into()); }

        let _vault_guard = vault_lock().lock().map_err(|e| e.to_string())?;
        let mut vault_data = load_vault_data(&folder_path);
        let mut seen_ids = HashSet::new();
        let mut has_changes = false;
        let now_time = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs();

        for entry in WalkDir::new(root_path).into_iter().filter_map(|e| e.ok()) {
            let path = entry.path();
            if !path.is_file() { continue; }
            let ext = path.extension().unwrap_or_default().to_string_lossy().to_lowercase();
            if ext != "cbz" && ext != "cbr" { continue; }

            let current_size = fs::metadata(path).map(|m| m.len()).unwrap_or(0);
            let abs_path = path.to_string_lossy().into_owned();
            let issue_name = path.file_stem().unwrap_or_default().to_string_lossy().into_owned();
            let rel_path = path.strip_prefix(root_path).unwrap_or(path);
            let mut components: Vec<String> = rel_path.iter().map(|c| c.to_string_lossy().into_owned()).collect();

            // If user selected a parent folder (e.g. Download or wrapper Comics folder), strip top wrapper if nested deeper
            if components.len() >= 4 && (components[0].eq_ignore_ascii_case("comics") || components[0].eq_ignore_ascii_case("download")) {
                components.remove(0);
            }

            let (vault_raw, series_raw) = match components.len() {
                0 | 1 => ("Default Vault".to_string(), "Unsorted".to_string()),
                2 => ("Default Vault".to_string(), components[0].clone()),
                3 => (components[0].clone(), components[1].clone()),
                _ => {
                    let vault = components[0].clone();
                    let series = components[components.len() - 2].clone();
                    (vault, series)
                }
            };

            let vault_name = format_title(&vault_raw);
            let series_name = format_title(&series_raw);
            let vault_id = normalize_id_part(&vault_name);
            let series_id = generate_series_id(&vault_name, &series_name);
            let comic_id = generate_stable_id(&vault_name, &series_name, &issue_name);
            seen_ids.insert(comic_id.clone());

            let cached = vault_data.library_files.get(&comic_id).cloned();
            let metadata_changed = cached.as_ref().map(|c| {
                c.file_size != current_size
                    || c.absolute_path != abs_path
                    || c.vault_id != vault_id
                    || c.series_id != series_id
            }).unwrap_or(true);

            if metadata_changed {
                let size_changed = cached.as_ref().map(|c| c.file_size != current_size).unwrap_or(true);
                let total_pages = if size_changed {
                    match get_comic_page_count(path) {
                        Ok(n) if n > 0 => n,
                        Ok(_) | Err(_) => {
                            eprintln!("Skipping invalid comic archive: {}", abs_path);
                            continue;
                        }
                    }
                } else {
                    cached.as_ref().map(|c| c.total_pages).unwrap_or(0)
                };

                vault_data.library_files.insert(comic_id.clone(), CachedComic {
                    comic_id,
                    absolute_path: abs_path,
                    vault_id,
                    vault_name,
                    series_id,
                    series_name,
                    issue_name,
                    total_pages,
                    file_size: current_size,
                    added_at: cached.and_then(|c| if c.added_at > 0 { Some(c.added_at) } else { None }).unwrap_or(now_time),
                });
                has_changes = true;
            }
        }

        let initial_len = vault_data.library_files.len();
        vault_data.library_files.retain(|id, _| seen_ids.contains(id));
        if vault_data.library_files.len() != initial_len { has_changes = true; }
        if has_changes { save_vault_data(&folder_path, &vault_data).ok(); }

        Ok(build_vaults(&vault_data))
    }).await.map_err(|e| e.to_string())?
}

// --- SECURE CACHED EXTRACTION IN ROOT DIRECTORY ---
#[tauri::command]
async fn get_comic_cover(root_folder: String, file_path: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let path = Path::new(&file_path);
        let sig = file_signature(path);

        let cover_dir = Path::new(&root_folder).join(".comicflow_covers");
        fs::create_dir_all(&cover_dir).ok();

        let out_path = cover_dir.join(format!("{:x}_thumb420.jpg", sig));

        if out_path.exists() {
            let buffer = fs::read(&out_path).map_err(|e| e.to_string())?;
            let b64 = general_purpose::STANDARD.encode(&buffer);
            return Ok(format!("data:image/jpeg;base64,{}", b64));
        }

        let (buffer, _mime, _) = get_page_buffer(path, 0)?;

        // Covers are display-only in the library. Keep them small to reduce
        // image decode/upload work while leaving reader pages untouched.
        let source = image::load_from_memory(&buffer)
            .map_err(|e| format!("Failed to decode cover: {e}"))?;
        let max_width: u32 = 420;
        let thumbnail = if source.width() > max_width {
            source.resize(max_width, u32::MAX, image::imageops::FilterType::Triangle)
        } else {
            source
        };

        let mut encoded = Vec::new();
        {
            let mut cursor = std::io::Cursor::new(&mut encoded);
            thumbnail
                .write_to(&mut cursor, image::ImageFormat::Jpeg)
                .map_err(|e| format!("Failed to encode cover: {e}"))?;
        }

        fs::write(&out_path, &encoded).map_err(|e| e.to_string())?;

        let b64 = general_purpose::STANDARD.encode(&encoded);
        Ok(format!("data:image/jpeg;base64,{}", b64))
    }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
async fn read_comic_page_thumbnail(root_folder: String, file_path: String, page: usize) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let path = Path::new(&file_path);
        let sig = file_signature(path);

        let thumb_dir = Path::new(&root_folder).join(".comicflow_thumbs");
        fs::create_dir_all(&thumb_dir).ok();

        let out_path = thumb_dir.join(format!("{:x}_p{}_480.jpg", sig, page));

        if out_path.exists() {
            if let Ok(buffer) = fs::read(&out_path) {
                let b64 = general_purpose::STANDARD.encode(&buffer);
                return Ok(format!("data:image/jpeg;base64,{}", b64));
            }
        }

        let (buffer, _mime, _) = get_page_buffer(path, page)?;

        let source = image::load_from_memory(&buffer)
            .map_err(|e| format!("Failed to decode page thumbnail: {e}"))?;
        let max_width: u32 = 480;
        let thumbnail = if source.width() > max_width {
            source.resize(max_width, u32::MAX, image::imageops::FilterType::Triangle)
        } else {
            source
        };

        let mut encoded = Vec::new();
        {
            let mut cursor = std::io::Cursor::new(&mut encoded);
            thumbnail
                .write_to(&mut cursor, image::ImageFormat::Jpeg)
                .map_err(|e| format!("Failed to encode page thumbnail: {e}"))?;
        }

        fs::write(&out_path, &encoded).ok();

        let b64 = general_purpose::STANDARD.encode(&encoded);
        Ok(format!("data:image/jpeg;base64,{}", b64))
    }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
async fn clear_app_cache(root_folder: String) -> Result<u64, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let mut freed_bytes: u64 = 0;
        let root = Path::new(&root_folder);
        let covers = root.join(".comicflow_covers");
        let thumbs = root.join(".comicflow_thumbs");

        for dir in &[covers, thumbs] {
            if dir.exists() {
                if let Ok(entries) = fs::read_dir(dir) {
                    for entry in entries.flatten() {
                        if let Ok(meta) = entry.metadata() {
                            freed_bytes += meta.len();
                        }
                        fs::remove_file(entry.path()).ok();
                    }
                }
                fs::remove_dir(dir).ok();
            }
        }
        Ok(freed_bytes)
    }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
async fn reset_library_data(root_folder: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = vault_lock().lock().map_err(|e| e.to_string())?;
        let vault_file = get_vault_file_path(&root_folder);
        if vault_file.exists() {
            fs::remove_file(&vault_file).map_err(|e| e.to_string())?;
        }
        Ok(())
    }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
async fn read_comic_page(file_path: String, page: usize) -> Result<(String, usize, String), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let path = Path::new(&file_path);
        let sig = file_signature(path);
        let key = file_path.clone();
        
        let mut ambient = String::from("#090909");
        let mut meta_found = false;

        if let Ok(mut cache) = archive_index_cache().lock() {
            if let Some(idx) = cache.get_mut(&key) {
                if idx.signature == sig {
                    if let Some(meta) = idx.page_meta.get(&page) {
                        ambient = meta.ambient.clone();
                        meta_found = true;
                    }
                }
            }
        }
        
        let (raw_buffer, raw_mime, total) = get_page_buffer(path, page)?;
        
        let (buffer, mime, extracted_ambient) = optimize_reader_buffer(&raw_buffer, &raw_mime);

        if !meta_found {
            ambient = extracted_ambient;
            if let Ok(mut cache) = archive_index_cache().lock() {
                if let Some(idx) = cache.get_mut(&key) {
                    idx.page_meta.insert(page, PageMetadata { ambient: ambient.clone() });
                }
            }
        }
        
        let b64 = general_purpose::STANDARD.encode(&buffer);
        Ok((format!("data:{};base64,{}", mime, b64), total, ambient))
    }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
fn update_progress(root_folder: String, comic_id: String, current_page: usize, total_pages: usize) -> Result<(), String> {
    let _guard = vault_lock().lock().map_err(|e| e.to_string())?;
    let mut vault_data = load_vault_data(&root_folder);
    let now = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs();
    let safe_total = total_pages.max(1);
    let safe_page = current_page.min(safe_total);
    let progress = (((safe_page as f32) / (safe_total as f32)) * 100.0).round().clamp(0.0, 100.0) as u8;
    
    let entry = vault_data.user_progress.entry(comic_id.clone()).or_insert_with(|| UserProgress {
        comic_id,
        ..Default::default()
    });
    
    entry.progress = progress;
    entry.last_page_read = safe_page;
    entry.last_read_timestamp = now;

    save_vault_data(&root_folder, &vault_data)?;
    Ok(())
}

#[tauri::command]
fn add_reading_time(root_folder: String, comic_id: String, seconds_added: u64) -> Result<(), String> {
    let _guard = vault_lock().lock().map_err(|e| e.to_string())?;
    let mut vault_data = load_vault_data(&root_folder);
    vault_data.stats.reading_time_seconds += seconds_added;
    
    let progress = vault_data.user_progress.entry(comic_id.clone()).or_insert_with(|| UserProgress {
        comic_id,
        ..Default::default()
    });
    
    progress.reading_time_seconds += seconds_added;
    progress.last_read_timestamp = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs();

    save_vault_data(&root_folder, &vault_data)?;
    Ok(())
}

#[tauri::command]
fn mark_as_read(root_folder: String, comic_id: String, total_pages: usize) -> Result<(), String> {
    let _guard = vault_lock().lock().map_err(|e| e.to_string())?;
    let mut vault_data = load_vault_data(&root_folder);
    let now = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs();
    
    let entry = vault_data.user_progress.entry(comic_id.clone()).or_insert_with(|| UserProgress {
        comic_id,
        ..Default::default()
    });
    
    entry.progress = 100;
    entry.last_page_read = total_pages;
    entry.last_read_timestamp = now;

    save_vault_data(&root_folder, &vault_data)?;
    Ok(())
}

#[tauri::command]
fn mark_as_unread(root_folder: String, comic_id: String) -> Result<(), String> {
    let _guard = vault_lock().lock().map_err(|e| e.to_string())?;
    let mut vault_data = load_vault_data(&root_folder);
    if let Some(entry) = vault_data.user_progress.get_mut(&comic_id) {
        entry.progress = 0;
        entry.last_page_read = 1;
    }
    save_vault_data(&root_folder, &vault_data)?;
    Ok(())
}

#[tauri::command]
fn toggle_collection(root_folder: String, id: String, is_series: bool, collection: String) -> Result<(), String> {
    let _guard = vault_lock().lock().map_err(|e| e.to_string())?;
    let mut vault_data = load_vault_data(&root_folder);
    let map = if is_series { &mut vault_data.series_collections } else { &mut vault_data.issue_collections };
    
    let entry = map.entry(id).or_default();
    if let Some(pos) = entry.iter().position(|x| x == &collection) {
        entry.remove(pos);
    } else {
        entry.push(collection);
    }
    
    save_vault_data(&root_folder, &vault_data)?;
    Ok(())
}

#[tauri::command]
fn get_reading_journey(root_folder: String) -> Result<ReadingStats, String> {
    let vault_data = load_vault_data(&root_folder);
    let issues_read = vault_data.user_progress.values().filter(|p| p.progress == 100).count() as u32;
    Ok(ReadingStats {
        issues_read,
        reading_time_seconds: vault_data.stats.reading_time_seconds,
    })
}

#[tauri::command]
async fn lookup_dictionary(app: tauri::AppHandle, query: String) -> Result<Vec<DictionaryEntry>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let cleaned = query.trim().to_lowercase();
        if cleaned.is_empty() {
            return Ok(Vec::new());
        }

        let mut candidates = Vec::new();

        if let Ok(app_data) = app.path().app_data_dir() {
            candidates.push(app_data.join("dictionary.sqlite"));
            candidates.push(app_data.join("dictionary").join("dictionary.sqlite"));
        }

        // On Android, Kotlin extracts the asset to filesDir/dictionary.sqlite
        let android_files_dirs = [
            "/data/user/0/com.ansari_rayyan.comicflow/files/dictionary.sqlite",
            "/data/data/com.ansari_rayyan.comicflow/files/dictionary.sqlite",
        ];
        for path in android_files_dirs {
            candidates.push(PathBuf::from(path));
        }

        if let Ok(resource_dir) = app.path().resource_dir() {
            candidates.push(resource_dir.join("dictionary").join("dictionary.sqlite"));
            candidates.push(resource_dir.join("dictionary.sqlite"));
        }

        if let Ok(current_dir) = std::env::current_dir() {
            candidates.push(current_dir.join("src-tauri").join("resources").join("dictionary").join("dictionary.sqlite"));
            candidates.push(current_dir.join("resources").join("dictionary").join("dictionary.sqlite"));
        }

        let db_path = candidates
            .into_iter()
            .find(|path| path.exists())
            .ok_or_else(|| "Dictionary database not found. Place dictionary.sqlite in the bundled dictionary resources folder.".to_string())?;

        let conn = Connection::open(db_path)
            .map_err(|e| format!("Failed to open dictionary: {e}"))?;

        let mut statement = conn.prepare(
            r#"
            SELECT
                w.word,
                syn.posid,
                syn.definition
            FROM words w
            INNER JOIN senses s ON s.wordid = w.wordid
            INNER JOIN synsets syn ON syn.synsetid = s.synsetid
            WHERE lower(w.word) = ?1
            ORDER BY
                CASE syn.posid
                    WHEN 'n' THEN 1
                    WHEN 'v' THEN 2
                    WHEN 'a' THEN 3
                    WHEN 's' THEN 3
                    WHEN 'r' THEN 4
                    ELSE 5
                END,
                syn.synsetid
            LIMIT 24
            "#,
        ).map_err(|e| format!("Failed to prepare dictionary query: {e}"))?;

        let rows = statement.query_map(params![cleaned], |row| {
            let pos: String = row.get(1)?;
            let part_of_speech = match pos.as_str() {
                "n" => "noun",
                "v" => "verb",
                "a" | "s" => "adjective",
                "r" => "adverb",
                _ => "other",
            }.to_string();

            Ok(DictionaryEntry {
                word: row.get(0)?,
                part_of_speech,
                definition: row.get(2)?,
            })
        }).map_err(|e| format!("Dictionary lookup failed: {e}"))?;

        let mut results = Vec::new();
        for row in rows {
            results.push(row.map_err(|e| format!("Failed to read dictionary entry: {e}"))?);
        }

        Ok(results)
    }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
fn save_moment(root_folder: String, comic_id: String, comic_path: String, issue_title: String, page: usize, percent: u8, name: String) -> Result<(), String> {
    let _guard = vault_lock().lock().map_err(|e| e.to_string())?;
    let mut vault_data = load_vault_data(&root_folder);
    let now = SystemTime::now().duration_since(UNIX_EPOCH).unwrap();
    let id = format!("moment_{}_{}", now.as_secs(), now.subsec_nanos());
    
    vault_data.moments.push(Moment { id, comic_id, comic_path, issue_title, page, percent, name, timestamp: now.as_secs() });
    save_vault_data(&root_folder, &vault_data)?;
    Ok(())
}

#[tauri::command]
fn get_moments(root_folder: String) -> Result<Vec<Moment>, String> {
    let mut vault_data = load_vault_data(&root_folder);
    vault_data.moments.sort_by(|a, b| b.timestamp.cmp(&a.timestamp));
    Ok(vault_data.moments)
}

#[tauri::command]
fn delete_moment(root_folder: String, moment_id: String) -> Result<(), String> {
    let _guard = vault_lock().lock().map_err(|e| e.to_string())?;
    let mut vault_data = load_vault_data(&root_folder);
    vault_data.moments.retain(|m| m.id != moment_id);
    save_vault_data(&root_folder, &vault_data)?;
    Ok(())
}

#[tauri::command]
fn exit_app() {
    std::process::exit(0);
}

#[tauri::command]
fn show_window(window: tauri::Window) {
    let _ = window.show();
}

#[tauri::command]
fn open_path(path: String) -> Result<(), String> {
    let target = Path::new(&path);
    let _parent = target.parent().unwrap_or(target);

    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer").arg("/select,").arg(&path).spawn().map_err(|e| e.to_string())?;
    }

    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open").arg("-R").arg(&path).spawn().map_err(|e| e.to_string())?;
    }

    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open").arg(parent).spawn().map_err(|e| e.to_string())?;
    }

    Ok(())
}

#[tauri::command]
async fn fetch_comicvine(
    api_key: Option<String>,
    endpoint: Option<String>,
    query_params: Option<HashMap<String, String>>,
    url: Option<String>,
) -> Result<String, String> {
    let sleep_dur = {
        let mut last_req = LAST_REQ_TIME.lock().unwrap();
        let now = Instant::now();
        let elapsed = now.duration_since(*last_req);
        let sleep_dur = if elapsed < Duration::from_millis(1100) {
            Some(Duration::from_millis(1100) - elapsed)
        } else {
            None
        };
        *last_req = now + sleep_dur.unwrap_or(Duration::ZERO);
        sleep_dur
    };

    if let Some(dur) = sleep_dur {
        tokio::time::sleep(dur).await;
    }

    let client = reqwest::Client::builder()
        .user_agent("ComicFlow/0.2.3 (Linux; Android; Mobile; ComicVine Client)")
        .build()
        .map_err(|e| e.to_string())?;

    let final_url = if let Some(direct_url) = url {
        direct_url
    } else {
        let ep = endpoint.unwrap_or_default();
        let normalized_ep = if ep.ends_with('/') || ep.contains('?') { ep } else { format!("{}/", ep) };
        format!("https://comicvine.gamespot.com/api/{}", normalized_ep)
    };

    let mut req = client.get(&final_url)
        .header("Accept", "application/json")
        .header("Referer", "https://comicvine.gamespot.com/");

    if let Some(key) = api_key {
        req = req.query(&[("api_key", key), ("format", "json".to_string())]);
    }
    if let Some(params) = query_params {
        for (k, v) in &params {
            req = req.query(&[(k, v)]);
        }
    }

    let res = req.send().await.map_err(|e| format!("Network request failed: {e}"))?;
    let status = res.status();
    let text = res.text().await.map_err(|e| format!("Failed to read response body: {e}"))?;

    if !status.is_success() {
        if status.as_u16() == 401 || status.as_u16() == 403 {
            return Err("ComicVine API Key is invalid or unauthorized (HTTP 401/403). Please verify your key at comicvine.gamespot.com.".into());
        } else if status.as_u16() == 429 {
            return Err("ComicVine rate limit exceeded (HTTP 429). Please wait a moment before trying again.".into());
        } else {
            return Err(format!("ComicVine request failed with HTTP {}: {}", status, text.chars().take(200).collect::<String>()));
        }
    }

    if text.trim_start().starts_with('<') {
        return Err("ComicVine returned an HTML response instead of JSON. The API key might be invalid, rate limited, or blocked by Cloudflare.".into());
    }

    Ok(text)
}

#[tauri::command]
fn save_comicvine_metadata(root_folder: String, comic_id: String, metadata: serde_json::Value) -> Result<(), String> {
    let _lock = vault_lock().lock().unwrap();
    let mut data = load_vault_data(&root_folder);
    data.comic_vine_metadata.insert(comic_id, metadata);
    save_vault_data(&root_folder, &data)
}

#[tauri::command]
fn save_series_volume(root_folder: String, series_name: String, volume_data: serde_json::Value) -> Result<(), String> {
    let _lock = vault_lock().lock().unwrap();
    let mut data = load_vault_data(&root_folder);
    data.series_comic_vine_volume.insert(series_name, volume_data);
    save_vault_data(&root_folder, &data)
}

#[tauri::command]
fn read_embedded_comic_info(file_path: String) -> Result<Option<String>, String> {
    let path = Path::new(&file_path);
    if !path.exists() {
        return Err("File does not exist".into());
    }
    let ext = path.extension().unwrap_or_default().to_string_lossy().to_lowercase();
    
    if ext == "cbz" {
        let file = File::open(&file_path).map_err(|e| e.to_string())?;
        let mut archive = ZipArchive::new(file).map_err(|e| e.to_string())?;
        for i in 0..archive.len() {
            let mut file = archive.by_index(i).map_err(|e| e.to_string())?;
            if file.name().to_lowercase() == "comicinfo.xml" {
                let mut buffer = String::new();
                file.read_to_string(&mut buffer).map_err(|e| e.to_string())?;
                return Ok(Some(buffer));
            }
        }
    } else if ext == "cbr" {
        let temp_dir = Builder::new().prefix("cf_cbr_extract").tempdir().map_err(|e| e.to_string())?;
        let mut archive = Archive::new(&file_path).open_for_processing().map_err(|e| e.to_string())?;
        let mut extracted_path = None;
        while let Ok(Some(header)) = archive.read_header() {
            let name = header.entry().filename.to_string_lossy().to_lowercase();
            if name == "comicinfo.xml" {
                let out_path = temp_dir.path().join("ComicInfo.xml");
                header.extract_to(&out_path).map_err(|e| e.to_string())?;
                extracted_path = Some(out_path);
                break;
            } else {
                archive = header.skip().map_err(|e| e.to_string())?;
            }
        }
        if let Some(path) = extracted_path {
            let buffer = fs::read_to_string(path).map_err(|e| e.to_string())?;
            return Ok(Some(buffer));
        }
    }
    Ok(None)
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DirItem {
    pub name: String,
    pub path: String,
    pub has_subdirs: bool,
    pub comic_count: usize,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DirectoryListing {
    pub current_path: String,
    pub parent_path: Option<String>,
    pub items: Vec<DirItem>,
    pub shortcuts: Vec<DirItem>,
}

#[tauri::command]
fn list_directories(current_path: Option<String>) -> Result<DirectoryListing, String> {
    let default_root = if cfg!(target_os = "android") {
        if Path::new("/storage/emulated/0/Download").exists() {
            "/storage/emulated/0/Download".to_string()
        } else {
            "/storage/emulated/0".to_string()
        }
    } else {
        std::env::var("USERPROFILE").or_else(|_| std::env::var("HOME")).unwrap_or_else(|_| ".".to_string())
    };

    let target_str = match current_path {
        Some(s) if !s.trim().is_empty() => s.trim().to_string(),
        _ => default_root,
    };

    let target = PathBuf::from(&target_str);
    let resolved = target.canonicalize().unwrap_or(target.clone());
    let current_path_str = resolved.to_string_lossy().to_string();

    let parent_path = if cfg!(target_os = "android") {
        if current_path_str == "/storage/emulated/0" || current_path_str == "/storage/emulated" || current_path_str == "/storage" {
            None
        } else {
            resolved.parent().map(|p| p.to_string_lossy().to_string())
        }
    } else {
        resolved.parent().map(|p| p.to_string_lossy().to_string())
    };

    let mut items = Vec::new();
    if resolved.is_dir() {
        if let Ok(entries) = fs::read_dir(&resolved) {
            for entry in entries.flatten() {
                if let Ok(file_type) = entry.file_type() {
                    if file_type.is_dir() {
                        let name = entry.file_name().to_string_lossy().to_string();
                        if name.starts_with('.') || name == "Android" {
                            continue;
                        }
                        let path_str = entry.path().to_string_lossy().to_string();
                        
                        // Check for subdirectories & count comics
                        let mut has_subdirs = false;
                        let mut comic_count = 0;
                        if let Ok(sub_entries) = fs::read_dir(entry.path()) {
                            for sub in sub_entries.flatten() {
                                if let Ok(st) = sub.file_type() {
                                    if st.is_dir() {
                                        let sname = sub.file_name().to_string_lossy().to_string();
                                        if !sname.starts_with('.') {
                                            has_subdirs = true;
                                        }
                                    } else if st.is_file() {
                                        if let Some(ext) = sub.path().extension() {
                                            let ext_lower = ext.to_string_lossy().to_lowercase();
                                            if ext_lower == "cbz" || ext_lower == "cbr" || ext_lower == "zip" || ext_lower == "rar" {
                                                comic_count += 1;
                                            }
                                        }
                                    }
                                }
                            }
                        }

                        items.push(DirItem {
                            name,
                            path: path_str,
                            has_subdirs,
                            comic_count,
                        });
                    }
                }
            }
        }
    }
    items.sort_by(|a, b| natord::compare(&a.name, &b.name));

    let mut shortcuts = Vec::new();
    if cfg!(target_os = "android") {
        let candidates = [
            ("Downloads", "/storage/emulated/0/Download"),
            ("Comics", "/storage/emulated/0/Download/Comics"),
            ("Documents", "/storage/emulated/0/Documents"),
            ("Internal Storage", "/storage/emulated/0"),
        ];
        for (label, p) in candidates {
            if Path::new(p).exists() {
                shortcuts.push(DirItem {
                    name: label.to_string(),
                    path: p.to_string(),
                    has_subdirs: true,
                    comic_count: 0,
                });
            }
        }
    } else {
        if let Ok(home) = std::env::var("USERPROFILE").or_else(|_| std::env::var("HOME")) {
            let home_p = PathBuf::from(&home);
            let down = home_p.join("Downloads");
            if down.exists() {
                shortcuts.push(DirItem {
                    name: "Downloads".to_string(),
                    path: down.to_string_lossy().to_string(),
                    has_subdirs: true,
                    comic_count: 0,
                });
            }
            let docs = home_p.join("Documents");
            if docs.exists() {
                shortcuts.push(DirItem {
                    name: "Documents".to_string(),
                    path: docs.to_string_lossy().to_string(),
                    has_subdirs: true,
                    comic_count: 0,
                });
            }
            shortcuts.push(DirItem {
                name: "Home".to_string(),
                path: home_p.to_string_lossy().to_string(),
                has_subdirs: true,
                comic_count: 0,
            });
        }
    }

    Ok(DirectoryListing {
        current_path: current_path_str,
        parent_path,
        items,
        shortcuts,
    })
}

#[tauri::command]
fn list_subdirectories(path: Option<String>) -> Result<Vec<String>, String> {
    let target = path.unwrap_or_else(|| {
        if cfg!(target_os = "android") {
            "/storage/emulated/0".to_string()
        } else {
            std::env::var("USERPROFILE").or_else(|_| std::env::var("HOME")).unwrap_or_else(|_| ".".to_string())
        }
    });

    let p = Path::new(&target);
    if !p.exists() {
        return Ok(Vec::new());
    }

    let entries = fs::read_dir(p).map_err(|e| e.to_string())?;
    let mut dirs = Vec::new();
    for entry in entries.flatten() {
        if let Ok(file_type) = entry.file_type() {
            if file_type.is_dir() {
                let name = entry.file_name().to_string_lossy().to_string();
                if !name.starts_with('.') && !name.starts_with("Android") {
                    dirs.push(entry.path().to_string_lossy().to_string());
                }
            }
        }
    }
    dirs.sort();
    Ok(dirs)
}

#[tauri::command]
fn delete_comic_file(root_folder: Option<String>, file_path: String, comic_id: Option<String>) -> Result<(), String> {
    let p = Path::new(&file_path);
    if p.exists() {
        fs::remove_file(p).map_err(|e| format!("Failed to delete comic file: {}", e))?;
    }

    if let (Some(root), Some(cid)) = (root_folder, comic_id) {
        if !root.is_empty() {
            let _guard = vault_lock().lock().ok();
            let mut vault_data = load_vault_data(&root);
            vault_data.library_files.remove(&cid);
            vault_data.user_progress.remove(&cid);
            vault_data.comic_vine_metadata.remove(&cid);
            for coll in vault_data.issue_collections.values_mut() {
                coll.retain(|x| x != &cid);
            }
            save_vault_data(&root, &vault_data).ok();
        }
    }

    Ok(())
}

#[tauri::command]
fn save_moment_to_gallery(base64_data: String, filename: String) -> Result<String, String> {
    let clean_base64 = if let Some(idx) = base64_data.find(',') {
        &base64_data[idx + 1..]
    } else {
        &base64_data
    };
    let bytes = general_purpose::STANDARD
        .decode(clean_base64)
        .map_err(|e| format!("Base64 decode failed: {}", e))?;

    let target_dir: PathBuf = if cfg!(target_os = "android") {
        let p = PathBuf::from("/storage/emulated/0/Download/ComicFlow");
        if p.parent().map(|par| par.exists()).unwrap_or(false) {
            p
        } else {
            PathBuf::from("/sdcard/Download/ComicFlow")
        }
    } else {
        std::env::var("USERPROFILE")
            .or_else(|_| std::env::var("HOME"))
            .map(|home| PathBuf::from(home).join("Downloads").join("ComicFlow"))
            .unwrap_or_else(|_| PathBuf::from("ComicFlow_Downloads"))
    };

    if !target_dir.exists() {
        let _ = fs::create_dir_all(&target_dir);
    }

    let clean_name = filename.chars()
        .map(|c| if c.is_alphanumeric() || c == '.' || c == '_' || c == '-' { c } else { '_' })
        .collect::<String>();
    let file_path = target_dir.join(&clean_name);

    let mut file = File::create(&file_path).map_err(|e| format!("Failed to create image file: {}", e))?;
    file.write_all(&bytes).map_err(|e| format!("Failed to write image data: {}", e))?;

    let path_str = file_path.to_string_lossy().to_string();

    #[cfg(target_os = "android")]
    {
        let _ = std::process::Command::new("am")
            .args(&["broadcast", "-a", "android.intent.action.MEDIA_SCANNER_SCAN_FILE", "-d", &format!("file://{}", path_str)])
            .output();
    }

    Ok(path_str)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            load_cached_library, scan_library, update_progress, read_comic_page, read_comic_page_thumbnail,
            clear_app_cache, reset_library_data, add_reading_time, get_reading_journey, 
            save_moment, get_moments, delete_moment, exit_app, get_comic_cover, show_window, toggle_collection,
            mark_as_read, mark_as_unread, open_path, lookup_dictionary, fetch_comicvine, save_comicvine_metadata, save_series_volume,
            read_embedded_comic_info, list_subdirectories, list_directories, delete_comic_file, save_moment_to_gallery
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

// --- ANDROID BIONIC COMPATIBILITY LAYER ---
// Android < 14 (API < 34) does not have `copy_file_range` in libc.
// Exporting it here resolves the symbol locally within the .so at load time,
// preventing `dlopen failed: cannot locate symbol "copy_file_range"`.
#[cfg(target_os = "android")]
#[no_mangle]
pub unsafe extern "C" fn copy_file_range(
    fd_in: std::os::raw::c_int,
    off_in: *mut libc::loff_t,
    fd_out: std::os::raw::c_int,
    off_out: *mut libc::loff_t,
    len: usize,
    flags: std::os::raw::c_uint,
) -> libc::ssize_t {
    #[cfg(target_arch = "aarch64")]
    let sys_copy_file_range: libc::c_long = 285;
    #[cfg(target_arch = "arm")]
    let sys_copy_file_range: libc::c_long = 391;
    #[cfg(target_arch = "x86")]
    let sys_copy_file_range: libc::c_long = 377;
    #[cfg(target_arch = "x86_64")]
    let sys_copy_file_range: libc::c_long = 326;

    libc::syscall(sys_copy_file_range, fd_in, off_in, fd_out, off_out, len, flags) as libc::ssize_t
}

// Android < 9 (API < 28) does not have `getrandom` in libc.
#[cfg(target_os = "android")]
#[no_mangle]
pub unsafe extern "C" fn getrandom(
    buf: *mut std::os::raw::c_void,
    buflen: usize,
    flags: std::os::raw::c_uint,
) -> libc::ssize_t {
    #[cfg(target_arch = "aarch64")]
    let sys_getrandom: libc::c_long = 278;
    #[cfg(target_arch = "arm")]
    let sys_getrandom: libc::c_long = 384;
    #[cfg(target_arch = "x86")]
    let sys_getrandom: libc::c_long = 355;
    #[cfg(target_arch = "x86_64")]
    let sys_getrandom: libc::c_long = 318;

    libc::syscall(sys_getrandom, buf, buflen, flags) as libc::ssize_t
}