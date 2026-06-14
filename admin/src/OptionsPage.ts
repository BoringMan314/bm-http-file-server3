// This file is part of HFS - Copyright 2021-2023, Massimo Melina <a@rejetto.com> - License https://www.gnu.org/licenses/gpl-3.0.txt

import { Box, Button, Divider, FormHelperText } from '@mui/material';
import { createElement as h, useEffect, useId, useRef, useState } from 'react'
import { apiCall, useApiEx } from './api'
import { state, useSnapState } from './state'
import { Link as RouterLink } from 'wouter'
import { CardMembership, EditNote, Refresh, Warning } from '@mui/icons-material'
import { adminApis } from '../../src/adminApis'
import {
    MAX_TILE_SIZE, REPO_URL, SORT_BY_OPTIONS, THEME_OPTIONS, CFG, IMAGE_FILEMASK,
    Dict, md, with_, try_, ipForUrl,
} from './misc'
import {
    iconTooltip, InLink, LinkBtn, propsForModifiedValues, wikiLink, useBreakpoint, NetmaskField, WildcardsSupported,
    execDoneMessage,
} from './mui'
import { Form, BoolField, NumberField, SelectField, FieldProps, Field, StringField } from '@hfs/mui-grid-form';
import { ArrayField } from './ArrayField'
import FileField from './FileField'
import { alertDialog, confirmDialog, newDialog, toast } from './dialog'
import { proxyWarning } from './HomePage'
import _ from 'lodash';
import { proxy, subscribe, useSnapshot } from 'valtio'
import { TextEditorField } from './TextEditor'
import { WhoField } from './FileForm';
import { t, useAdminLanguage } from './adminI18n'

let loaded: Dict | undefined
let exposedReloadStatus: undefined | (() => void)
const pageState = proxy({
    changes: {} as Dict
})

//subscribeKey is not working (anymore) on nested changes
subscribe(state, (ops) => {
    if (ops.some(op => op[1][0] === 'config'))
        recalculateChanges()
})

