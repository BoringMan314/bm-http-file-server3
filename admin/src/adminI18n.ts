// Admin language UI + t() — translations live in src/langs/hfs-lang-*.json (upstream HFS style)
import { useEffect, useMemo, useState } from 'react'
import { adminLangToHfsCode, applyAdminLangPriority, hfsT, useI18N } from './i18n'
import { setFormTranslate } from '@hfs/mui-grid-form'

export type AdminLanguage = 'en_US' | 'zh_TW' | 'zh_CN' | 'ja_JP'
export type AdminTextKey = string

const STORAGE_KEY = 'hfs-admin-language'
const DEFAULT_LANGUAGE: AdminLanguage = 'en_US'

export const adminLanguages: { code: AdminLanguage, label: string, dayjsLocale: string }[] = [
    { code: 'en_US', label: 'English', dayjsLocale: 'en' },
    { code: 'zh_TW', label: '繁體中文', dayjsLocale: 'zh-tw' },
    { code: 'zh_CN', label: '简体中文', dayjsLocale: 'zh-cn' },
    { code: 'ja_JP', label: '日本語', dayjsLocale: 'ja' },
]

/** Legacy camelCase menu keys → English phrase keys in hfs-lang-*.json */
const camelToEnglish: Record<string, string> = {
    accounts: 'Accounts',
    accessFileMenu: 'Access file menu',
    adminLanguage: 'Admin language',
    adminPanel: 'Admin-panel',
    autoPlaySecondsDelay: 'Auto-play seconds delay',
    calculateZipSizeFor: 'Calculate ZIP size for',
    choose: 'choose',
    configFile: 'Config file',
    customHtml: 'Custom HTML',
    defaultTilesSize: 'Default tiles size',
    encodingOfFileDescription: 'Encoding of file DESCRIPT.ION',
    entriesPerPage: 'Entries per page',
    file: 'File',
    considerLocalhostAdmin: 'Consider localhost access as Admin',
    accessAdminWithoutCredentials: 'Access admin-panel without entering credentials',
    upnpSsdp: 'UPnP/SSDP',
    portForwardingDoubleNat: 'Port forwarding and double-NAT detection',
    why: 'Why?',
    fileSystemPage: 'File System page',
    optionsPage: 'Options page',
    frontEnd: 'Front-end',
    frontEndOnlyOptions: 'Following options affect only the front-end',
    forceHttps: 'Force HTTPS',
    forceLanguage: 'Force language: {code}',
    home: 'Home',
    httpPort: 'HTTP port',
    httpsCertificateFile: 'HTTPS certificate file',
    httpsPort: 'HTTPS port',
    httpsPrivateKeyFile: 'HTTPS private key file',
    internet: 'Internet',
    language: 'Language',
    languageAdd: 'Add',
    languageAddLoaded: 'Loaded',
    languageCannotDeleteEmbedded: 'Cannot delete (embedded)',
    languageDelete: 'Delete',
    languageDeleteConfirm: 'Delete language code "{code}"?',
    languageDeleted: 'Deleted',
    languageFrontEndOnlyNotice: 'Language files uploaded here apply to the Front-end. Admin-panel uses the toolbar language selector.',
    languageRespectBrowser: 'Respect browser language',
    limitOutput: 'Limit output',
    limitOutputPerIp: 'Limit output per-IP',
    logs: 'Logs',
    logout: 'Logout',
    maxDownloads: 'Max downloads',
    maxDownloadsPerAccount: 'Max downloads per-account',
    maxDownloadsPerIp: 'Max downloads per-IP',
    minAvailableDiskSpace: 'Min. available disk space',
    monitoring: 'Monitoring',
    networking: 'Networking',
    numberOfSimultaneousDownloads: 'Number of simultaneous downloads',
    off: 'off',
    openAdminPanelAtStart: 'Open Admin-panel at start',
    options: 'Options',
    others: 'Others',
    plugins: 'Plugins',
    random: 'random',
    reload: 'Reload',
    sharedFiles: 'Shared files',
    sortNumericNames: 'Sort numeric names',
    uploads: 'Uploads',
    webdavForceLogin: 'WebDAV force login',
    webdavInitialAuth: 'WebDAV initial auth',
}

let currentLanguage = readStoredLanguage()
const listeners = new Set<() => void>()

applyAdminLangPriority(adminLangToHfsCode[currentLanguage])
setFormTranslate(hfsT)

export function getAdminLanguage() {
    return currentLanguage
}

export function getAdminDayjsLocale(language = currentLanguage) {
    return adminLanguages.find(x => x.code === language)?.dayjsLocale || 'en'
}

export function setAdminLanguage(language: AdminLanguage) {
    if (!isAdminLanguage(language) || currentLanguage === language) return
    currentLanguage = language
    localStorage.setItem(STORAGE_KEY, language)
    applyAdminLangPriority(adminLangToHfsCode[language])
    listeners.forEach(fn => fn())
}

export function useAdminLanguage() {
    useI18N() // re-render when translation priority changes
    const [language, setLanguageState] = useState(currentLanguage)
    useEffect(() => {
        const update = () => setLanguageState(currentLanguage)
        listeners.add(update)
        return () => void listeners.delete(update)
    }, [])
    return useMemo(() => ({
        language,
        setLanguage: setAdminLanguage,
        t,
    }), [language])
}

export function t(key: AdminTextKey, vars: Record<string, string | number> = {}) {
    const phrase = camelToEnglish[key] || key
    return hfsT(phrase, vars, phrase)
}

function readStoredLanguage(): AdminLanguage {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (isAdminLanguage(stored)) return stored
    const browser = navigator.language.toLowerCase()
    if (browser.startsWith('zh-tw') || browser.startsWith('zh-hk') || browser.startsWith('zh-mo')) return 'zh_TW'
    if (browser.startsWith('zh')) return 'zh_CN'
    if (browser.startsWith('ja')) return 'ja_JP'
    return DEFAULT_LANGUAGE
}

function isAdminLanguage(x: unknown): x is AdminLanguage {
    return adminLanguages.some(lang => lang.code === x)
}

export { useI18N } from './i18n'
