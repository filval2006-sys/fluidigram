use std::sync::Mutex;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem, Submenu, SubmenuBuilder};
use tauri::{Emitter, Manager, Runtime};

/// `.fluidigram` files received from the system (double click, "Open with", drop on the icon).
/// They accumulate here until the interface is ready; afterwards they are sent with the `open-files` event.
#[derive(Default)]
struct OpenFiles {
    pending: Mutex<Vec<String>>,
    ready: Mutex<bool>,
}

/// Maximum size of a project the app agrees to read (real projects are a few KB).
const MAX_PROJECT_BYTES: u64 = 50 * 1024 * 1024;

/// A file the system hands us at startup: we look at the file, not the name. A copy renamed by Finder or Explorer
/// (extension lost or changed) still opens; if the content is not a project the interface will say so.
fn is_project(path: &str) -> bool {
    !path.starts_with('-')
        && std::fs::metadata(path).is_ok_and(|m| m.is_file() && m.len() <= MAX_PROJECT_BYTES)
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

/// The interface calls this command once at startup: it returns the files that arrived earlier and switches to direct delivery.
#[tauri::command]
fn take_pending_files(state: tauri::State<OpenFiles>) -> Vec<String> {
    *state.ready.lock().unwrap() = true;
    std::mem::take(&mut *state.pending.lock().unwrap())
}

/// Reads a project opened by the system (the path comes from the operating system, not from the user), whatever its extension.
#[tauri::command]
fn read_project_file(path: String) -> Result<String, String> {
    if !is_project(&path) {
        return Err("The file does not exist or is too large to be a project".into());
    }
    std::fs::read_to_string(&path).map_err(|e| e.to_string())
}

/// Extensions the app may write: projects and exports.
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

/// Saves a file chosen by the user (project or export). The request body is the content; the path
/// arrives hex-encoded in the `x-path` header. The fs plugin only allows the file chosen in the dialog,
/// while here we also need the neighboring files (following sheets) and paths remembered from a previous session.
/// Writes to a temporary file and renames it, so an error halfway does not damage the existing file.
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

/// Menu language. The interface sends the language it is using (see `set_menu_language`).
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
enum Lang {
    It,
    En,
}

impl Lang {
    fn parse(s: &str) -> Lang {
        if s.starts_with("it") {
            Lang::It
        } else {
            Lang::En
        }
    }
    /// Picks the Italian or English text.
    fn pick<'a>(self, it: &'a str, en: &'a str) -> &'a str {
        match self {
            Lang::It => it,
            Lang::En => en,
        }
    }
}

/// Custom menu entries: (id, Italian text, English text, accelerator). Plain-key shortcuts (R, M, Del) stay in the interface,
/// because a menu would also intercept them while typing in a text field.
const COMMANDS: &[(&str, &str, &str, Option<&str>)] = &[
    (
        "home",
        "Pagina iniziale",
        "Home page",
        Some("CmdOrCtrl+Shift+H"),
    ),
    ("new", "Nuovo progetto", "New project", Some("CmdOrCtrl+N")),
    ("open", "Apri…", "Open…", Some("CmdOrCtrl+O")),
    ("save", "Salva", "Save", Some("CmdOrCtrl+S")),
    (
        "save-as",
        "Salva con nome…",
        "Save As…",
        Some("CmdOrCtrl+Shift+S"),
    ),
    ("export", "Esporta…", "Export…", Some("CmdOrCtrl+Shift+E")),
    (
        "close-tab",
        "Chiudi scheda",
        "Close Tab",
        Some("CmdOrCtrl+W"),
    ),
    ("quit", "Esci", "Exit", Some("Alt+F4")),
    ("undo", "Annulla", "Undo", Some("CmdOrCtrl+Z")),
    ("redo", "Ripeti", "Redo", Some("CmdOrCtrl+Shift+Z")),
    ("duplicate", "Duplica", "Duplicate", Some("CmdOrCtrl+D")),
    (
        "select-all",
        "Seleziona tutto",
        "Select All",
        Some("CmdOrCtrl+A"),
    ),
    ("rotate", "Ruota (R)", "Rotate (R)", None),
    ("mirror", "Specchia (M)", "Mirror (M)", None),
    ("delete", "Elimina (Canc)", "Delete (Del)", None),
    (
        "view-schema",
        "Disegno: schema",
        "Design: diagram",
        Some("CmdOrCtrl+1"),
    ),
    (
        "view-bom",
        "Disegno: distinta componenti",
        "Design: bill of materials",
        Some("CmdOrCtrl+2"),
    ),
    (
        "view-ops",
        "Funzionamento (fasi)",
        "Operation (phases)",
        Some("CmdOrCtrl+3"),
    ),
    ("zoom-in", "Ingrandisci", "Zoom In", Some("CmdOrCtrl+=")),
    ("zoom-out", "Riduci", "Zoom Out", Some("CmdOrCtrl+-")),
    (
        "zoom-fit",
        "Inquadra tutto",
        "Fit to Window",
        Some("CmdOrCtrl+0"),
    ),
    ("theme-system", "Tema automatico", "Automatic Theme", None),
    ("theme-light", "Tema chiaro", "Light Theme", None),
    ("theme-dark", "Tema scuro", "Dark Theme", None),
    (
        "settings",
        "Impostazioni…",
        "Settings…",
        Some("CmdOrCtrl+,"),
    ),
    (
        "shortcuts",
        "Scorciatoie da tastiera",
        "Keyboard Shortcuts",
        None,
    ),
    (
        "about",
        "Informazioni su Fluidigram",
        "About Fluidigram",
        None,
    ),
];

fn cmd<R: Runtime, M: Manager<R>>(app: &M, lang: Lang, id: &str) -> tauri::Result<MenuItem<R>> {
    let (_, it, en, accel) = COMMANDS
        .iter()
        .find(|c| c.0 == id)
        .unwrap_or_else(|| panic!("unknown menu entry: {id}"));
    MenuItem::with_id(app, id, lang.pick(it, en), true, *accel)
}

/// Menu bar in the given language. Custom entries do nothing by themselves: they send the interface the `menu` event
/// with their id, and the interface runs the command (same code as the keyboard shortcuts).
/// Cut/Copy/Paste/Select All are system items, so they work in text fields.
fn build_menu<R: Runtime, M: Manager<R>>(app: &M, lang: Lang) -> tauri::Result<Menu<R>> {
    let c = |id: &str| cmd(app, lang, id);
    let file = Submenu::with_items(
        app,
        "File",
        true,
        &[
            &c("home")?,
            &c("new")?,
            &c("open")?,
            &PredefinedMenuItem::separator(app)?,
            &c("save")?,
            &c("save-as")?,
            &PredefinedMenuItem::separator(app)?,
            &c("export")?,
            &PredefinedMenuItem::separator(app)?,
            &c("close-tab")?,
            #[cfg(not(target_os = "macos"))]
            &PredefinedMenuItem::separator(app)?,
            #[cfg(not(target_os = "macos"))]
            &c("quit")?,
        ],
    )?;

    let edit = SubmenuBuilder::new(app, lang.pick("Modifica", "Edit"))
        .item(&c("undo")?)
        .item(&c("redo")?)
        .separator()
        .cut_with_text(lang.pick("Taglia", "Cut"))
        .copy_with_text(lang.pick("Copia", "Copy"))
        .paste_with_text(lang.pick("Incolla", "Paste"))
        .item(&c("duplicate")?)
        .item(&c("select-all")?)
        .separator()
        .item(&c("rotate")?)
        .item(&c("mirror")?)
        .item(&c("delete")?)
        .build()?;

    let view = SubmenuBuilder::new(app, lang.pick("Visualizza", "View"))
        .item(&c("view-schema")?)
        .item(&c("view-bom")?)
        .item(&c("view-ops")?)
        .separator()
        .item(&c("zoom-in")?)
        .item(&c("zoom-out")?)
        .item(&c("zoom-fit")?)
        .separator()
        .item(&c("theme-system")?)
        .item(&c("theme-light")?)
        .item(&c("theme-dark")?)
        .separator()
        .item(&c("settings")?)
        .fullscreen_with_text(lang.pick("Schermo intero", "Full Screen"))
        .build()?;

    let window = SubmenuBuilder::new(app, lang.pick("Finestra", "Window"))
        .minimize_with_text(lang.pick("Riduci a icona", "Minimize"))
        .maximize_with_text("Zoom")
        .build()?;

    let help = Submenu::with_items(
        app,
        lang.pick("Aiuto", "Help"),
        true,
        &[&c("shortcuts")?, &c("about")?],
    )?;

    #[cfg(target_os = "macos")]
    {
        let application = SubmenuBuilder::new(app, "Fluidigram")
            .item(&c("about")?)
            .separator()
            .services_with_text(lang.pick("Servizi", "Services"))
            .separator()
            .hide_with_text(lang.pick("Nascondi Fluidigram", "Hide Fluidigram"))
            .hide_others_with_text(lang.pick("Nascondi altre", "Hide Others"))
            .show_all_with_text(lang.pick("Mostra tutte", "Show All"))
            .separator()
            .quit_with_text(lang.pick("Esci da Fluidigram", "Quit Fluidigram"))
            .build()?;
        Menu::with_items(app, &[&application, &file, &edit, &view, &window, &help])
    }
    #[cfg(not(target_os = "macos"))]
    Menu::with_items(app, &[&file, &edit, &view, &window, &help])
}

/// Rebuilds the menu bar in the language the interface is using ("it" or "en").
#[tauri::command]
fn set_menu_language(app: tauri::AppHandle, lang: String) -> Result<(), String> {
    let menu = build_menu(&app, Lang::parse(&lang)).map_err(|e| e.to_string())?;
    app.set_menu(menu).map(|_| ()).map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default();

    // a single window: opening another file while the app is running sends it to the existing window
    #[cfg(desktop)]
    let builder = builder.plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
        deliver(app, args.into_iter().skip(1).collect());
        if let Some(w) = app.get_webview_window("main") {
            let _ = w.unminimize();
            let _ = w.set_focus();
        }
    }));

    // in-app updates: the updater downloads and verifies the signed update, the process plugin restarts the app
    #[cfg(desktop)]
    let builder = builder
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init());

    let app = builder
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(OpenFiles::default())
        .on_menu_event(|app, event| {
            if event.id().as_ref() == "quit" {
                app.exit(0);
            } else {
                let _ = app.emit("menu", event.id().as_ref());
            }
        })
        .invoke_handler(tauri::generate_handler![
            take_pending_files,
            read_project_file,
            write_output_file,
            set_menu_language
        ])
        .setup(|app| {
            // if the custom menu cannot be built, the system one stays: the app starts anyway
            match build_menu(app, Lang::En) {
                Ok(menu) => {
                    let _ = app.set_menu(menu);
                }
                Err(e) => eprintln!("menu non disponibile: {e}"),
            }
            // Windows and Linux: the file to open arrives as a command-line argument
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
        // macOS: files opened from Finder arrive as an event, not as arguments
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
        for (id, _, _, accel) in COMMANDS {
            if let Some(a) = accel {
                let parsed = muda::accelerator::Accelerator::from_str(a)
                    .unwrap_or_else(|e| panic!("{id}: scorciatoia non valida {a}: {e}"));
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
        assert_eq!(
            read_project_file(renamed.to_str().unwrap().into()).unwrap(),
            "{}"
        );
        assert!(!is_project(dir.to_str().unwrap())); // a folder is not
        assert!(!is_project("--flag"));
        assert!(!is_project(dir.join("manca.fluidigram").to_str().unwrap()));
        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn refuses_other_file_types_and_missing_folders() {
        let file = std::env::temp_dir().join("fluidigram-nope.sh");
        assert_eq!(
            write_checked(file.to_str().unwrap(), b"x"),
            Err("Tipo di file non consentito".into())
        );
        assert!(!file.exists());
        let missing = std::env::temp_dir()
            .join("fluidigram-non-esiste")
            .join("a.pdf");
        assert!(write_checked(missing.to_str().unwrap(), b"x").is_err());
    }
}