export default function OptionsPage() {
    useAdminLanguage()
    const { data, reload: reloadConfig, element } = useApiEx('get_config', { omit: ['vfs'] })
    const snap = useSnapState()
    const { changes } = useSnapshot(pageState)
    const statusApi  = useApiEx<typeof adminApis.get_status>(data && 'get_status')
    const status = statusApi.data
    const reloadStatus = exposedReloadStatus = statusApi.reload
    useEffect(() => void reloadStatus(), [data]) //eslint-disable-line
    useEffect(() => () => exposedReloadStatus = undefined, []) // clear this on unmount
    const sm = useBreakpoint('sm')
    const saveBtnRef = useRef<HTMLButtonElement>(null)

    const admins = useApiEx('get_admins').data?.list

    const hn = window.location.hostname
    const isLH = hn === 'localhost'
    const isV6 = hn.includes(':')
    const listenInterfaceOptions = [
        { label: t("any"), value: '', disabled: false },
        { label: t("any IPv4"), value: '0.0.0.0', disabled: !isLH && isV6 },
        { label: t("any IPv6"), value: '::', disabled: !isLH && !isV6 },
        ...['127.0.0.1', '::1'].map(x => ({ label: x, value: x, disabled: !isLH && hn !== x })),
        ...status?.ips?.map(x => ({ value: x, disabled: hn !== x })) || [],
    ]

    if (element)
        return element
    if (statusApi.error)
        return statusApi.element
    const values = (loaded !== data) ? (state.config = loaded = data) : snap.config
    const maxSpeedDefaults = {
        comp: NumberField,
        min: 1,
        unit: "KB/s",
        placeholder: t("no limit"),
        sm: 6,
    }
    const maxDownloadsDefaults = {
        comp: NumberField,
        placeholder: t("no limit"),
        toField: (x: any) => x || '',
        sm: 4,
    }
    const httpsEnabled = values.https_port >= 0
    return h(Form, {
        sx: { maxWidth: '60em' },
        values,
        set(v, k) {
            state.config[k] = v
        },
        stickyBar: true,
        onError: alertDialog,
        save: {
            ref: saveBtnRef,
            onClick: save,
            ...propsForModifiedValues( Object.keys(changes).length>0),
        },
        barSx: { gap: 2 },
        addToBar: [
            h(Button, {
                onClick() {
                    reloadConfig()
                    reloadStatus()
                },
                startIcon: h(Refresh),
            }, t('reload')),
            h(Button, { // @ts-ignore
                component: RouterLink,
                href: "/config",
                startIcon: h(EditNote),
            }, sm ? t('configFile') : t('file')),
        ],
        defaults() {
            return { xs: 6 }
        },
        fields: [
            h(Section, { title: t('networking') }),
            { k: 'port', comp: PortField, xs: 12, sm: 4, label: t('httpPort'), status: status?.http||true, suggestedPort: 80 },
            { k: 'https_port', comp: PortField, xs: 12, sm: 4, label: t('httpsPort'), status: status?.https||true, suggestedPort: 443,
                onChange(v: number) {
                    if (v >= 0 && !httpsEnabled && !values.cert)
                        void suggestMakingCert()
                    return v
                }
            },
            { k: CFG.upnp_enabled, comp: BoolField, xs: 12, sm: 4, label: t('UPnP/SSDP'),
                helperText: t('Port forwarding and double-NAT detection') },

            httpsEnabled && { k: 'cert', comp: FileField, sm: 4, label: t('httpsCertificateFile'),
                helperText: wikiLink('HTTPS#certificate', t("What is this?")),
                error: with_(status?.https.error, e => isCertError(e) && (
                    status!.https.listening ? e
                        : [e, ' - ', h(LinkBtn, { key: 'fix', onClick: suggestMakingCert }, t("make one"))] )),
            },
            httpsEnabled && { k: 'private_key', comp: FileField, sm: 4, label: t('httpsPrivateKeyFile'),
                ...with_(status?.https.error, e => isKeyError(e) ? { error: true, helperText: e } : null)
            },
            httpsEnabled && { k: 'force_https', comp: BoolField, label: t('forceHttps'), sm: 4, disabled: !httpsEnabled || values.port < 0,
                helperText: t("Not applied to localhost. Doesn't work with proxies.")
            },

            {
                k: 'listen_interface',
                comp: SelectField,
                sm: 4,
                afterList: listenInterfaceOptions.some(x => x.disabled)
                    && h(Box, { sx: { p: '8px 16px 0', borderTop: '1px solid', fontSize: 'small' } }, t("Disabled addresses depend on the address you used to connect")),
                options: listenInterfaceOptions,
            },
            { k: 'max_kbps',        ...maxSpeedDefaults, sm: 4, label: t('limitOutput'), helperText: t("Doesn't apply to localhost") },
            { k: 'max_kbps_per_ip', ...maxSpeedDefaults, sm: 4, label: t('limitOutputPerIp') },

            { k : CFG.max_downloads, ...maxDownloadsDefaults, helperText: t('numberOfSimultaneousDownloads') },
            { k : CFG.max_downloads_per_ip, ...maxDownloadsDefaults, label: t('maxDownloadsPerIp') },
            { k : CFG.max_downloads_per_account, ...maxDownloadsDefaults, label: t('maxDownloadsPerAccount'), helperText: t("Overrides other limits") },

            { k: 'admin_net', comp: NetmaskField, xs: 12, sm: 6, label: t("Admin-panel accessible from"), placeholder: t("any address"),
                helperText: t("IP address of browser machine")
            },
            { k: 'localhost_admin', comp: BoolField, xs: 12, sm: 6, label: t('Consider localhost access as Admin'),
                getError: x => !x && admins?.length===0 && t("First create at least one admin account"),
                helperText: t('Access admin-panel without entering credentials')
            },

            { k: 'proxies', comp: NumberField, xs: 12, sm: 4, md: 4, max: 9, label: t("Number of incoming HTTP proxies"), placeholder: t("none"),
                error: proxyWarning(values, status),
                helperText: t("Wrong number will prevent detection of users' IP")
            },
            { k: CFG.outbound_proxy, xs: 12, sm: 5, md: 4, placeholder: t("none"), helperText: t("URL form"),
                getError: x => try_(() => x && new URL(x) && '', () => t("Invalid URL")) },
            { k: 'allowed_referer', comp: AllowedReferer, sm: 3, md: 4, placeholder: t("any"), label: t("Links from other websites"),
                helperText: t("In case another website is linking your files") },

            { k: 'block', label: false, comp: ArrayField, xs: 12, prepend: true, sm: true, autoRowHeight: true,
                form: { sx: { maxWidth: '40em' } },
                fields: [
                    { k: 'ip', label: t("Blocked IP"), sm: 12, required: true, wrap: true, $width: 2, comp: NetmaskField,
                        $column: { mergeRender: { comment: {}, expire: {} } },
                        helperText: t("Be careful to not kick yourself out, by blocking also your IP"),
                    },
                    { k: 'expire', $type: 'dateTime', minDate: new Date(), sm: 6, $hideUnder: 'sm',
                        helperText: t("Leave empty for no expiration") },
                    {
                        k: 'disabled',
                        $type: 'boolean',
                        label: t("Enabled"),
                        helperText: t("In case you want to not block without deleting the rule"),
                        toField: (x: any) => !x,
                        fromField: (x: any) => x ? undefined : true,
                        sm: 6,
                        $width: 80,
                    },
                    { k: 'comment', $hideUnder: 'sm' },
                ],
            },

            h(Section, { title: t('frontEnd'), subtitle: t('frontEndOnlyOptions') }),
            { k: 'file_menu_on_link', comp: SelectField, label: t('accessFileMenu'), md: 4,
                options: { [t("by clicking on file name")]: true, [t("by dedicated button")]: false  }
            },
            { k: 'title', md: 8, helperText: t("You can see this in the tab of your browser") },

            { k: 'auto_play_seconds', comp: NumberField, xs: 6, sm: 3, min: 1, max: 10000, required: true,
                label: t('autoPlaySecondsDelay'), helperText: md(t("Default value for the [Show interface]({url})", { url: REPO_URL + 'discussions/270' })) },
            { k: 'tile_size', comp: NumberField, xs: 6, sm: 3, max: MAX_TILE_SIZE, required: true,
                label: t('defaultTilesSize'), helperText: wikiLink('Tiles', t("To enable tiles-mode")) },
            { k: 'theme', comp: SelectField, xs: 6, sm: 3, options: Object.fromEntries(_.map(THEME_OPTIONS, (value, label) => [t(label), value])) },
            { k: 'sort_by', comp: SelectField, xs: 6, sm: 3, options: Object.fromEntries(SORT_BY_OPTIONS.map(x => [t(x), x])) },

            { k: 'invert_order', comp: BoolField, xs: 6, md: 3 },
            { k: 'folders_first', comp: BoolField, xs: 6, md: 3 },
            { k: 'sort_numerics', comp: BoolField, xs: 6, md: 3, label: t('sortNumericNames') },
            { k: 'title_with_path', comp: BoolField, xs: 6, md: 3 },
            { k: 'favicon', comp: FileField, placeholder: t("None"), fileMask: '*.ico|' + IMAGE_FILEMASK, xs: 12, sm: 6,
                helperText: t("The icon associated to your website") },
            { k: CFG.show_uploader, comp: WhoField, xs: true },
            { k: 'page_size', comp: NumberField, xs: true, min: 1, required: true, helperText: t('entriesPerPage') },

            h(Section, { title: t('uploads') }),
            { k: 'dont_overwrite_uploading', comp: BoolField, md: 4, label: t("Uploads don't overwrite"),
                helperText: t("Files are automatically numbered (frontend only)") },
            { k : CFG.split_uploads, comp: NumberField, unit: 'MB', md: 2, step: .1,
                fromField: x => x * 1E6, toField: x => x ? x / 1E6 : null,
                placeholder: t("disabled"), label: t("Split uploads in chunks"), helperText: t("Overcome proxy limits (frontend only)") },
            { k: 'delete_unfinished_uploads_after', comp: NumberField, md: 3, min : 0, unit: t("seconds"), required: true },
            { k: 'min_available_mb', comp: NumberField, md: 3, min : 0, unit: "MBytes", placeholder: t("None"),
                label: t('minAvailableDiskSpace'), helperText: t("Reject uploads that don't comply") },

            h(Section, { title: t('others') }),
            { k: 'keep_session_alive', comp: BoolField, sm: 6, md: 6, helperText: t("Keeps you logged in while the page is left open and the computer is on") },
            { k: 'session_duration', comp: NumberField, sm: 3, md: 3, min: 5, unit: t("seconds"), required: true },
            { k: CFG.size_1024, label: t("KB size"), comp: SelectField, sm: 3, options: { 1000: false, 1024: true } },

            { k: 'show_hidden_files', comp: BoolField, sm: 3 },
            { k: CFG.comments_storage, comp: SelectField, xs: 12, sm: 6, md: 5, options: {
                [t("in file DESCRIPT.ION")]: '',
                [t("in file attributes")]: 'attr',
                [t("in file attributes + load DESCRIPT.ION")]: 'attr+ion',
            } },
            { k: 'descript_ion_encoding', xs: 8, sm: 3, md: 4, label: t('encodingOfFileDescription'), comp: SelectField, disabled: !values.descript_ion,
                options: ['utf8',720,775,819,850,852,862,869,874,808, ..._.range(1250,1257),10029,20866,21866] },

            { k: 'open_browser_at_start', comp: BoolField, label: t('openAdminPanelAtStart'), xs: 12, sm: 6, md: 3,
                helperText: t("Browser is automatically launched with HFS")
            },
            { k: 'zip_calculate_size_for_seconds', comp: NumberField, xs: 12, sm: 6, md: 3, unit: t("seconds"), required: true,
                label: t('calculateZipSizeFor'), helperText: t("If time is not enough, the browser will not show download percentage") },
            { k: 'mime', comp: ArrayField, label: false, reorder: true, prepend: true, xs: 12, sm: 12, md: 6,
                fields: [
                    { k: 'v', label: t("Mime type"), placeholder: t('auto'), $width: 2, helperText: t("Leave empty to get automatic value") },
                    { k: 'k', label: t("File mask"), helperText: h(WildcardsSupported), $width: 1, $column: {
                            renderCell: ({ value, id }: any) => h('code', {},
                                value,
                                value === '*' && id < _.size(values.mime) - 1
                                && iconTooltip(Warning, md(t("Mime with `*` should be the last, because first matching row applies")), {
                                    color: 'warning.main', ml: 1
                                }))
                        } },
                ],
                toField: x => Object.entries(x || {}).map(([k,v]) => ({ k, v })),
                fromField: x => Object.fromEntries(x.map((row: any) => [row.k, row.v || t('auto')])),
            },

            { k: CFG.force_webdav_login, comp: WebdavAgentAuthField, sm: true, label: t('webdavForceLogin'),
                fallbackRE: 'Microsoft-WebDAV', // ms-webdav won't send credentials even with the initial_auth – it must be forced, so we offer it as preset regex if you don't like the *always* value
                helperText: [t('Force login for clients that mishandle mixed anonymous/protected access. '), wikiLink('webdav', t('Why?')) ],
            },
            values[CFG.force_webdav_login] !== true && { k: CFG.webdav_initial_auth, comp: WebdavAgentAuthField, sm: 6, label: t('webdavInitialAuth'),
                helperText: t("Force login only once. Used only when previous option does not match"),
            },

            { k: 'server_code', comp: TextEditorField, lang: 'js', xs: 12,
                helperText: md(t("This code works similarly to [a plugin]({url}) (with some limitations)", { url: REPO_URL + 'blob/main/dev-plugins.md' }))
            },

        ]
    })

    async function save() {
        if (_.isEmpty(changes))
            return toast(t("Nothing to save"))
        const loc = window.location
        const keys = ['port','https_port']
        if (keys.every(k => changes[k] !== undefined))
            return alertDialog(t("You cannot change both http and https port at once. Please, do one, save, and then do the other."), 'warning')
        const working = [status?.http?.listening, status?.https?.listening]
        const onHttps = location.protocol === 'https:'
        if (onHttps) {
            keys.reverse()
            working.reverse()
        }
        const newPort = changes[keys[0]]
        const otherPort = values[keys[1]]
        const otherIsReliable = otherPort > 0 && working[1]
        const otherProtocol = onHttps ? 'http' : 'https'
        if (newPort < 0 && !otherIsReliable)
            return alertDialog(t("You cannot switch off this port unless you have a working fixed port for {protocol}", { protocol: otherProtocol }), 'warning')
        if (newPort === 0 && !otherIsReliable)
            return alertDialog(t("You cannot randomize this port unless you have a working fixed port for {protocol}", { protocol: otherProtocol }), 'warning')
        const goingNewPort = newPort > 0 && newPort != loc.port // == loc.port can happen when listening on a temporary port, and the user just set the same port as new config
        if (goingNewPort && !await confirmDialog(t("You are changing the port and you may be disconnected")))
            return
        const certChange = 'cert' in changes || 'private_key' in changes
        if (onHttps && certChange && !await confirmDialog(t("You may disrupt https service, kicking you out")))
            return
        await apiCall('set_config', { values: changes })
        if ('split_uploads' in changes)
            await alertDialog(t("Users need to reload for the \"split uploads\" option to take effect"), 'warning')
        const ip = ipForUrl(loc.hostname)
        const path = loc.pathname + loc.hash
        const redirect = newPort <= 0 ? `${onHttps ? 'http:' : 'https:'}//${ip}:${otherPort}${path}` // jump protocol also in case of random port, because people must know their port while using GUI
            : goingNewPort ? `${loc.protocol}//${ip}:${newPort || values[keys[0]]}${path}`
                : await with_(`https://${ip}:${loc.port}${path}`, httpsUrl => // could we be kicked out because of force_https?
                    !onHttps && (changes.force_https ?? data.force_https) && fetch(httpsUrl).then(() => httpsUrl, () => 0)) // only happens if https is working
        if (redirect) {
            await alertDialog(t("You are being redirected but in some cases this may fail. Hold on tight!"), 'warning')
            return window.location.href = redirect
        }
        const portChange = 'port' in changes || 'https_port' in changes
        setTimeout(reloadStatus, portChange || certChange ? 1000 : 0) // give some time to apply news
        Object.assign(loaded!, changes) // since changes are recalculated subscribing state.config, but it depends on 'loaded' to (which cannot be subscribed), be sure to update loaded first
        recalculateChanges()
        execDoneMessage(false, saveBtnRef.current)
    }
}

