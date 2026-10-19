; Instalador de GitLeviatan para Windows (Inno Setup 6.3+).
; Lo compila scripts/build-windows.ps1, que pasa estas definiciones:
;   /DAppVersion=0.1.0  /DSourceExe=<ruta a gitleviatan.exe>  /DRepoRoot=<raíz del repo>
; A mano:  ISCC /DAppVersion=0.1.0 /DSourceExe=... /DRepoRoot=... installer\windows\gitleviatan.iss

#ifndef AppVersion
  #error Falta /DAppVersion=<versión>
#endif
#ifndef SourceExe
  #error Falta /DSourceExe=<ruta a gitleviatan.exe>
#endif
#ifndef RepoRoot
  #error Falta /DRepoRoot=<raíz del repositorio>
#endif

#define AppName "GitLeviatan"
#define AppExe "gitleviatan.exe"

[Setup]
; GUID propio de esta aplicación: no cambiarlo, así las actualizaciones reemplazan la instalación previa.
AppId={{7B1E4C52-3A9D-4F68-9C0E-5D2A8F6B1E37}
AppName={#AppName}
AppVersion={#AppVersion}
AppVerName={#AppName} {#AppVersion}
AppPublisher=GitLeviatan contributors
AppPublisherURL=https://github.com/jorarmarfin/GitLeviatan
AppSupportURL=https://github.com/jorarmarfin/GitLeviatan/issues
AppUpdatesURL=https://github.com/jorarmarfin/GitLeviatan/releases
DefaultDirName={autopf}\{#AppName}
DefaultGroupName={#AppName}
DisableProgramGroupPage=yes
; Por usuario (sin pedir administrador), como el instalador NSIS; el usuario puede elegir «todos».
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=dialog
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0
LicenseFile={#RepoRoot}\LICENSE
SetupIconFile={#RepoRoot}\src-tauri\icons\icon.ico
UninstallDisplayIcon={app}\{#AppExe}
OutputBaseFilename={#AppName}_{#AppVersion}_x64-inno-setup
Compression=lzma2
SolidCompression=yes
WizardStyle=modern

[Languages]
Name: "spanish"; MessagesFile: "compiler:Languages\Spanish.isl"
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked

[Files]
Source: "{#SourceExe}"; DestDir: "{app}"; DestName: "{#AppExe}"; Flags: ignoreversion
Source: "{#RepoRoot}\LICENSE"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#RepoRoot}\README.md"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{autoprograms}\{#AppName}"; Filename: "{app}\{#AppExe}"
Name: "{autodesktop}\{#AppName}"; Filename: "{app}\{#AppExe}"; Tasks: desktopicon

[Run]
Filename: "{app}\{#AppExe}"; Description: "{cm:LaunchProgram,{#AppName}}"; Flags: nowait postinstall skipifsilent

[Code]
const
  WebView2Key = 'Software\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}';

function HasWebView2Version(RootKey: Integer; const SubKey: String): Boolean;
var
  Version: String;
begin
  Result := RegQueryStringValue(RootKey, SubKey, 'pv', Version)
    and (Version <> '') and (Version <> '0.0.0.0');
end;

// La app usa WebView2 para dibujar la interfaz. Viene con Windows 11 y con Windows 10 actualizado.
function WebView2Installed: Boolean;
begin
  Result := HasWebView2Version(HKLM32, WebView2Key) or HasWebView2Version(HKCU, WebView2Key);
end;

function InitializeSetup: Boolean;
begin
  Result := True;
  if not WebView2Installed then
    Result := SuppressibleMsgBox(
      'No se detecta Microsoft Edge WebView2 Runtime, que GitLeviatan necesita para mostrar su interfaz.' + #13#10#13#10 +
      'Descárgalo desde https://developer.microsoft.com/microsoft-edge/webview2/ (Evergreen Standalone Installer) ' +
      'e instálalo antes o después de continuar.' + #13#10#13#10 + '¿Continuar con la instalación?',
      mbConfirmation, MB_YESNO, IDYES) = IDYES;
end;
