!include nsDialogs.nsh

Var OTB_AssocPdf
Var OTB_AssocEpub
Var OTB_AssocAzw3
Var OTB_AssocMobi
Var OTB_AssocPdfState
Var OTB_AssocEpubState
Var OTB_AssocAzw3State
Var OTB_AssocMobiState
Var OTB_AssocPageShown

; This page is intentionally a small, explicit choice: all formats are on by
; default, but no association is registered unless the user leaves it checked.
Page custom OTB_AssociationsPage OTB_AssociationsLeave

Function OTB_AssociationsPage
  ; Do not interrupt silent installs or signed updater installs.
  ${GetOptions} $CMDLINE "/P" $R0
  ${IfNot} ${Errors}
    Abort
  ${EndIf}
  ${GetOptions} $CMDLINE "/UPDATE" $R0
  ${IfNot} ${Errors}
    Abort
  ${EndIf}

  !insertmacro MUI_HEADER_TEXT "Choose file associations" "Select the book files OpenTheBook should open by default."
  nsDialogs::Create 1018
  Pop $R0
  ${If} $R0 == error
    Abort
  ${EndIf}

  ${NSD_CreateLabel} 0 0 100% 28u "OpenTheBook can open these formats. All four are selected by default. The installer will try to make selected formats open with OpenTheBook. Windows may still require confirmation in Default apps."
  Pop $R0
  ${NSD_CreateCheckbox} 0 39u 100% 12u "PDF"
  Pop $OTB_AssocPdf
  ${NSD_CreateCheckbox} 0 60u 100% 12u "EPUB"
  Pop $OTB_AssocEpub
  ${NSD_CreateCheckbox} 0 81u 100% 12u "AZW3"
  Pop $OTB_AssocAzw3
  ${NSD_CreateCheckbox} 0 102u 100% 12u "MOBI"
  Pop $OTB_AssocMobi
  ${NSD_SetState} $OTB_AssocPdf ${BST_CHECKED}
  ${NSD_SetState} $OTB_AssocEpub ${BST_CHECKED}
  ${NSD_SetState} $OTB_AssocAzw3 ${BST_CHECKED}
  ${NSD_SetState} $OTB_AssocMobi ${BST_CHECKED}
  StrCpy $OTB_AssocPageShown 1
  nsDialogs::Show
FunctionEnd

Function OTB_AssociationsLeave
  ${NSD_GetState} $OTB_AssocPdf $OTB_AssocPdfState
  ${NSD_GetState} $OTB_AssocEpub $OTB_AssocEpubState
  ${NSD_GetState} $OTB_AssocAzw3 $OTB_AssocAzw3State
  ${NSD_GetState} $OTB_AssocMobi $OTB_AssocMobiState
FunctionEnd

!macro OTB_RegisterAssociation EXT CLASS DESCRIPTION
  WriteRegStr HKCU "Software\Classes\${CLASS}" "" "${DESCRIPTION}"
  WriteRegStr HKCU "Software\Classes\${CLASS}\DefaultIcon" "" '"$INSTDIR\${MAINBINARYNAME}.exe",0'
  WriteRegStr HKCU "Software\Classes\${CLASS}\shell" "" "open"
  WriteRegStr HKCU "Software\Classes\${CLASS}\shell\open\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'
  WriteRegStr HKCU "Software\Classes\.${EXT}\OpenWithProgids" "${CLASS}" ""
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Explorer\FileExts\.${EXT}\OpenWithProgids" "${CLASS}" ""
  WriteRegStr HKCU "Software\Classes\.${EXT}\OpenWithList\${MAINBINARYNAME}.exe" "" ""
  WriteRegStr HKCU "Software\Classes\Applications\${MAINBINARYNAME}.exe\SupportedTypes" ".${EXT}" ""
  WriteRegStr HKCU "Software\Classes\Applications\${MAINBINARYNAME}.exe" "FriendlyAppName" "OpenTheBook"
  WriteRegStr HKCU "Software\Classes\Applications\${MAINBINARYNAME}.exe\shell\open\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'
  ReadRegStr $R0 HKCU "Software\Microsoft\Windows\CurrentVersion\Explorer\FileExts\.${EXT}\OpenWithList" "a"
  ${If} $R0 == ""
    WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Explorer\FileExts\.${EXT}\OpenWithList" "a" "${MAINBINARYNAME}.exe"
  ${EndIf}
  WriteRegStr HKCU "Software\RegisteredApplications" "OpenTheBook" "Software\OpenTheBook\Capabilities"
  WriteRegStr HKCU "Software\OpenTheBook\Capabilities" "ApplicationName" "OpenTheBook"
  WriteRegStr HKCU "Software\OpenTheBook\Capabilities" "ApplicationDescription" "A free, simple reader for PDF, EPUB, AZW3, and MOBI files."
  WriteRegStr HKCU "Software\OpenTheBook\Capabilities\FileAssociations" ".${EXT}" "${CLASS}"
