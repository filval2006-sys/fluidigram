## Download · Scarica

| System · Sistema | File |
|---|---|
| macOS 11+ (Apple Silicon & Intel) | `Fluidigram_{VERSION}_macOS.pkg` |
| Windows 10/11 (64-bit) | `Fluidigram_{VERSION}_x64-setup.exe` |

You do not need to install anything else; the app works fully offline and your projects stay on your computer.
Non serve installare altro: l'app funziona del tutto offline e i tuoi progetti restano sul tuo computer.

---

## Installation (English)

The installers are **not code-signed** yet (Apple and Microsoft charge for it), so both systems show a warning the first time. This is expected: it does **not** mean the app is a virus.

### macOS
1. Download the `.pkg` and open it. It installs (or updates) Fluidigram in your *Applications* folder, replacing the previous version, and asks for your password once. The app then belongs to you, so it can update itself later without asking again.
2. The first time you open Fluidigram, macOS says it "could not verify that Fluidigram is free of malware". Press **Done**.
3. Open **System Settings → Privacy & Security**, scroll down to the *Security* section and press **Open Anyway**, then confirm with your password or Touch ID.
4. Alternative: before the first launch, run `xattr -cr /Applications/Fluidigram.app` in Terminal.

### Windows
1. Download the `-setup.exe` and double-click it.
2. Windows shows a blue **"Windows protected your PC"** screen (SmartScreen). Click **More info**, then **Run anyway**.
3. In the wizard choose the folder, the Start menu folder and the desktop shortcut. It installs for your user only, so no administrator permission is needed.

### Updating
From version 0.5.0 the app updates itself: when a new version is out a red dot appears on the Settings button; open **Settings → Updates** and press **Update now**. Your `.fluidigram` projects are not touched. (If you installed an older version for all users, install 0.5.0 once by hand: from then on updates are automatic.)

---

## Installazione (Italiano)

Gli installer **non sono ancora firmati** (Apple e Microsoft chiedono un pagamento), quindi entrambi i sistemi mostrano un avviso la prima volta. È normale: **non** significa che l'app sia un virus.

### macOS
1. Scarica il `.pkg` e aprilo. Installa (o aggiorna) Fluidigram nella cartella *Applicazioni*, sostituendo la versione precedente, e chiede la password una sola volta. Poi l'app è tua, così potrà aggiornarsi da sola senza chiedere altro.
2. La prima volta che apri Fluidigram, macOS dice che «non può verificare che Fluidigram sia privo di software dannoso». Premi **Fine**.
3. Apri **Impostazioni di Sistema → Privacy e sicurezza**, scorri fino alla sezione *Sicurezza* e premi **Apri comunque**, poi conferma con la password o Touch ID.
4. In alternativa, prima di aprirla, esegui da Terminale: `xattr -cr /Applications/Fluidigram.app`.

### Windows
1. Scarica il `-setup.exe` e fai doppio clic.
2. Windows mostra una schermata blu **«Windows ha protetto il PC»** (SmartScreen). Clicca **Ulteriori informazioni**, poi **Esegui comunque**.
3. Nella procedura guidata scegli la cartella, la cartella del menu Start e il collegamento sul desktop. Installa solo per il tuo utente, quindi non serve il permesso di amministratore.

### Aggiornamento
Dalla versione 0.5.0 l'app si aggiorna da sola: quando esce una versione nuova compare un pallino rosso sul pulsante Impostazioni; apri **Impostazioni → Aggiornamenti** e premi **Aggiorna ora**. I tuoi progetti `.fluidigram` non vengono toccati. (Se avevi installato una versione precedente per tutti gli utenti, installa la 0.5.0 una volta a mano: da lì in poi gli aggiornamenti sono automatici.)

---

Created by Filippo Valentini · [Changelog](https://github.com/filval2006-sys/fluidigram/blob/main/CHANGELOG.md)
