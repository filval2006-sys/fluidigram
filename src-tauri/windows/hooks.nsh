; Own icon for .fluidigram files (sheet with the logo), instead of the app's one.
; The .ico file is installed next to the app (bundle.resources); Tauri registers the extension, here we only change its icon.
!macro NSIS_HOOK_POSTINSTALL
  ReadRegStr $R0 SHCTX "Software\Classes\.fluidigram" ""
  ${If} $R0 != ""
    WriteRegStr SHCTX "Software\Classes\$R0\DefaultIcon" "" "$INSTDIR\fluidigram-file.ico,0"
    System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
  ${EndIf}
!macroend
