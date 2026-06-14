import { createElement as h, ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import {
    Alert, Box, Button, Card, CardContent, CircularProgress, Divider, LinearProgress, Link, Typography, Skeleton,
} from '@mui/material'
import { CardMembership, Check, Dns, HomeWorkTwoTone, Lock, Public, PublicTwoTone, RouterTwoTone, Send, Storage,
    Error as ErrorIcon, SvgIconComponent, Search } from '@mui/icons-material'
import { apiCall, useApiEvents, useApiEx } from './api'
import {
    closeDialog, DAY, formatTimestamp, wait, wantArray, with_, PORT_DISABLED, isIP, CFG, md,
    useRequestRender, replace, restartAnimation, prefix, isIpLan, HIDE_IN_TESTS
} from './misc'
import { Flex, LinkBtn, Btn, Country, wikiLink } from './mui'
import { alertDialog, confirmDialog, formDialog, promptDialog, toast, waitDialog } from './dialog'
import { BoolField, Form, MultiSelectField, NumberField, SelectField } from '@hfs/mui-grid-form'
import { suggestMakingCert } from './OptionsPage'
import { changeBaseUrl } from './FileForm'
import { adminApis } from '../../src/adminApis'
import { ALL, WITH_IP } from './countries'
import _ from 'lodash'
import { SvgIconProps } from '@mui/material/SvgIcon/SvgIcon'
import { ConfigForm } from './ConfigForm'
import { DynamicDnsResult } from '../../src/ddns'
import { ArrayField } from './ArrayField'
import VfsPathField from './VfsPathField'
import { PageProps } from './App'
import { t, useAdminLanguage } from './adminI18n'

const COUNTRIES = ALL.filter(x => WITH_IP.includes(x.code))

const PORT_FORWARD_URL = 'https://portforward.com/'
const HIGHER_PORT = 1080
function msgIsp() {
    return h('div', {}, t("HFS will probably not be reachable on the Internet. "), wikiLink('Work-on-the-internet#double-nat', t("Read more")))
}

export default function InternetPage({setTitleSide }: PageProps) {
    const { language } = useAdminLanguage()
    const [checkResult, setCheckResult] = useState<boolean | undefined>()
    const [checking, setChecking] = useState(false)
    const [mapping, setMapping] = useState(false)
    const status = useApiEx('get_status')
    const config = useApiEx('get_config', { only: [CFG.base_url] })
    const baseUrl = config.data?.[CFG.base_url]
    const localColor = with_([status.data?.http?.error, status.data?.https?.error], ([h, s]) =>
        h && s ? 'error' : h || s ? 'warning' : 'success')
    const nat = useApiEx<typeof adminApis.get_nat>('get_nat', {}, { timeout: 20 })
    const { data: publicIps } = useApiEx<typeof adminApis.get_public_ips>('get_public_ips', { timeout: 20 })
    const { data } = nat
    const port = data?.internalPort
    const wrongMap = data?.mapped && data.mapped.private.port !== port && data.mapped.private.port
    const doubleNat = data?.externalIp && publicIps && !publicIps.includes(data.externalIp)
    const verifyAgain = useRequestRender()
    useEffect(() => {
        if (verifyAgain.state) // skip first
            void verify(true)
    }, [verifyAgain.state])
    setTitleSide(useMemo(() =>
        h(Alert, { severity: 'info', sx: { display: { xs: 'none', sm: 'inherit' }  } }, t("This page makes sure your site is working correctly on the Internet")),
        [language]))
    return h(Flex, { vert: true, gap: '2em' },
        h(Box, { sx: { maxWidth: '40em' } }, networkBox()),
        h(Flex, { gap: '2em', flexWrap: 'wrap', maxWidth: '84em', '&>*': { maxWidth: '40em', width: { md: '40em' } }, alignItems: 'flex-start', justifyContent: 'space-between' },
            baseUrlBox(),
            httpsBox(),
            geoBox(),
            ddnsBox(),
    ))

    function stripTags(html: string) {
        return html.replace(/.+<body>(.+)<\/body>.+/is, (all,x) => x || all) // extract body, if any
            .replace(/<[^>]+>/g, ' ')
    }

    function ddnsBox() {
        const { data } = useApiEvents<DynamicDnsResult>('get_dynamic_dns_error')
        const ref = useRef<any>()
        useEffect(() => ref.current && restartAnimation(ref.current, '1s blink'), [data]);
        return h(TitleCard, { icon: Dns, title: t("Dynamic DNS updater") },
            data && h(Flex, {},
                data.error ? h(ErrorIcon, { color: 'error', ref }) : h(Check, { color: 'success', ref }),
                formatTimestamp(data.ts), ' – ',
                prefix(t("Error: "), stripTags(data.error)).slice(0, 500) || t("Updated successfully"),
            ),
            t("This tool can keep your domain updated with your latest IP address. Not every service is compatible, and most of them have their own software for the job, which is superior, but we offer this lightweight solution if you prefer it."),
            h(ConfigForm<{
                [CFG.dynamic_dns_url]: string,
            }>, {
                form: (v, { setValues }) => ({
                    fields: [
                        h(Flex, {},
                            _.map({
                                NoIP: {
                                    url: 'https://$username:$password@dynupdate.no-ip.com/nic/update?hostname=$domain',
                                    fields: ['username', 'password', 'domain'],
                                },
                                DuckDNS: {
                                    url: 'https://www.duckdns.org/update/$domain/$token>OK',
                                    fields: [{ k: 'domain', helperText: t("do NOT include the .duckdns.org part") }, 'token'],
                                }
                            }, ({ url, fields }, label) =>
                                h(Btn, {
                                    key: url,
                                    onClick: () => formDialog({
                                        title: t("{label} wizard", { label }),
                                        form: {
                                            sx: { maxWidth: '20em' },
                                            before: h(Box, { sx: { mb: 1 } }, t("The following information is stored unencrypted")),
                                            fields: fields.map(k => _.isString(k) ? { k } : k)
                                        }
                                    }).then(symbols => symbols && setValues({ [CFG.dynamic_dns_url]: replace(url, symbols as any, '$') }))
                                }, t("{label} wizard", { label }))
                            )
                        ),
                        { k: CFG.dynamic_dns_url, label: t("Updater URL"), multiline: true,
                            helperText: t("Refer to your DNS service provider to know what URL can automatically keep your domain updated. Supported symbols are $IP4, $IP6, $IPX. Optionally, you can append “>” followed by a regular expression to determine a successful answer, otherwise status code will be used.")
                        },
                    ]
                })
            })
        )
    }

    function geoBox() {
        const countryOptions = useMemo(() => COUNTRIES.map(x => ({ value: x.code, label: x.name })), [COUNTRIES])
        return h(TitleCard, { title: t('Geo IP'), icon: Public },
            h(ConfigForm<{
                [CFG.geo_enable]: boolean
                [CFG.geo_allow]: null | boolean
                [CFG.geo_list]: string[]
                [CFG.geo_allow_unknown]: boolean
            }>, {
                keys: [ CFG.geo_enable, CFG.geo_allow, CFG.geo_list, CFG.geo_allow_unknown ],
                form: values => ({ fields: [
                    { k: CFG.geo_enable, comp: BoolField, label: t("Enable"), helperText: md(t("Necessary database will be downloaded every month (2MB). Service is made possible thanks to [IP2Location](https://www.ip2location.com).")) },
                    ...!values?.[CFG.geo_enable] ? [] : [
                        {
                            k: CFG.geo_allow,
                            comp: SelectField,
                            label: t("Rule"),
                            options: { [t("no restriction")]: null, [t("block selected countries")]: false, [t("allow selected countries")]: true },
                        },
                        values[CFG.geo_allow] != null && {
                            k: CFG.geo_list,
                            comp: MultiSelectField<string>,
                            label: t("Selected countries ({n})", { n: values[CFG.geo_list]?.length || 0 }),
                            valueSeparator: false,
                            placeholder: t("none"),
                            options: countryOptions,
                            renderOption: (v: any) => h(Country, { code: v.value, long: true }),
                            clearable: true,
                            getError: (v: any) => values[CFG.geo_allow] && !v?.length && t("Cannot be empty"),
                        },
                        values[CFG.geo_allow] != null && {
                            k: CFG.geo_allow_unknown,
                            comp: SelectField,
                            label: t("When country cannot be determined"),
                            helperText: t("Local IPs are ignored"),
                            options: { Allow: true, Block: false },
                        },
                    ]
                ] }),
                addToBar: [
                    h(Box, { sx: { flex: 1 } }),
                    h(Btn, { icon: Search, onClick: lookup }, t("Lookup IP"))
                ],
            })
        )
    }

    async function lookup() {
        const ip = await promptDialog(t("Lookup IP"))
        if (!ip) return
        const { country } = await apiCall('geo_ip', { ip })
        if (!country)
            return alertDialog(t("IP not found"), 'error')
        return alertDialog(h(Country, { code: country, long: true }), 'success')
    }

    function httpsBox() {
        const [values, setValues] = useState<any>()
        const cert = useApiEx('get_cert')
        useEffect(() => { apiCall('get_config', { only: ['acme_domain', 'acme_renew'] }).then(setValues) } , [])
        const [saving, setSaving] = useState(false)
        if (!values) return h(CircularProgress)
        const { https } = status.data ||{}
        const disabled = https?.port === PORT_DISABLED
        const error = https?.error
        return status.element || h(TitleCard, { title: t('HTTPS'), icon: Lock, color: https?.listening && !error ? 'success' : 'warning' },
            error ? h(Alert, { severity: 'warning' }, error) :
                (disabled && h(LinkBtn, { onClick: notEnabled }, t("Not enabled"))),
            cert.element || with_(cert.data, c => c.none ? h(LinkBtn, { onClick: noCertClick }, t("No certificate configured")) : h(Box, {},
                h(CardMembership, { fontSize: 'small', sx: { mr: 1, verticalAlign: 'middle' } }), t("Current certificate"),
                h('ul', {},
                    h('li', {}, t("Domain: "), c.altNames?.join(' + ') ||'-'),
                    h('li', {}, t("Issuer: "), c.issuer?.O || h('i', {}, t('self-signed'))),
                    h('li', {}, t("Validity: "), ['validFrom', 'validTo'].map(k => formatTimestamp(c[k])).join(' – ')),
                )
            )),
            h(Divider),
            h(Form, {
                sx: { gap: 1 },
                gridProps: {rowSpacing:1},
                values,
                set(v, k) {
                    setValues((was: any) => {
                        const values = { ...was, [k]: v }
                        setSaving(true)
                        apiCall('set_config', { values }).finally(() => setSaving(false))
                        return values
                    })
                },
                fields: [
                    md(t("Generate certificate using [Let's Encrypt](https://letsencrypt.org)")),
                    {
                        k: 'acme_domain',
                        label: t("Domain for certificate"),
                        sm: values.acme_domain?.length > 30 ? 12 : 6,
                        required: true,
                        multiline: true,
                        fromField: x => x.replaceAll('\n', ','),
                        toField: x => x.replaceAll(',', '\n'),
                        helperText: md(t("Example: your.domain.com\\nMultiple domains on separate lines"))
                    },
                    {
                        k: 'acme_renew',
                        label: t("Automatic renew one month before expiration"),
                        comp: BoolField,
                        disabled: !values.acme_domain
                    },
                    with_(status.data.acmeRenewError, x => x && h(Alert, { severity: 'error' }, x)),
                ],
                save: {
                    children: t("Request"),
                    startIcon: h(Send),
                    ...saving && { loading: true },
                    async onClick() {
                        const [domain, ...altNames] = values.acme_domain.split(',')
                        const fresh = domain === cert.data.subject?.CN && Number(new Date(cert.data.validTo)) - Date.now() >= 30 * DAY
                        if (fresh && !await confirmDialog(t("Your certificate is still good"), { trueText: t("Make a new one anyway") }))
                            return
                        if (!await confirmDialog(t("HFS must temporarily serve HTTP on public port 80, and your router must be configured or this operation will fail"))) return
                        if (await stopOnCheckDomain(domain)) return
                        await apiCall('make_cert', { domain, altNames }, { timeout: 20_000 })
                            .then(async () => {
                                await alertDialog(t("Certificate created"), 'success')
                                if (disabled)
                                    await notEnabled()
                                cert.reload()
                            }, alertDialog)
                            .finally(status.reload)
                    }
                },
            })
        )

        async function noCertClick() {
            await suggestMakingCert()
            cert.reload()
            status.reload()
        }
    }

    async function notEnabled() {
        if (!await confirmDialog(t("HTTPS is currently disabled.\nFull configuration is available in the Options page."), { trueText: t("Enable it")})) return
        const stop = waitDialog()
        try {
            await apiCall('set_config', { values: { https_port: 443 } })
            await wait(1000)
            status.reload()
        }
        finally { stop() }
    }

    function baseUrlBox() {
        return config.element || h(TitleCard, { icon: Public, title: t("Address") },
            h(Flex, { flexWrap: 'wrap' },
                t("Main address: "),
                baseUrl ? h('tt', {}, baseUrl) : t("automatic, not configured"),
                h(Btn, {
                    size: 'small',
                    variant: 'outlined',
                    'aria-label': t("Change address"),
                    onClick: () => void changeBaseUrl().then(config.reload)
                }, t("Change")),
            ),
            h(Divider),
            h(ConfigForm<{ roots: any, force_address: boolean }>, {
                saveOnChange: true,
                onSave() {
                    status.reload() // this config is affecting status data
                },
                form: {
                    fields: [
                        {
                            k: CFG.roots,
                            label: t("Domain roots"),
                            helperText: t("You can decide different home-folders (in the VFS) for different domains, a bit like virtual hosts. If none is matched, the default home will be used."),
                            comp: ArrayField,
                            fields: [
                                { k: 'host', label: t("Domain/Host"), helperText: t("Wildcards supported: *.domain.com|other.com"),
                                    getError: (v?: string) => v?.includes('/') && t("No URLs or paths here!") },
                                { k: 'root', label: t("Home/Root"), comp: VfsPathField, files: false, placeholder: t("default"), helperText: t("Root path in VFS"),
                                    $column: { renderCell({ value }: any) { return value || h('i', {}, t("default")) } } },
                            ],
                            toField: x => Object.entries(x || {}).map(([host,root]) => ({ host, root })),
                            fromField: x => Object.fromEntries(x.map((row: any) => [row.host, row.root || ''])),
                        },
                        {
                            k: CFG.force_address,
                            label: t("Accept requests only using domains above (and localhost)"),
                            comp: BoolField,
                        }
                    ]
                },
            })
        )
    }

    function networkBox() {
        if (nat.error) return nat.element
        const direct = publicIps?.includes(data?.localIp!)
        return h(Flex, { justifyContent: 'space-around' },
            h(Device, { name: t("Server"), icon: direct ? Storage : HomeWorkTwoTone, color: localColor, ip: data?.localIp,
                below: port && h(Box, { className: 'port ' + HIDE_IN_TESTS }, t("port {port}", { port })),
            }),
            !direct && h(DataLine),
            !direct && h(Device, {
                name: t("Router"), icon: RouterTwoTone, ip: data?.gatewayIp,
                color: checkResult ? 'success' : data?.mapped && (wrongMap ? 'warning' : 'success'),
                below: mapping ? h(LinearProgress, { sx: { height: '1em' } })
                    : data && (
                        checkResult && !data.mapped ? t("port {port}", { port: data.externalPort || data.internalPort || '' })
                            : h(LinkBtn, { sx: { display: 'block' }, onClick: configure },
                                t("port {port}", { port: wrongMap ? t("is wrong") : data?.externalPort || (checkResult ? t("verified") : t("unknown")) }))
                    ),
            }),
            h(DataLine),
            h(Device, { name: t("Internet"), icon: PublicTwoTone, ip: publicIps,
                color: checkResult ? 'success' : checkResult === false ? 'error' : doubleNat ? 'warning' : undefined,
                below: checking ? h(LinearProgress, { sx: { height: '1em' } }) : publicIps && h(Box, { className: HIDE_IN_TESTS },
                    doubleNat && h(LinkBtn, { sx: { display: 'block' }, onClick: () => alertDialog(msgIsp(), 'warning') }, t("Double NAT")),
                    checkResult ? t("Working!") : checkResult === false ? t("Failed!") : '',
                    ' ',
                    (baseUrl > '' || publicIps?.length > 0) && data?.internalPort && h(LinkBtn, { onClick: () => verify() }, t("Verify"))
                        || ' ' // steadier layout, mainly for testing
                )
            }),
        )
    }

    async function stopOnCheckDomain(domain: string) {
        return domain && false === await apiCall('check_domain', { domain }).catch(e =>
            confirmDialog(String(e), { trueText: t("Continue anyway"), falseText: t("Stop") }))
    }

    async function verify(again=false): Promise<any> {
        await nat.loading
        const data = nat.getData() // fresh data
        if (!data) return
        setCheckResult(undefined)
        if (!again && !await confirmDialog(t("This test will check if your server is working properly on the Internet"))) return
        setChecking(true)
        try {
            const hostname = baseUrl && new URL(baseUrl).hostname
            const checkUrl = !isIpLan(hostname) && baseUrl
            if (!isIP(hostname) && await stopOnCheckDomain(hostname)) return
            const urlResult = checkUrl && await apiCall('self_check', { url: checkUrl }).catch(e =>
                alertDialog(!e.code ? e : t("Sorry, this function is not available at the moment. Retry later."), 'error'))
            if (checkUrl && !urlResult)
                return
            if (urlResult?.success) {
                setCheckResult(true)
                return alertDialog(h(Box, {}, t("Your server is responding correctly over the Internet:"),
                    h('ul', {}, h('li', {}, urlResult.url))), 'success')
            }
            if (urlResult?.success === false)
                await alertDialog(md(t("Your configured address {url} doesn't seem to work\\nstill, we are going to test your IP address", { url: checkUrl }) + ' 🤞'), 'warning')
            const res = await apiCall('self_check', {})
            if (res.some((x: any) => x.success)) {
                setCheckResult(true)
                const mild = urlResult.success === false && md(t("Your server is responding over the Internet\\nbut not with configured address {url}\\njust on your IP:", { url: checkUrl }))
                return alertDialog(h(Box, {}, mild || t("Your server is responding correctly over the Internet:"),
                    h('ul', {}, ...res.map((x: any) => h('li', {}, x.url)))), mild ? 'warning' : 'success')
            }
            setCheckResult(false)
            if (wrongMap)
                return fixPort().then(verifyAgain)
            if (doubleNat)
                return alertDialog(msgIsp(), 'warning')
            const msg = t("We couldn't reach your server from the Internet. ")
            if (data.upnp && !data!.mapped)
                return confirmDialog(msg + t("Try port-forwarding on your router"), { trueText: t("Fix it") }).then(async go => {
                    if (!go) return
                    try { await mapPort(data!.internalPort!, '', '') }
                    catch { await mapPort(HIGHER_PORT, '') }
                    toast(t("Port forwarded, now we verify again"), 'success')
                    verifyAgain()
                })
            const cfg = await apiCall('get_config', { only: [CFG.geo_enable, CFG.geo_allow] })
            const { close } = alertDialog(h(Box, {}, msg + t("Possible causes:"), h('ul', {},
                cfg[CFG.geo_enable] && cfg[CFG.geo_allow] != null && h('li', {}, t("You may be blocking a country from where the test is performed")),
                !data.upnp && h('li', {}, t("Your router may need to be configured. "), h(Link, { href: PORT_FORWARD_URL, target: 'help' }, t("How?"))),
                h('li', {}, t("There could be a firewall, try configuring or disabling it.")),
                (data.externalPort || data.internalPort!) <= 1024 && h('li', {},
                    t("Your Internet Provider may be blocking ports under 1024. "),
                    data.upnp && h(Button, {
                        size: 'small',
                        onClick() {
                            close()
                            mapPort(HIGHER_PORT).then(verifyAgain)
                        }
                    }, t("Try {port}", { port: HIGHER_PORT })),
                ),
                data.mapped && h('li', {}, t("A bug in your modem/router, try rebooting it.")),
                h('li', {}, msgIsp()),
            )), 'warning')
        }
        catch(e: any) {
            alertDialog(e)
        }
        finally {
            setChecking(false)
        }
    }

    async function configure() {
        if (!data) return // shut up ts
        if (wrongMap)
            return await confirmDialog(t("There is a port-forwarding but it is pointing to the wrong port ({port})", { port: wrongMap }), { trueText: t("Fix it") })
                && fixPort()
        if (!data.upnp)
            return alertDialog(h(Box, { sx: { lineHeight: 1.5 } }, md(t("We cannot help you configuring your router because UPnP is not available.\\nFind more help [on this website]({url}).", { url: PORT_FORWARD_URL }))), 'info')
        const p = data.internalPort!
        const msg = t("For HFS to work over the Internet, you need a port on your modem/router forwarded to this computer's port {port}.", { port: p }) + '\n\n'
            + (data.mapped ? '' : t("You may want to check if that's already the case before trying the following.") + '\n\n')
            + t("This will ask the router to forward a port.\nYou can use the same number as the local network port ({port}), or a different one.", { port: p })
        const res = await promptDialog(md(msg), {
            value: data.externalPort || port,
            field: { label: t("Port seen from the Internet"), comp: NumberField },
            addToBar: data.mapped && [h(Button, { color: 'warning', onClick: remove }, t("Remove"))],
            dialogProps: { sx: { maxWidth: '20em' } },
        })
        if (res)
            await mapPort(Number(res), t("Port forwarded")).catch(() => {})

        function remove() {
            closeDialog()
            mapPort(0, t("Port removed"))
        }
    }

    function fixPort() {
        if (!data?.externalPort) return alertDialog(t("externalPort not found"), 'error')
        return mapPort(data.externalPort, t("Forwarding corrected"))
    }

    async function mapPort(external: number, msg='', errMsg=t("Operation failed")) {
        setMapping(true)
        try {
            await apiCall('map_port', { external })
            nat.reload()
            if (msg) toast(msg, 'success')
            setCheckResult(undefined) // things have changed, invalidate check result
        }
        catch(e: any) {
            if (errMsg) {
                const low = (external || data!.internalPort!) < 1024
                const msg = errMsg + prefix(': ', e?.message) + (low ? t(". Some routers refuse to work with ports under 1024.") : '')
                await alertDialog(msg, 'error')
            }
            throw e
        }
        finally {
            setMapping(false)
        }
    }
}

function DataLine() {
    return h(Box, { sx: { flex: 1 }, className: 'animated-dashed-line' })
}

function Device({ name, icon, color, ip, below }: any) {
    const fontSize = 'min(20vw, 10vh)'
    return h(Box, { sx: { display: 'inline-block', textAlign: 'center' } },
        h(icon, { color, sx: { fontSize, mb: '-0.1em' } }),
        h(Box, { sx: { fontSize: 'larger' } }, name),
        ip === undefined ? h(Skeleton) : h(Box, { sx: { fontSize: 'smaller', whiteSpace: 'pre-wrap' }, className: 'ip ' + HIDE_IN_TESTS }, wantArray(ip).join('\n') || t("unknown")),
        below ? h(Box, { sx: { fontSize: 'smaller' } }, below) : h(Skeleton),
    )
}

function TitleCard({ title, icon, color, children }: { title: ReactNode, icon?: SvgIconComponent, color?: SvgIconProps['color'], children?: ReactNode }) {
    return h(Card, {}, h(CardContent, {}, h(Flex, { vert: true },
        h(Typography, { variant: 'h3', sx: { fontSize: 'x-large' } }, icon && h(icon, { color, sx: { mr: 1, mb: '2px' } }), title),
        children
    )))
}
