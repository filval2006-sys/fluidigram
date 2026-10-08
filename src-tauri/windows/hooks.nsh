; Own icon for .fluidigram files (sheet with the logo), instead of the app's one.
; The .ico file is installed next to the app (bundle.resources); Tauri registers the extension, here we only change its icon.
!macro NSIS_HOOK_PREINSTALL
  DetailPrint "Fluidigram is installed for the current user only (no administrator rights needed)."
  ; A copy installed "for all users" by an older installer (registered under HKLM) is not replaced by this per-user
  ; installer, so there would be two copies. Say it clearly (never in the silent in-app update).
  ${If} $UpdateMode <> 1
    ReadRegStr $R1 HKLM "${UNINSTKEY}" "UninstallString"
    ${If} $R1 != ""
      MessageBox MB_OK|MB_ICONINFORMATION "Fluidigram is already installed for ALL users on this computer. This installer installs for your user only, so you would end up with two copies. When it finishes, remove the old one: Windows Settings > Apps > Fluidigram > Uninstall.$\n$\nFluidigram risulta gia' installato per TUTTI gli utenti su questo computer. Questo installer installa solo per il tuo utente, quindi avresti due copie. Al termine rimuovi la vecchia: Impostazioni di Windows > App > Fluidigram > Disinstalla."
    ${EndIf}
  ${EndIf}
!macroend

!macro NSIS_HOOK_POSTINSTALL
  ReadRegStr $R0 SHCTX "Software\Classes\.fluidigram" ""
  ${If} $R0 != ""
    WriteRegStr SHCTX "Software\Classes\$R0\DefaultIcon" "" "$INSTDIR\fluidigram-file.ico,0"
    System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
  ${EndIf}
!macroend
