use std::sync::Mutex;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem, Submenu, SubmenuBuilder};
use tauri::{Emitter, Manager, Runtime};

/// File `.fluidigram` ricevuti dal sistema (doppio clic, "Apri con", trascinamento sull'icona).
/// Finché l'interfaccia non è pronta si accumulano qui; dopo vengono inviati con l'evento `open-files`.
#[derive(Default)]
struct OpenFiles {
    pending: Mutex<Vec<String>>,
    ready: Mutex<bool>,
}

/// Dimensione massima di un progetto che l'app accetta di leggere (i progetti reali sono di pochi KB).
const MAX_PROJECT_BYTES: u64 = 50 * 1024 * 1024;

/// Un file che il sistema ci passa all'avvio: si guarda il file, non il nome. Una copia rinominata dal Finder o da Esplora
/// risorse (estensione persa o cambiata) si apre comunque; se il contenuto non è un progetto lo dirà l'interfaccia.
fn is_project(path: &str) -> bool {
    !path.starts_with('-') && std::fs::metadata(path).is_ok_and(|m| m.is_file() && m.len() <= MAX_PROJECT_BYTES)
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

/// Legge un progetto aperto dal sistema (il percorso arriva dal sistema operativo, non dall'utente), qualunque ne sia l'estensione.
#[tauri::command]
fn read_project_file(path: String) -> Result<String, String> {
    if !is_project(&path) {
        return Err("Il file non esiste o è troppo grande per essere un progetto".into());
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


/// Voci personalizzate del menu: (id, testo, scorciatoia). Le scorciatoie con tasto semplice (R, M, Canc) restano all'interfaccia,
/// perché un menu le intercetterebbe anche mentre si scrive in un campo di testo.
const COMMANDS: &[(&str, &str, Option<&str>)] = &[
    ("home", "Pagina iniziale", Some("CmdOrCtrl+Shift+H")),
    ("new", "Nuovo progetto", Some("CmdOrCtrl+N")),
    ("open", "Apri…", Some("CmdOrCtrl+O")),
    ("save", "Salva", Some("CmdOrCtrl+S")),
    ("save-as", "Salva con nome…", Some("CmdOrCtrl+Shift+S")),
    ("export", "Esporta disegno…", Some("CmdOrCtrl+Shift+E")),
    ("close-tab", "Chiudi scheda", Some("CmdOrCtrl+W")),
    ("quit", "Esci", Some("Alt+F4")),
    ("undo", "Annulla", Some("CmdOrCtrl+Z")),
    ("redo", "Ripeti", Some("CmdOrCtrl+Shift+Z")),
    ("duplicate", "Duplica", Some("CmdOrCtrl+D")),
    ("select-all", "Seleziona tutto", Some("CmdOrCtrl+A")),
    ("rotate", "Ruota (R)", None),
    ("mirror", "Specchia (M)", None),
    ("delete", "Elimina (Canc)", None),
    ("view-schema", "Disegno: schema", Some("CmdOrCtrl+1")),
    ("view-bom", "Disegno: distinta componenti", Some("CmdOrCtrl+2")),
    ("view-ops", "Funzionamento (fasi)", Some("CmdOrCtrl+3")),
    ("zoom-in", "Ingrandisci", Some("CmdOrCtrl+=")),
    ("zoom-out", "Riduci", Some("CmdOrCtrl+-")),
    ("zoom-fit", "Inquadra tutto", Some("CmdOrCtrl+0")),
    ("theme-system", "Tema automatico", None),
    ("theme-light", "Tema chiaro", None),
    ("theme-dark", "Tema scuro", None),
    ("settings", "Impostazioni…", Some("CmdOrCtrl+,")),
    ("shortcuts", "Scorciatoie da tastiera", None),
    ("about", "Informazioni su Fluidigram", None),
];

fn cmd<R: Runtime, M: Manager<R>>(app: &M, id: &str) -> tauri::Result<MenuItem<R>> {
    let (_, text, accel) = COMMANDS.iter().find(|c| c.0 == id).unwrap_or_else(|| panic!("voce di menu sconosciuta: {id}"));
    MenuItem::with_id(app, id, *text, true, *accel)
}


/// Barra dei menu in italiano. Le voci personalizzate non fanno nulla da sole: mandano all'interfaccia l'evento `menu`
/// con il loro id, e l'interfaccia esegue il comando (stesso codice delle scorciatoie da tastiera).
/// Taglia/Copia/Incolla/Seleziona tutto sono voci di sistema, così funzionano nei campi di testo.
fn build_menu<R: Runtime, M: Manager<R>>(app: &M) -> tauri::Result<Menu<R>> {
    let file = Submenu::with_items(
        app,
        "File",
        true,
        &[
            &cmd(app, "home")?,
            &cmd(app, "new")?,
            &cmd(app, "open")?,
            &PredefinedMenuItem::separator(app)?,
            &cmd(app, "save")?,
            &cmd(app, "save-as")?,
            &PredefinedMenuItem::separator(app)?,
            &cmd(app, "export")?,
            &PredefinedMenuItem::separator(app)?,
            &cmd(app, "close-tab")?,
            #[cfg(not(target_os = "macos"))]
            &PredefinedMenuItem::separator(app)?,
            #[cfg(not(target_os = "macos"))]
            &cmd(app, "quit")?,
        ],
    )?;

    let edit = SubmenuBuilder::new(app, "Modifica")
        .item(&cmd(app, "undo")?)
        .item(&cmd(app, "redo")?)
        .separator()
        .cut_with_text("Taglia")
        .copy_with_text("Copia")
        .paste_with_text("Incolla")
        .item(&cmd(app, "duplicate")?)
        .item(&cmd(app, "select-all")?)
        .separator()
        .item(&cmd(app, "rotate")?)
        .item(&cmd(app, "mirror")?)
        .item(&cmd(app, "delete")?)
        .build()?;

    let view = SubmenuBuilder::new(app, "Visualizza")
        .item(&cmd(app, "view-schema")?)
        .item(&cmd(app, "view-bom")?)
        .item(&cmd(app, "view-ops")?)
        .separator()
        .item(&cmd(app, "zoom-in")?)
        .item(&cmd(app, "zoom-out")?)
        .item(&cmd(app, "zoom-fit")?)
        .separator()
        .item(&cmd(app, "theme-system")?)
        .item(&cmd(app, "theme-light")?)
        .item(&cmd(app, "theme-dark")?)
        .separator()
        .item(&cmd(app, "settings")?)
        .fullscreen_with_text("Schermo intero")
        .build()?;

    let window = SubmenuBuilder::new(app, "Finestra")
        .minimize_with_text("Riduci a icona")
        .maximize_with_text("Zoom")
        .build()?;

    let help = Submenu::with_items(app, "Aiuto", true, &[&cmd(app, "shortcuts")?, &cmd(app, "about")?])?;

    #[cfg(target_os = "macos")]
    {
        let application = SubmenuBuilder::new(app, "Fluidigram")
            .item(&cmd(app, "about")?)
            .separator()
            .services_with_text("Servizi")
            .separator()
            .hide_with_text("Nascondi Fluidigram")
            .hide_others_with_text("Nascondi altre")
            .show_all_with_text("Mostra tutte")
            .separator()
            .quit_with_text("Esci da Fluidigram")
            .build()?;
        Menu::with_items(app, &[&application, &file, &edit, &view, &window, &help])
    }
    #[cfg(not(target_os = "macos"))]
    Menu::with_items(app, &[&file, &edit, &view, &window, &help])
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
        .on_menu_event(|app, event| {
            if event.id().as_ref() == "quit" {
                app.exit(0);
            } else {
                let _ = app.emit("menu", event.id().as_ref());
            }
        })
        .invoke_handler(tauri::generate_handler![take_pending_files, read_project_file, write_output_file])
        .setup(|app| {
            // se la barra personalizzata non si costruisse, resta quella di sistema: l'app si avvia comunque
            match build_menu(app) {
                Ok(menu) => {
                    let _ = app.set_menu(menu);
                }
                Err(e) => eprintln!("menu non disponibile: {e}"),
            }
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
    fn menu_shortcuts_are_valid_and_unique() {
        use std::str::FromStr;
        let mut seen = std::collections::HashSet::new();
        for (id, _, accel) in COMMANDS {
            if let Some(a) = accel {
                let parsed = muda::accelerator::Accelerator::from_str(a).unwrap_or_else(|e| panic!("{id}: scorciatoia non valida {a}: {e}"));
                assert!(seen.insert(parsed.id()), "scorciatoia duplicata: {a}");
            }
        }
        assert!(COMMANDS.len() >= 20);
    }

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
    fn opens_by_content_not_by_name() {
        let dir = std::env::temp_dir().join("fluidigram-open-test");
        std::fs::create_dir_all(&dir).unwrap();
        let renamed = dir.join("progetto copia"); // estensione persa
        std::fs::write(&renamed, "{}").unwrap();
        assert!(is_project(renamed.to_str().unwrap()));
        assert_eq!(read_project_file(renamed.to_str().unwrap().into()).unwrap(), "{}");
        assert!(!is_project(dir.to_str().unwrap())); // una cartella no
        assert!(!is_project("--flag"));
        assert!(!is_project(dir.join("manca.fluidigram").to_str().unwrap()));
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