function Section({ title, subtitle }: { title: string, subtitle?: string }) {
    return h(Divider, { role: 'heading', sx: { fontSize: 'larger', fontWeight: 'bold' } }, title,
        h(Box, { sx: { fontSize: 'small', fontWeight: 'normal' } }, subtitle))
}

function recalculateChanges() {
    const o: Dict = {}
    if (state.config)
        for (const [k, v] of Object.entries(state.config))
            if (JSON.stringify(v) !== JSON.stringify(loaded?.[k]))
                o[k] = v
    pageState.changes = o
}

export function isCertError(error: any) {
    return /certificate/.test(error)
}

export function isKeyError(error: any) {
    return /private key/.test(error)
}

function PortField({ label, value, onChange, setApi, status, suggestedPort=1, error, helperText }: FieldProps<number | null>) {
    const lastCustom = useRef(suggestedPort)
    if (value! > 0)
        lastCustom.current = value!
    const selectValue = Number(value! > 0 ? lastCustom.current : value) || 0
    let errMsg = status?.error
    if (errMsg)
        if (isCertError(errMsg) || isKeyError(errMsg))
            errMsg = undefined // never mind, we'll show this error elsewhere
        else
            error = true
    return h(Box, {},
        h(Box, { sx: { display: 'flex' } },
            h(SelectField as Field<number>, {
                sx: { flexGrow: 1 },
                label,
                error,
                value: selectValue,
                options: [
                    { label: t('off'), value: -1 },
                    { label: t('random'), value: 0 },
                    { label: t('choose'), value: lastCustom.current },
                ],
                onChange,
            }),
            value! > 0 && h(NumberField, {
                label: t("Number"),
                fullWidth: false,
                value,
                onChange,
                setApi,
                error,
                min: 1,
                max: 65535,
                helperText,
                sx: { minWidth: '5.5em' }
            }),
        ),
        status && h(FormHelperText, { error },
            status === true ? '...'
                : errMsg ?? (status?.listening && t('Correctly working on port {port}', { port: status.port }) )
        ),
    )
}

