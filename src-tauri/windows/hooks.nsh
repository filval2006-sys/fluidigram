; Icona propria per i file .fluidigram (foglio col logo), al posto di quella dell'app.
; Il file .ico viene installato accanto all'app (bundle.resources); Tauri registra l'estensione, qui ne cambiamo solo l'icona.
!macro NSIS_HOOK_POSTINSTALL
  ReadRegStr $R0 SHCTX "Software\Classes\.fluidigram" ""
  ${If} $R0 != ""
    WriteRegStr SHCTX "Software\Classes\$R0\DefaultIcon" "" "$INSTDIR\fluidigram-file.ico,0"
    System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
  ${EndIf}
!macroend