!macroend

!macro OTB_SavePreviousDefault EXT CLASS
  ReadRegStr $R0 HKCU "Software\Classes\.${EXT}" ""
  ${If} $R0 != "${CLASS}"
    ReadRegDWORD $R1 HKCU "Software\OpenTheBook\PreviousDefaults\.${EXT}" "Saved"
    ${If} $R1 != 1
      WriteRegStr HKCU "Software\OpenTheBook\PreviousDefaults\.${EXT}" "Value" "$R0"
      WriteRegDWORD HKCU "Software\OpenTheBook\PreviousDefaults\.${EXT}" "Saved" 1
    ${EndIf}
  ${EndIf}
!macroend

!macro OTB_SetDefault EXT CLASS
  ; Writing the extension's HKCU class is the supported installer-level attempt
  ; to make OpenTheBook the default. Windows 10/11 can still protect UserChoice.
  WriteRegStr HKCU "Software\Classes\.${EXT}" "" "${CLASS}"
!macroend

!macro OTB_RemoveAssociation EXT CLASS
  DeleteRegValue HKCU "Software\Classes\.${EXT}\OpenWithProgids" "${CLASS}"
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Explorer\FileExts\.${EXT}\OpenWithProgids" "${CLASS}"
  ReadRegStr $R0 HKCU "Software\Microsoft\Windows\CurrentVersion\Explorer\FileExts\.${EXT}\OpenWithList" "a"
  ${If} $R0 == "${MAINBINARYNAME}.exe"
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Explorer\FileExts\.${EXT}\OpenWithList" "a"
    ReadRegStr $R1 HKCU "Software\Microsoft\Windows\CurrentVersion\Explorer\FileExts\.${EXT}\OpenWithList" "MRUList"
    ${If} $R1 == "a"
      DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Explorer\FileExts\.${EXT}\OpenWithList" "MRUList"
    ${EndIf}
  ${EndIf}
  DeleteRegKey HKCU "Software\Classes\.${EXT}\OpenWithList\${MAINBINARYNAME}.exe"
  DeleteRegValue HKCU "Software\Classes\Applications\${MAINBINARYNAME}.exe\SupportedTypes" ".${EXT}"
  ReadRegStr $R0 HKCU "Software\Classes\.${EXT}" ""
  ${If} $R0 == "${CLASS}"
    ReadRegDWORD $R1 HKCU "Software\OpenTheBook\PreviousDefaults\.${EXT}" "Saved"
    ${If} $R1 == 1
      ReadRegStr $R2 HKCU "Software\OpenTheBook\PreviousDefaults\.${EXT}" "Value"
      ${If} $R2 == ""
        DeleteRegValue HKCU "Software\Classes\.${EXT}" ""
      ${Else}
        WriteRegStr HKCU "Software\Classes\.${EXT}" "" "$R2"
      ${EndIf}
    ${Else}
      DeleteRegValue HKCU "Software\Classes\.${EXT}" ""
    ${EndIf}
  ${EndIf}
  DeleteRegKey HKCU "Software\Classes\${CLASS}"
  DeleteRegKey HKCU "Software\OpenTheBook\PreviousDefaults\.${EXT}"
  DeleteRegValue HKCU "Software\OpenTheBook\Capabilities\FileAssociations" ".${EXT}"
!macroend

