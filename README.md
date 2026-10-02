# Fluidigram

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
