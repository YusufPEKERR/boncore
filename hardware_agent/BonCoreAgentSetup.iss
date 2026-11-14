; =====================================================================
; BonCore Donanım Köprüsü - Çok Dilli ve Yüksek Hızlı Kurulum Sihirbazı
; =====================================================================

#define MyAppName "BonCore Donanım Köprüsü"
#define MyAppVersion "2.4.5"
#define MyAppPublisher "BonCore POS"
#define MyAppURL "https://boncore.com"
#define MyAppExeName "BonCoreAgent.exe"

[Setup]
AppId={{5A8D2F81-79A4-4A1C-9E5C-6C8E7D3F9B12}
AppName={#MyAppName}
; Denetim Masası Program Ekle/Kaldır listesinde sadece uygulama adı görünsün (Sürüm bilgisi adın içine eklenmez)
AppVerName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}
AppUpdatesURL={#MyAppURL}
DefaultDirName={autopf}\BonCore Donanım Köprüsü
DefaultGroupName={#MyAppName}
DisableProgramGroupPage=yes
OutputDir=dist
OutputBaseFilename=BonCoreDonanimKoprusuSetup
SetupIconFile=app_icon.ico
UninstallDisplayIcon={app}\{#MyAppExeName}

; PE VersionInfo & SmartScreen Güvenlik Bilgileri:
VersionInfoVersion=2.4.5.0
VersionInfoCompany=BonCore POS
VersionInfoDescription=BonCore Donanım Köprüsü Kurulum Sihirbazı
VersionInfoTextVersion=2.4.5
VersionInfoCopyright=Copyright (C) 2026 BonCore POS
VersionInfoProductName=BonCore Donanım Köprüsü
VersionInfoProductVersion=2.4.5.0
VersionInfoOriginalFileName=BonCoreDonanimKoprusuSetup.exe

; HIZ OPTİMİZASYONLARI:
; 1) lzma2/normal: Decompression sözlük boyutu küçüktür, setup ve uninstaller saliseler içinde açılır.
; 2) CloseApplications=no & RestartApplications=no: Windows Restart Manager API tüm sistemi taramaz, açılış donmasını engeller.
Compression=lzma2/normal
SolidCompression=yes
CloseApplications=no
RestartApplications=no
ShowLanguageDialog=yes
WizardStyle=modern
PrivilegesRequired=admin
ArchitecturesInstallIn64BitMode=x64compatible

[Languages]
Name: "turkish"; MessagesFile: "compiler:Languages\Turkish.isl"
Name: "english"; MessagesFile: "compiler:Default.isl"
Name: "german"; MessagesFile: "compiler:Languages\German.isl"
Name: "french"; MessagesFile: "compiler:Languages\French.isl"
Name: "spanish"; MessagesFile: "compiler:Languages\Spanish.isl"
Name: "italian"; MessagesFile: "compiler:Languages\Italian.isl"
Name: "russian"; MessagesFile: "compiler:Languages\Russian.isl"
Name: "arabic"; MessagesFile: "compiler:Languages\Arabic.isl"
Name: "portuguese"; MessagesFile: "compiler:Languages\BrazilianPortuguese.isl"
Name: "dutch"; MessagesFile: "compiler:Languages\Dutch.isl"

[CustomMessages]
turkish.TasksGroupShortcuts=Kısayollar:
turkish.TasksGroupStartup=Başlangıç Seçenekleri:
turkish.TasksGroupNotif=Bildirim Seçenekleri:
turkish.DesktopIcon=Masaüstü kısayolu oluşturulsun
turkish.AutoStart=Windows açılışında arka planda (saatin yanında) otomatik başlasın
turkish.Notifications=Terazi ve yazıcı bağlantı bildirimlerini göster
turkish.CleanUninstallPrompt=BonCore Donanım Köprüsü uygulamasının ayarlarını, konfigürasyonunu ve log dosyalarını da tamamen silmek istiyor musunuz?

english.TasksGroupShortcuts=Shortcuts:
english.TasksGroupStartup=Startup Options:
english.TasksGroupNotif=Notification Options:
english.DesktopIcon=Create a desktop shortcut
english.AutoStart=Start automatically with Windows (minimized to system tray)
english.Notifications=Show scale and printer connection notifications
english.CleanUninstallPrompt=Do you also want to completely delete BonCore Hardware Bridge user settings, configurations, and logs?

german.TasksGroupShortcuts=Verknüpfungen:
german.TasksGroupStartup=Autostart-Optionen:
german.TasksGroupNotif=Benachrichtigungen:
german.DesktopIcon=Desktop-Verknüpfung erstellen
german.AutoStart=Automatisch mit Windows starten (im Infobereich)
german.Notifications=Benachrichtigungen für Waage und Drucker anzeigen
german.CleanUninstallPrompt=Möchten Sie auch alle Einstellungen, Konfigurationen und Protokolldateien löschen?

french.TasksGroupShortcuts=Raccourcis:
french.TasksGroupStartup=Options de démarrage:
french.TasksGroupNotif=Options de notification:
french.DesktopIcon=Créer un raccourci sur le bureau
french.AutoStart=Démarrer automatiquement avec Windows (dans la barre d'état)
french.Notifications=Afficher les notifications de connexion de la balance et de l'imprimante
french.CleanUninstallPrompt=Voulez-vous également supprimer complètement les paramètres et journaux ?

spanish.TasksGroupShortcuts=Accesos directos:
spanish.TasksGroupStartup=Opciones de inicio:
spanish.TasksGroupNotif=Opciones de notificación:
spanish.DesktopIcon=Crear un acceso directo en el escritorio
spanish.AutoStart=Iniciar automáticamente con Windows (en la bandeja del sistema)
spanish.Notifications=Mostrar notificaciones de conexión de balanza e impresora
spanish.CleanUninstallPrompt=¿Desea eliminar también por completo la configuración y los registros?

italian.TasksGroupShortcuts=Scorciatoie:
italian.TasksGroupStartup=Opzioni di avvio:
italian.TasksGroupNotif=Opzioni di notifica:
italian.DesktopIcon=Crea un collegamento sul desktop
italian.AutoStart=Avvia automaticamente con Windows (ridotto a icona)
italian.Notifications=Mostra notifiche di connessione per bilancia e stampante
italian.CleanUninstallPrompt=Vuoi eliminare completamente anche le impostazioni e i log?

russian.TasksGroupShortcuts=Ярлыки:
russian.TasksGroupStartup=Параметры автозапуска:
russian.TasksGroupNotif=Параметры уведомлений:
russian.DesktopIcon=Создать ярлык на рабочем столе
russian.AutoStart=Автоматический запуск при старте Windows (в трее)
russian.Notifications=Показывать уведомления о подключении весов и принтера
russian.CleanUninstallPrompt=Вы также хотите полностью удалить настройки, конфигурацию и журналы?

arabic.TasksGroupShortcuts=اختصارات:
arabic.TasksGroupStartup=خيارات بدء التشغيل:
arabic.TasksGroupNotif=خيارات الإشعارات:
arabic.DesktopIcon=إنشاء اختصار على سطح المكتب
arabic.AutoStart=التشغيل تلقائيًا مع بدء تشغيل Windows (في شريط المهام)
arabic.Notifications=إظهار إشعارات اتصال الميزان والطابعة
arabic.CleanUninstallPrompt=هل ترغب أيضًا في حذف جميع الإعدادات والسجلات تمامًا؟

portuguese.TasksGroupShortcuts=Atalhos:
portuguese.TasksGroupStartup=Opções de Inicialização:
portuguese.TasksGroupNotif=Opções de Notificação:
portuguese.DesktopIcon=Criar um atalho na área de trabalho
portuguese.AutoStart=Iniciar automaticamente com o Windows (na bandeja do sistema)
portuguese.Notifications=Mostrar notificações de conexão da balança e impressora
portuguese.CleanUninstallPrompt=Deseja também excluir completamente as configurações e logs?

dutch.TasksGroupShortcuts=Snelkoppelingen:
dutch.TasksGroupStartup=Opstartopties:
dutch.TasksGroupNotif=Meldingsopties:
dutch.DesktopIcon=Maak een snelkoppeling op het bureaublad
dutch.AutoStart=Automatisch starten met Windows (geminimaliseerd in systeemvak)
dutch.Notifications=Toon verbindingsmeldingen voor weegschaal en printer
dutch.CleanUninstallPrompt=Wilt u ook alle instellingen, configuraties en logbestanden volledig verwijderen?

[Tasks]
Name: "desktopicon"; Description: "{cm:DesktopIcon}"; GroupDescription: "{cm:TasksGroupShortcuts}"
Name: "autostart"; Description: "{cm:AutoStart}"; GroupDescription: "{cm:TasksGroupStartup}"
Name: "notifications"; Description: "{cm:Notifications}"; GroupDescription: "{cm:TasksGroupNotif}"

[Files]
Source: "BonCoreAgent.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "app_icon.ico"; DestDir: "{app}"; Flags: ignoreversion
Source: "app_logo.png"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{autoprograms}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; IconFilename: "{app}\{#MyAppExeName}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon; IconFilename: "{app}\{#MyAppExeName}"

[Registry]
; Windows Başlangıç Otomatik Çalıştırma (Yalnızca tek kanonik kayıt: BonCoreAgent)
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueType: string; ValueName: "BonCoreAgent"; ValueData: """{app}\{#MyAppExeName}"" --hidden"; Tasks: autostart; Flags: uninsdeletevalue
; Kullanıcı kurulumda otomatik başlatmayı kapattıysa eski kaydı sil
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueName: "BonCoreAgent"; Tasks: not autostart; Flags: deletevalue
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run"; ValueName: "BonCoreAgent"; Tasks: not autostart; Flags: deletevalue
; Eski/yinelenen BonCoreHardwareAgent kayıtlarını kurulum ve kaldırmada kesin olarak temizle
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueName: "BonCoreHardwareAgent"; Flags: deletevalue uninsdeletevalue
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run"; ValueName: "BonCoreHardwareAgent"; Flags: deletevalue uninsdeletevalue
Root: HKLM; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueName: "BonCoreHardwareAgent"; Flags: deletevalue uninsdeletevalue
Root: HKLM; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueName: "BonCoreAgent"; Flags: deletevalue uninsdeletevalue

; Kurulum sırasında seçilen tercihleri kayıt defterine yaz (Mevcut ayarları ezmez, sıfır kurulumda varsayılan yapar)
Root: HKCU; Subkey: "Software\BonCoreAgent"; ValueType: dword; ValueName: "AutoStart"; ValueData: 1; Tasks: autostart; Flags: uninsdeletevalue
Root: HKCU; Subkey: "Software\BonCoreAgent"; ValueType: dword; ValueName: "AutoStart"; ValueData: 0; Tasks: not autostart; Flags: uninsdeletevalue
Root: HKCU; Subkey: "Software\BonCoreAgent"; ValueType: dword; ValueName: "ShowNotifications"; ValueData: 1; Tasks: notifications; Flags: uninsdeletevalue
Root: HKCU; Subkey: "Software\BonCoreAgent"; ValueType: dword; ValueName: "ShowNotifications"; ValueData: 0; Tasks: not notifications; Flags: uninsdeletevalue
Root: HKCU; Subkey: "Software\BonCoreAgent"; ValueType: string; ValueName: "SelectedLanguage"; ValueData: "{language}"; Flags: uninsdeletevalue
Root: HKCU; Subkey: "Software\BonCoreAgent"; ValueType: string; ValueName: "InstallPath"; ValueData: "{app}"; Flags: uninsdeletekey

[Run]
; Normal arayüzlü kurulumda bitiş sayfasında çalıştırma seçeneği
Filename: "{app}\{#MyAppExeName}"; Description: "{cm:LaunchProgram,{#StringChange(MyAppName, '&', '&&')}}"; Flags: nowait postinstall skipifsilent
; Sessiz güncelleme kurulumunda otomatik başlatma ve bildirim parametresi
Filename: "{app}\{#MyAppExeName}"; Parameters: "--updated"; Flags: nowait; Check: WizardSilent

[UninstallRun]
Filename: "taskkill.exe"; Parameters: "/F /IM {#MyAppExeName}"; Flags: runhidden; RunOnceId: "StopBonCoreAgent"

[Code]
// Kurulum öncesi çalışan BonCoreAgent varsa kapat
function InitializeSetup(): Boolean;
var
  ResultCode: Integer;
begin
  Result := True;
  // Hızlı sessiz kapatma
  Exec('cmd.exe', '/c taskkill /F /IM {#MyAppExeName} >nul 2>&1', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
end;

// Kaldırma öncesi çalışan BonCoreAgent varsa kapat
function InitializeUninstall(): Boolean;
var
  ResultCode: Integer;
begin
  Result := True;
  Exec('cmd.exe', '/c taskkill /F /IM {#MyAppExeName} >nul 2>&1', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
end;

procedure CleanBonCoreRunKey(RootKey: Integer; const Subkey, ApprovedSubkey: string);
var
  Names: TArrayOfString;
  I: Integer;
  ValStr, LowVal: string;
begin
  RegDeleteValue(RootKey, Subkey, 'BonCoreAgent');
  RegDeleteValue(RootKey, Subkey, 'BonCoreHardwareAgent');
  RegDeleteValue(RootKey, ApprovedSubkey, 'BonCoreAgent');
  RegDeleteValue(RootKey, ApprovedSubkey, 'BonCoreHardwareAgent');

  if RegGetValueNames(RootKey, Subkey, Names) then
  begin
    for I := 0 to GetArrayLength(Names) - 1 do
    begin
      if RegQueryStringValue(RootKey, Subkey, Names[I], ValStr) then
      begin
        LowVal := Lowercase(ValStr);
        if (Pos('boncoreagent', LowVal) > 0) or (Pos('boncore donanım köprüsü', LowVal) > 0) or ((Pos('hardware_agent', LowVal) > 0) and (Pos('desktop_app.py', LowVal) > 0)) then
        begin
          RegDeleteValue(RootKey, Subkey, Names[I]);
          RegDeleteValue(RootKey, ApprovedSubkey, Names[I]);
        end;
      end;
    end;
  end;
end;

procedure CleanAllStartupEntries();
var
  StartupDirs: array[0..1] of string;
  ShortcutNames: array[0..2] of string;
  I, J: Integer;
  Path: string;
begin
  CleanBonCoreRunKey(HKCU, 'Software\Microsoft\Windows\CurrentVersion\Run', 'Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run');
  CleanBonCoreRunKey(HKLM, 'Software\Microsoft\Windows\CurrentVersion\Run', 'Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run');
  if IsWin64 then
  begin
    CleanBonCoreRunKey(HKLM64, 'Software\Microsoft\Windows\CurrentVersion\Run', 'Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run');
    CleanBonCoreRunKey(HKLM32, 'Software\Microsoft\Windows\CurrentVersion\Run', 'Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run');
  end;

  StartupDirs[0] := ExpandConstant('{userstartup}');
  StartupDirs[1] := ExpandConstant('{commonstartup}');
  ShortcutNames[0] := 'BonCoreAgent.lnk';
  ShortcutNames[1] := 'BonCore Donanım Köprüsü.lnk';
  ShortcutNames[2] := 'BonCore Hardware Agent.lnk';
  for I := 0 to 1 do
  begin
    for J := 0 to 2 do
    begin
      Path := AddBackslash(StartupDirs[I]) + ShortcutNames[J];
      if FileExists(Path) then
        DeleteFile(Path);
    end;
  end;
end;

procedure CurStepChanged(CurStep: TSetupStep);
begin
  if CurStep = ssInstall then
  begin
    // Önceki sürümden kalma yinelenen başlangıç kayıtlarını yeni kurulum yazılmadan önce temizle
    CleanAllStartupEntries();
  end;
end;

// Kaldırma tamamlandıktan sonra tüm başlangıç kayıtlarını temizle, kullanıcıya sor ve ayarları temizle
procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
var
  AppDataDir: string;
begin
  if CurUninstallStep = usPostUninstall then
  begin
    // Tüm başlangıç kayıtlarını (BonCoreAgent + eski BonCoreHardwareAgent + StartupApproved + Startup kısayolları) garanti temizle
    CleanAllStartupEntries();

    // Kullanıcıya seçtiği dilde sor
    if MsgBox(CustomMessage('CleanUninstallPrompt'), mbConfirmation, MB_YESNO or MB_DEFBUTTON2) = IDYES then
    begin
      AppDataDir := ExpandConstant('{userappdata}\BonCoreAgent');
      if DirExists(AppDataDir) then
      begin
        DelTree(AppDataDir, True, True, True);
      end;
      RegDeleteKeyIncludingSubkeys(HKCU, 'Software\BonCoreAgent');
    end;
  end;
end;
