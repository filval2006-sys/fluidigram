# Fluidigram

**Fluid system (P&ID) diagrams for model rocketry** — draw valves, tanks, sensors and lines, check the schematic, and export
professional drawings (title block, legend, bill of materials, automatic multi-sheet layout) as PDF, SVG or PNG, in Italian or English.
Works fully offline; your projects stay on your computer.

*Schemi fluidici (P&ID) per il razzomodellismo: valvole, serbatoi, strumenti e collegamenti, controlli sullo schema ed esportazione
professionale (cartiglio, legenda, distinta, più fogli) in PDF, SVG e PNG, in italiano e inglese. Funziona offline.*

Created by **Filippo Valentini**. Free to use; see [LICENSE](LICENSE).

## Download

Get the latest installer from the **[Releases page](../../releases/latest)**:

| System | File |
|---|---|
| macOS 11+ (Apple Silicon and Intel) | `Fluidigram_x.y.z_universal.dmg` — open it and drag Fluidigram to Applications |
| Windows 10/11 (64-bit) | `Fluidigram_x.y.z_x64-setup.exe` — no administrator rights needed |

The app is not code-signed or notarized by Apple/Microsoft yet (that costs money), so the first time your system warns you. It is safe to continue:
- **macOS** ("Apple could not verify Fluidigram is free of malware"): drag the app to Applications, open it once and press *Done*, then go to **System Settings → Privacy & Security**, scroll to *Security* and press **Open Anyway**. Or, before opening it, run this in Terminal: `xattr -cr /Applications/Fluidigram.app`
- **Windows** ("Windows protected your PC"): *More info* → *Run anyway*.

Questa è l'avviso normale per un'app non firmata, non indica un virus. Su Mac: Impostazioni di Sistema → Privacy e sicurezza → **Apri comunque**.

The interface is currently in Italian; exported drawings can be in Italian or English.

## Informazioni (IT)

App desktop (macOS e Windows, Tauri) per disegnare **schemi fluidici** in stile P&ID, pensata per il razzomodellismo:
simboli e collegamenti, controlli sullo schema, stati delle valvole per fase, ed esportazione professionale
(PDF/SVG/PNG con cartiglio, legenda, distinta e impaginazione automatica su più fogli, in italiano e inglese).

L'app **fa schemi fluidici e basta**. Tutto il resto è un modulo opzionale, spento di default.

## Struttura (e regole di dipendenza)

```
src/
  core/      modello dello schema, simboli, instradamento, controlli, impaginazione ed esportazione (puro, senza React)
  state/     stato dell'app: schede dei progetti, annulla/ripeti, impostazioni
  ui/        editor: canvas, libreria, pannello proprietà, esportazione, impostazioni
  modules/   MODULI OPZIONALI, indipendenti dallo schema
    calc/      calcolatori: iniettore N₂O (SPI/HEM/Dyer), orifizi gas, perdite di carico, Cv
  App.tsx    unico punto che conosce i moduli
```

`core ← state ← ui ← App`; i moduli possono usare `core`, `state` e `ui`, ma **nessuno dipende da loro tranne `App.tsx`**.
Il test `src/architecture.test.ts` lo verifica a ogni esecuzione. Senza la cartella `modules` lo schema funziona identico:
i moduli si accendono da Impostazioni, si caricano solo quando servono e non cambiano i file `.fluidigram`.

## Comandi

| Comando | Cosa fa |
|---|---|
| `npm run tauri dev` | app nativa in sviluppo |
| `npm run dev` | solo nel browser, su http://localhost:5173 |
| `npm test` | test (modello, instradamento, esportazione, controlli, architettura) |
| `npm run tauri build` | app installabile (`src-tauri/target/release/bundle`) |

Su macOS, `Aggiorna Fluidigram.command` ricompila e reinstalla l'app in `~/Applications` con un doppio clic.

Per costruire e pubblicare gli installer (macOS e Windows) vedi [DISTRIBUZIONE.md](DISTRIBUZIONE.md).