!macro OTB_CleanupSharedRegistry
  ; Keep the shared application entries while at least one format is selected.
  ReadRegStr $R0 HKCU "Software\OpenTheBook\Capabilities\FileAssociations" ".pdf"
  ReadRegStr $R1 HKCU "Software\OpenTheBook\Capabilities\FileAssociations" ".epub"
  ReadRegStr $R2 HKCU "Software\OpenTheBook\Capabilities\FileAssociations" ".azw3"
  ReadRegStr $R3 HKCU "Software\OpenTheBook\Capabilities\FileAssociations" ".mobi"
  ${If} $R0 == ""
  ${AndIf} $R1 == ""
  ${AndIf} $R2 == ""
  ${AndIf} $R3 == ""
    DeleteRegValue HKCU "Software\RegisteredApplications" "OpenTheBook"
    DeleteRegKey HKCU "Software\OpenTheBook\Capabilities"
    DeleteRegKey HKCU "Software\Classes\Applications\${MAINBINARYNAME}.exe"
  ${EndIf}

!macroend

!macro NSIS_HOOK_POSTINSTALL
  ; A silent install receives the safe default: register and select all four formats.
  ${If} $OTB_AssocPageShown != 1
    StrCpy $OTB_AssocPdfState ${BST_CHECKED}
    StrCpy $OTB_AssocEpubState ${BST_CHECKED}
    StrCpy $OTB_AssocAzw3State ${BST_CHECKED}
    StrCpy $OTB_AssocMobiState ${BST_CHECKED}
  ${EndIf}

  ${If} $OTB_AssocPdfState == ${BST_CHECKED}
    !insertmacro OTB_SavePreviousDefault "pdf" "OpenTheBook.PDF"
    !insertmacro OTB_RegisterAssociation "pdf" "OpenTheBook.PDF" "PDF document"
    !insertmacro OTB_SetDefault "pdf" "OpenTheBook.PDF"
  ${Else}
    !insertmacro OTB_RemoveAssociation "pdf" "OpenTheBook.PDF"
  ${EndIf}
  ${If} $OTB_AssocEpubState == ${BST_CHECKED}
    !insertmacro OTB_SavePreviousDefault "epub" "OpenTheBook.EPUB"
    !insertmacro OTB_RegisterAssociation "epub" "OpenTheBook.EPUB" "EPUB ebook"
    !insertmacro OTB_SetDefault "epub" "OpenTheBook.EPUB"
  ${Else}
    !insertmacro OTB_RemoveAssociation "epub" "OpenTheBook.EPUB"
  ${EndIf}
  ${If} $OTB_AssocAzw3State == ${BST_CHECKED}
    !insertmacro OTB_SavePreviousDefault "azw3" "OpenTheBook.AZW3"
    !insertmacro OTB_RegisterAssociation "azw3" "OpenTheBook.AZW3" "AZW3 ebook"
    !insertmacro OTB_SetDefault "azw3" "OpenTheBook.AZW3"
  ${Else}
    !insertmacro OTB_RemoveAssociation "azw3" "OpenTheBook.AZW3"
  ${EndIf}
  ${If} $OTB_AssocMobiState == ${BST_CHECKED}
    !insertmacro OTB_SavePreviousDefault "mobi" "OpenTheBook.MOBI"
    !insertmacro OTB_RegisterAssociation "mobi" "OpenTheBook.MOBI" "MOBI ebook"
    !insertmacro OTB_SetDefault "mobi" "OpenTheBook.MOBI"
  ${Else}
    !insertmacro OTB_RemoveAssociation "mobi" "OpenTheBook.MOBI"
  ${EndIf}
  WriteRegStr HKCU "Software\OpenTheBook" "AssociationsInstalled" "1"
  !insertmacro OTB_CleanupSharedRegistry
  !insertmacro UPDATEFILEASSOC
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  !insertmacro OTB_RemoveAssociation "pdf" "OpenTheBook.PDF"
  !insertmacro OTB_RemoveAssociation "epub" "OpenTheBook.EPUB"
  !insertmacro OTB_RemoveAssociation "azw3" "OpenTheBook.AZW3"
  !insertmacro OTB_RemoveAssociation "mobi" "OpenTheBook.MOBI"
  !insertmacro OTB_CleanupSharedRegistry
  DeleteRegValue HKCU "Software\OpenTheBook" "AssociationsInstalled"
  !insertmacro UPDATEFILEASSOC
!macroend
