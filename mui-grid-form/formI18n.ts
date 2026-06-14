// Optional UI string translation for shared form components (wired from admin/frontend)
let translate: (key: string) => string = k => k

export function setFormTranslate(fn: (key: string) => string) {
    translate = fn
}

export function formT(key: string) {
    return translate(key)
}