function AllowedReferer({ label, value, onChange, error }: FieldProps<string>) {
    const yesNo = !value || value==='-'
    const example = 'example.com'
    return h(Box, { sx: { display: 'flex' } },
        h(SelectField as Field<string>, {
            label,
            value: yesNo ? value : example,
            options: { [t("allow all")]: '', [t("forbid all")]: '-', [t("allow some")]: example, },
            onChange,
            error,
            sx: yesNo ? undefined : { maxWidth: '11em' },
        }),
        !yesNo && h(StringField, {
            label: t("Domain to allow"),
            value,
            placeholder: 'example.com',
            onChange,
            error,
            helperText: h(WildcardsSupported)
        })
    )
}

function WebdavAgentAuthField({ label, value, onChange, error, helperText, fallbackRE='.*' }: FieldProps<boolean | string>) {
    const [lastRegex, setLastRegex] = useState('')
    const isRE = typeof value === 'string'
    useEffect(() => setLastRegex(isRE ? value : fallbackRE), [value])
    const helperId = useId()
    return h(Box, {},
        h(Box, { sx: { display: 'flex' } },
            h(SelectField as Field<boolean | string>, {
                label, value, onChange, error,
                'aria-describedby': helperId,
                options: { [t("Off")]: false, [t("Always")]: true, [t("RegEx")]: lastRegex },
                sx: isRE ? { maxWidth: '9em' } : undefined,
            }),
            isRE && h(StringField, { label: t("User-Agent regex"), value, onChange, error }),
        ),
        h(FormHelperText, { id: helperId }, helperText),
    )
}

