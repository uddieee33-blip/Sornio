; Per-user installer for the ONLINE-ONLY HOSTED PREVIEW.
; This is not the Sornio product installer. The product is the offline Tauri app in
; apps/desktop, packaged as an NSIS bundle by .github/workflows/windows-local.yml.
; Names here are deliberately distinct so the two can never be confused in a shop.
#define AppVersion "0.1.0"
[Setup]
AppId={{87B9F694-3A36-4C92-AFB4-9654893E01D2}
AppName=Sornio Hosted Preview
AppVersion={#AppVersion}
AppPublisher=Sornio
DefaultDirName={localappdata}\Programs\SornioHostedPreview
DefaultGroupName=Sornio Hosted Preview
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0
OutputDir=..\..\dist\installer
OutputBaseFilename=Sornio-Hosted-Preview-Setup-x64
SetupIconFile=Sornio.ico
UninstallDisplayIcon={app}\SornioHostedPreview.exe
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
DisableProgramGroupPage=yes
CloseApplications=yes

[Tasks]
Name: "desktopicon"; Description: "Create a desktop shortcut"; Flags: unchecked

[Files]
Source: "..\..\dist\windows\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{autoprograms}\Sornio Hosted Preview"; Filename: "{app}\SornioHostedPreview.exe"
Name: "{autodesktop}\Sornio Hosted Preview"; Filename: "{app}\SornioHostedPreview.exe"; Tasks: desktopicon

[Run]
Filename: "{app}\SornioHostedPreview.exe"; Description: "Open Sornio Hosted Preview"; Flags: nowait postinstall skipifsilent

; Uninstall removes application files, never the owner's WebView profile.
