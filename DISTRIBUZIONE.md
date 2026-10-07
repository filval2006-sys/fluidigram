# Distribuzione di Fluidigram

Gli utenti ricevono **un solo file** e non devono installare nient'altro: l'app contiene tutto (interfaccia, font per i PDF, dati, icone) e funziona offline.

| Sistema | File da scaricare | Dimensione | Note |
|---|---|---|---|
| macOS 11+ (Apple Silicon e Intel) | `Fluidigram_x.y.z_macOS.pkg` | pochi MB | installer guidato (per tutti, solo per te o su un altro disco) |
| Windows 10/11 (64 bit) | `Fluidigram_x.y.z_x64-setup.exe` | pochi MB | installazione per l'utente, senza permessi di amministratore |

Dopo l'installazione i file `.fluidigram` si aprono con un doppio clic.

## Prima volta: pubblicare il progetto su GitHub (una volta sola)

Gli installer Windows e Mac universali si costruiscono su GitHub (gratis), perché servono macchine Windows e Mac.

1. Crea un account su <https://github.com> e poi un repository vuoto, ad esempio `fluidigram` (privato va bene: le release restano scaricabili da chi inviti; per condividere con chiunque serve pubblico).
2. Dalla cartella del progetto:

   ```bash
   git add -A
   git commit -m "Fluidigram 0.1.0"
   git branch -M main
   git remote add origin https://github.com/TUO-NOME/fluidigram.git
   git push -u origin main
   ```

## Pubblicare una versione

```bash
npm run version:set 0.2.0                      # allinea la versione in package.json, tauri.conf.json e Cargo.toml
git commit -am "Versione 0.2.0"
git tag v0.2.0
git push --follow-tags
```

GitHub costruisce Mac e Windows (circa 10–15 minuti la prima volta, meno dopo) ed esegue prima tutti i test. Poi vai su **Releases**: trovi una bozza con gli installer; controllala e premi **Publish release**. Il link della release è quello da inviare a chi deve scaricare l'app.

Per provare senza pubblicare: **Actions → Release → Run workflow**; gli installer compaiono come *artifacts* del lavoro.

## Cosa vedranno gli utenti la prima volta

L'app non è ancora firmata da Apple né da Microsoft (la firma ufficiale costa: circa 99 $/anno per Apple e un certificato a pagamento per Windows). Funziona lo stesso, ma il sistema chiede una conferma:

- **macOS** («Apple non può verificare che sia priva di software dannoso»): apri l'app una volta e premi *Fine*, poi *Impostazioni di Sistema → Privacy e sicurezza → Apri comunque*. In alternativa, prima di aprirla, da Terminale: `xattr -cr /Applications/Fluidigram.app`. Il vecchio «clic destro → Apri» non basta più sulle versioni recenti di macOS.
- **Windows**: «Windows ha protetto il PC» → *Ulteriori informazioni* → *Esegui comunque*.

## Firmare l'app (facoltativo, più avanti)

- **macOS**: con un account Apple Developer aggiungi i segreti del repository `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`, `APPLE_SIGNING_IDENTITY`, `APPLE_ID`, `APPLE_PASSWORD`, `APPLE_TEAM_ID` e togli il commento alle righe corrispondenti in `.github/workflows/release.yml`: l'app viene firmata e notarizzata e l'avviso sparisce.
- **Windows**: serve un certificato di firma del codice; la configurazione è descritta nella guida di Tauri (<https://tauri.app/distribute/sign/windows/>).

## Costruire in locale (solo macOS, per la propria architettura)

```bash
npx tauri build          # src-tauri/target/release/bundle/macos/Fluidigram.app
```

`Aggiorna Fluidigram.command` fa lo stesso e installa l'app in `~/Applications`.

## Cambiare l'icona

Modifica `scripts/icon.svg` e lancia `npm run icon`: rigenera tutte le icone (macOS, Windows, PNG).

## Controllo di cosa contiene l'app

- Nessuna dipendenza esterna: l'interfaccia è incorporata nell'eseguibile e non fa richieste di rete.
- Windows usa il componente di sistema WebView2, già presente in Windows 11 e nei Windows 10 aggiornati; se manca, l'installer lo scarica da solo (una sola volta, serve internet).
