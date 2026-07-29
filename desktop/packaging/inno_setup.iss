; ESP32 Studio — Inno Setup Script for Windows
; Windows tizimlarida ESP32Studio_Setup.exe o'rnatgich yaratish kodi

#define MyAppName "ESP32 Studio"
#define MyAppVersion "1.0.0"
#define MyAppPublisher "Toshelectroapparat"
#define MyAppURL "https://ss.boos.uz"
#define MyAppExeName "ESP32Studio.exe"

[Setup]
AppId={{C6B89D42-78A1-4D93-9B2E-834927B55D01}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}
AppUpdatesURL={#MyAppURL}
DefaultDirName={autopf}\{#MyAppName}
DisableProgramGroupPage=yes
OutputBaseFilename=ESP32Studio_Setup_v{#MyAppVersion}
SetupIconFile=..\app_icon.ico
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
ArchitecturesInstallIn64BitMode=x64

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked

[Files]
Source: "..\dist\ESP32Studio\{#MyAppExeName}"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\dist\ESP32Studio\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "..\app_icon.ico"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{autoprograms}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; IconFilename: "{app}\app_icon.ico"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; IconFilename: "{app}\app_icon.ico"; Tasks: desktopicon

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "{cm:LaunchProgram,{#StringChange(MyAppName, '&', '&&')}}"; Flags: nowait postinstall skipifsilent

[Code]
// Windows o'rnatish jarayonida Python va pip esptool mosligini avtomatik sozlashingiz mumkin
