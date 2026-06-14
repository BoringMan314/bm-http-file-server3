// Console i18n — upstream HFS style (same hfs-lang-*.json as frontend/admin)
import { i18nFromTranslations } from './i18n'
import en from './langs/hfs-lang-en.json'
import zh_tw from './langs/hfs-lang-zh-tw.json'
import zh from './langs/hfs-lang-zh.json'
import ja from './langs/hfs-lang-ja.json'
import { argv } from './argv'

export type ConsoleLang = 'en' | 'zh-tw' | 'zh' | 'ja'

const LANG_FILES = { en, 'zh-tw': zh_tw, zh, ja }

/** Legacy camelCase keys → English phrase keys in hfs-lang-*.json */
const consoleKeyToEnglish: Record<string, string> = {
    additionalArguments: 'Additional arguments',
    app: 'App',
    args: 'Args',
    build: 'Build',
    cannotLaunchBrowser: 'Cannot launch browser on this machine >PLEASE< open your browser and reach one of these (you may need a different address)',
    certificateLoadedFor: 'Certificate loaded for',
    config: 'Config',
    configSaveFailed: 'Failed at saving config file, please ensure it is writable.',
    couldNotDetermineService: "Couldn't determine if we are running as a service",
    errorLoading: 'Error loading',
    loadingPlugin: 'Loading plugin',
    reloadingPlugin: 'Reloading plugin',
    switchingPlugin: 'Switching plugin',
    pluginOn: 'on',
    pluginOff: 'off',
    pluginError: 'Plugin error',
    errorUnloadingPlugin: 'Error unloading plugin',
    unloadedPlugin: 'Unloaded plugin',
    errorMiddlewarePlugin: 'Error middleware plugin {id}: {error}',
    invalidPluginValue: 'Invalid',
    scanningPlugins: 'Scanning plugins',
    pluginWatch: 'Plugin watch',
    pluginUnwatch: 'Plugin unwatch',
    startingPlugin: 'Starting plugin',
    plugin: 'Plugin',
    pluginBlockedRequest: 'Plugin blocked request',
    pluginChangedResponse: 'Plugin changed response:',
    pluginDependencyDiscarded: 'Plugin dependency discarded',
    couldNotListenPort: "Couldn't listen on port {port}: {error}",
    lackingPermissionPort: 'lacking permission on port {port}, try with permission ({permission}) or port > 1024',
    portBusy: 'port {port} busy: {process}',
    unknownProcess: 'unknown process',
    failedStopServer: 'Failed to stop server',
    removingUnfinishedUploads: 'Removing unfinished uploads',
    cannotCheckDiskSize: "Can't check disk size:",
    uploadStarted: 'Upload started',
    uploadFinished: 'Upload finished',
    uploadFailed: 'Upload failed',
    couldNotRenameTemp: "Couldn't rename temp to",
    fileErrorUploading: 'File error while uploading',
    endlessPermissionLoop: 'Endless loop in permission {perm}={value} for {node}',
    newVersionAvailable: 'New version available',
    checkingUpdates: 'Checking for updates',
    versionNotFound: 'Version not found',
    downloading: 'Downloading',
    downloadFinished: 'Download finished',
    restoreBinaryFailed: "Couldn't restore original binary after failed update",
    updatedBinaryRestart: 'Updated binary in place, exiting for process supervisor to restart',
    launchingNewVersion: 'Launching new version in background',
    quitting: 'Quitting',
    errorIn: 'Error in',
    failedCreateHttps: 'Failed to create https server: check your private key and certificate',
    hint: 'HINT: {msg}',
    loaded: 'Loaded',
    missingPermissions: 'Missing permissions on file',
    noConfig: 'No config file, using defaults',
    nodeRequired: 'Node.js 18.15+ is required, please update',
    openAdminFailed: 'OpenAdmin failed',
    pid: 'Pid',
    platform: 'Platform',
    runningAsService: 'Running as service',
    serverError: 'Server error',
    servingOn: 'Serving {proto} on {host} port {port}',
    servingUrl: 'Serving on {url}',
    anyIpv4: 'any IPv4',
    anyIpv6: 'any IPv6',
    anyNetwork: 'any network',
    upnpFound: 'UPnP found {description}',
    upnpFailed: 'UPnP failed: {error}',
    tryingIpService: 'Trying IP service {service}',
    checkingServer: 'Checking server {url}',
    tryingExternalService: 'Trying external service {service}',
    mappingsFound: 'Mappings found: {mappings}',
    none: 'none',
    started: 'Started',
    stoppedPort: 'Stopped port',
    trySpecifyingDifferentPort: 'try specifying a different port, enter this command: config {key} 1080',
    uncaught: 'Uncaught:',
    vfsReady: 'VFS ready',
    version: 'Version',
    workingDirectory: 'Working directory (cwd)',
    createAdminHint: 'you can enter this command: create-admin YOUR_PASSWORD',
    walkNode: 'walkNode',
    pluginEventError: 'plugin {id} on event {event}:',
    pluginErrorColon: 'Plugin error: {id}:',
    mappingsNotQueried: 'Mappings not queried:',
    upnpMappingRestoreFailed: 'UPnP mapping restore failed: {error}',
    accountAdminSet: 'Account admin set',
    somethingWentWrong: 'Something went wrong',
    hashingPasswordFor: 'Hashing password for',
    accountBelongsNonExisting: 'Account {username} belongs to non-existing {group}',
    quittingWithSignal: 'Quitting with signal: {signal}',
    errorWhileQuitting: 'Error while quitting',
    processExit: 'Process exit',
    node: 'Node',
    bun: 'Bun',
    downloadProgress: 'Download progress',
    renamedBinaryRestart: 'Renamed binary file to "{name}" and now restarting',
    opening: 'Open-ing',
    detectedProxy: 'Detected proxy',
    cannotCreateFolderFor: 'Cannot create folder for',
    cannotCreateDebugLog: 'Cannot create debug.log',
    consoleCommandsNotAvailable: 'Console commands not available',
    commandExecuted: '+++ Command executed',
    availableCommands: 'Available commands:',
    invalidCommand: "Invalid command, try 'help'",
    insufficientParameters: 'Insufficient parameters, expected: {params}',
    commandFailed: 'Command failed: {error}',
    noOngoingTransfers: 'No ongoing uploads/downloads',
    pluginOnLabel: 'On:',
    pluginOffLabel: 'Off:',
    debugMessagesOn: 'Debug messages on',
    debugMessagesOff: 'Debug messages off',
    acmeCertificateGenerated: 'ACME certificate generated',
    certificateStillGood: 'Certificate still good',
    downloadingPlugin: 'Downloading plugin',
    alertPrefix: 'ALERT:',
    blacklistedPluginsFound: 'Blacklisted plugins found: {list}',
    dynamicDnsUpdate: 'Dynamic dns update',
    blockingRulesExpired: 'Blocking rules: {count} expired',
    commandPrompt: 'command> ',
}

export function getConsoleLanguage(): ConsoleLang {
    const raw = String(argv.lang || argv.console_lang || process.env.HFS_CONSOLE_LANG || process.env.HFS_LANG || Intl.DateTimeFormat().resolvedOptions().locale || '').toLowerCase()
    if (raw.startsWith('zh_tw') || raw.startsWith('zh-tw') || raw.startsWith('zh_hk') || raw.startsWith('zh-hk') || raw.startsWith('zh_mo') || raw.startsWith('zh-mo')) return 'zh-tw'
    if (raw.startsWith('zh')) return 'zh'
    if (raw.startsWith('ja')) return 'ja'
    return 'en'
}

const { t } = i18nFromTranslations(
    (() => {
        const code = getConsoleLanguage()
        return code === 'en' ? { en: LANG_FILES.en } : { [code]: LANG_FILES[code], en: LANG_FILES.en }
    })(),
    'en',
)

export function ct(key: string, vars: Record<string, string | number> = {}) {
    const phrase = consoleKeyToEnglish[key] || key
    return t(phrase, vars, phrase)
}
