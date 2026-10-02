use std::sync::Mutex;
use tauri::{Emitter, Manager};

/// File `.fluidigram` ricevuti dal sistema (doppio clic, "Apri con", trascinamento sull'icona).
/// Finché l'interfaccia non è pronta si accumulano qui; dopo vengono inviati con l'evento `open-files`.
#[derive(Default)]
struct OpenFiles {
    pending: Mutex<Vec<String>>,
    ready: Mutex<bool>,
}

fn is_project(path: &str) -> bool {
    path.to_lowercase().ends_with(".fluidigram")
}

fn deliver(app: &tauri::AppHandle, paths: Vec<String>) {
    let paths: Vec<String> = paths.into_iter().filter(|p| is_project(p)).collect();
    if paths.is_empty() {
        return;
    }
    let state = app.state::<OpenFiles>();
    if *state.ready.lock().unwrap() {
        let _ = app.emit("open-files", paths);
    } else {
        state.pending.lock().unwrap().extend(paths);
    }
}

/// L'interfaccia chiama questo comando una volta all'avvio: restituisce i file arrivati prima e passa alla consegna diretta.
#[tauri::command]
fn take_pending_files(state: tauri::State<OpenFiles>) -> Vec<String> {
    *state.ready.lock().unwrap() = true;
    std::mem::take(&mut *state.pending.lock().unwrap())
}

/// Legge un progetto aperto dal sistema (il percorso arriva dal sistema operativo, non dall'utente).
#[tauri::command]
fn read_project_file(path: String) -> Result<String, String> {
    if !is_project(&path) {
        return Err("Non è un file .fluidigram".into());
    }
    std::fs::read_to_string(&path).map_err(|e| e.to_string())
}

/// Estensioni che l'app può scrivere: progetti ed esportazioni.
const WRITABLE: [&str; 5] = [".fluidigram", ".json", ".pdf", ".png", ".svg"];

fn from_hex(s: &str) -> Option<String> {
    if !s.len().is_multiple_of(2) {
        return None;
    }
    let bytes: Option<Vec<u8>> = (0..s.len())
        .step_by(2)
        .map(|i| u8::from_str_radix(&s[i..i + 2], 16).ok())
        .collect();
    String::from_utf8(bytes?).ok()
}

/// Salva un file scelto dall'utente (progetto o esportazione). Il corpo della richiesta è il contenuto; il percorso
/// arriva in esadecimale nell'intestazione `x-path`. Il fs plugin consente solo il file scelto nella finestra di
/// dialogo, mentre qui servono anche i file accanto (fogli successivi) e i percorsi ricordati da una sessione precedente.
/// Scrive in un file temporaneo e lo rinomina, così un errore a metà non rovina il file esistente.
#[tauri::command]
fn write_output_file(request: tauri::ipc::Request<'_>) -> Result<(), String> {
    let path = request
        .headers()
        .get("x-path")
        .and_then(|v| v.to_str().ok())
        .and_then(from_hex)
        .ok_or("Percorso mancante")?;
    let tauri::ipc::InvokeBody::Raw(data) = request.body() else {
        return Err("Contenuto mancante".into());
    };
    write_checked(&path, data)
}

fn write_checked(path: &str, data: &[u8]) -> Result<(), String> {
    let lower = path.to_lowercase();
    if !WRITABLE.iter().any(|ext| lower.ends_with(ext)) {
        return Err("Tipo di file non consentito".into());
    }
    let tmp = format!("{path}.tmp");
    std::fs::write(&tmp, data).map_err(|e| format!("{path}: {e}"))?;
    std::fs::rename(&tmp, path).map_err(|e| {
        let _ = std::fs::remove_file(&tmp);
        format!("{path}: {e}")
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default();

    // una sola finestra: aprire un altro file con l'app già in esecuzione lo manda alla finestra esistente
    #[cfg(desktop)]
    let builder = builder.plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
        deliver(app, args.into_iter().skip(1).collect());
        if let Some(w) = app.get_webview_window("main") {
            let _ = w.unminimize();
            let _ = w.set_focus();
        }
    }));

    let app = builder
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(OpenFiles::default())
        .invoke_handler(tauri::generate_handler![take_pending_files, read_project_file, write_output_file])
        .setup(|app| {
            // Windows e Linux: il file da aprire arriva come argomento della riga di comando
            deliver(app.handle(), std::env::args().skip(1).collect());
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|_app, _event| {
        // macOS: i file aperti dal Finder arrivano come evento, non come argomenti
        #[cfg(target_os = "macos")]
        if let tauri::RunEvent::Opened { urls } = _event {
            let paths = urls
                .iter()
                .filter_map(|u| u.to_file_path().ok())
                .map(|p| p.to_string_lossy().into_owned())
                .collect();
            deliver(_app, paths);
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hex_roundtrip_with_accents() {
        let p = "/Users/è ü/progetto 1.fluidigram";
        let h: String = p.bytes().map(|b| format!("{b:02x}")).collect();
        assert_eq!(from_hex(&h).as_deref(), Some(p));
        assert_eq!(from_hex("abc"), None);
    }

    #[test]
    fn writes_and_replaces_a_project_with_accents_in_the_path() {
        let dir = std::env::temp_dir().join("fluidigram-test-è ü");
        std::fs::create_dir_all(&dir).unwrap();
        let file = dir.join("progetto.FLUIDIGRAM");
        let path = file.to_str().unwrap();
        write_checked(path, b"uno").unwrap();
        write_checked(path, "due è".as_bytes()).unwrap();
        assert_eq!(std::fs::read_to_string(&file).unwrap(), "due è");
        assert!(!dir.join("progetto.FLUIDIGRAM.tmp").exists());
        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn refuses_other_file_types_and_missing_folders() {
        let file = std::env::temp_dir().join("fluidigram-nope.sh");
        assert_eq!(write_checked(file.to_str().unwrap(), b"x"), Err("Tipo di file non consentito".into()));
        assert!(!file.exists());
        let missing = std::env::temp_dir().join("fluidigram-non-esiste").join("a.pdf");
        assert!(write_checked(missing.to_str().unwrap(), b"x").is_err());
    }
}