export async function suggestMakingCert() {
    return new Promise(resolve => {
        const { close } = newDialog({
            icon: CardMembership,
            title: t("Get a certificate"),
            onClose: resolve,
            Content: () => h(Box, { sx: { p: 1, lineHeight: 1.5 } },
                h(Box, {}, t("HTTPS needs a certificate to work.")),
                h(Box, {}, t("We suggest you to "), h(InLink, { to: '/internet' }, t("get a free but proper certificate")), '.'),
                h(Box, {}, t("If you don't have a domain "), h(LinkBtn, { onClick: makeCertAndSave }, t("make a self-signed certificate")),
                    " but that ", wikiLink('HTTPS#certificate', t(" won't be perfect")), '.' ),
            )
        })

        async function makeCertAndSave() {
            if (!window.crypto.subtle)
                return alertDialog(t("Retry this procedure on localhost"), 'warning')
            const saved = await apiCall('make_self_signed_cert', { fileName: 'self' })
            if (loaded) // when undefined we are not in this page
                Object.assign(loaded, saved)
            setTimeout(exposedReloadStatus!, 1000) // give some time for backend to apply
            setTimeout(exposedReloadStatus!, 2000) // try again in case it's very slow
            Object.assign(state.config, saved)
            await alertDialog(t("Certificate saved"), 'success')
            close()
        }
    })
}
