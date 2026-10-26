; Per-user preview installer. The complete published folder is required.
#define AppVersion "0.1.0"
[Setup]
AppId={{87B9F694-3A36-4C92-AFB4-9654893E01D2}
AppName=Sornio
AppVersion={#AppVersion}
AppPublisher=Sornio
DefaultDirName={localappdata}\Programs\Sornio
DefaultGroupName=Sornio
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0
OutputDir=..\..\dist\installer
OutputBaseFilename=Sornio-Setup-x64
SetupIconFile=Sornio.ico
UninstallDisplayIcon={app}\Sornio.exe
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
Name: "{autoprograms}\Sornio"; Filename: "{app}\Sornio.exe"
Name: "{autodesktop}\Sornio"; Filename: "{app}\Sornio.exe"; Tasks: desktopicon

[Run]
Filename: "{app}\Sornio.exe"; Description: "Open Sornio"; Flags: nowait postinstall skipifsilent

; Uninstall removes application files, never the owner's WebView profile.
