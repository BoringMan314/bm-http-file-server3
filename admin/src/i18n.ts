// Admin i18n — upstream HFS style (i18nFromTranslations + hfs-lang-*.json)
import { i18nFromTranslations } from '../../src/i18n'
import en from '../../src/langs/hfs-lang-en.json'
import zh_tw from '../../src/langs/hfs-lang-zh-tw.json'
import zh from '../../src/langs/hfs-lang-zh.json'
import ja from '../../src/langs/hfs-lang-ja.json'

export const HFS_LANG_FILES = { en, 'zh-tw': zh_tw, zh, ja } as const
export type HfsLangCode = keyof typeof HFS_LANG_FILES

export const adminLangToHfsCode = {
    en_US: 'en',
    zh_TW: 'zh-tw',
    zh_CN: 'zh',
    ja_JP: 'ja',
} as const satisfies Record<string, HfsLangCode>

const i18n = i18nFromTranslations({ ...HFS_LANG_FILES }, 'en')

export default i18n
export const { useI18N } = i18n

/** Prefer selected language, then English fallback (upstream search order). */
export function applyAdminLangPriority(code: HfsLangCode) {
    i18n.state.translations = code === 'en'
        ? { en: HFS_LANG_FILES.en }
        : { [code]: HFS_LANG_FILES[code], en: HFS_LANG_FILES.en }
}

applyAdminLangPriority('en')

export function hfsT(key: string, params?: Record<string, unknown>, fallback?: string) {
    if (typeof params === 'string' && fallback === undefined) {
        fallback = params
        params = undefined
    }
    return i18n.t(key, params, fallback ?? key)
}
