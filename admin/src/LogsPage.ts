// This file is part of HFS - Copyright 2021-2023, Massimo Melina <a@rejetto.com> - License https://www.gnu.org/licenses/gpl-3.0.txt

import { createElement as h, Fragment, ReactNode, useEffect, useMemo, useState } from 'react'
import httpCodes from './httpCodes'
import { Box, Tab, Tabs } from '@mui/material'
import { PageProps } from './App'
import { API_URL, apiCall, useApi, useApiEx, useApiList } from './api'
import { DataTable, DataTableColumn, DataTableProps } from './DataTable'
import {
    CFG, Dict, formatBytes, HTTP_UNAUTHORIZED, newDialog, prefix, shortenAgent, splitAt, tryJson, md, typedKeys, with_,
    _dbg, mapFilter, safeDecodeURIComponent, stringAfter, onlyTruthy, formatTimestamp, formatSpeed, copyTextToClipboard
} from '@hfs/shared'
import {
    NetmaskField, Flex, IconBtn, useBreakpoint, usePauseButton, useToggleButton, Country,
    hTooltip, Btn, wikiLink
} from './mui'
import _ from 'lodash'
import {
    AutoDelete, LinkOff, ClearAll, Delete, Download, Settings, SmartToy, Terminal, ContentCopy
} from '@mui/icons-material'
import { ConfigForm } from './ConfigForm'
import { BoolField, SelectField } from '@hfs/mui-grid-form'
import { toast, useDialogBarColors } from './dialog'
import { BlockIpBtn } from './blockIp'
import { ALL as COUNTRIES } from './countries'
import { useRoutedTab } from './routing'
import { t, useAdminLanguage } from './adminI18n'

const logLabels = {
    log: "Served",
    error_log: "Failed",
    console: "Console",
    disconnections: "Disconnections",
    ips: "IPs",
}
const LOG_FILES = typedKeys(logLabels)

let reloadIps: any

export default function LogsPage({setTitleSide }: PageProps) {
    useAdminLanguage()
    const files = LOG_FILES
    const [tab, setTab] = useRoutedTab('logs', files)
    const shorterLabels = !useBreakpoint('sm') && { error_log: t('Not'), console: h(Terminal), disconnections: h(LinkOff) }
    const file = files[tab]
    const fileAvailable = file.endsWith('log')

    const logInfo = useApiEx('get_log_info')
    setTitleSide(useMemo(() => fileAvailable && (logInfo.element || with_(logInfo.data, data =>
        h(Box, { sx: { fontSize: 'smaller' } },
            t("Current: {size}", { size: formatBytes(_.sum(Object.values(data.current))) }),
            h('br'),
            with_(Object.values(data.rotated).flat(), rotatedAsArray =>
                t("Archived: {size} / {n} files", {
                    size: formatBytes(_.sumBy(rotatedAsArray, 'size')),
                    n: rotatedAsArray.length,
                }))
        )
    )), [logInfo.element, logInfo.data, fileAvailable]))

    return h(Fragment, {},
        h(Flex, { gap: 0  },
            h(Tabs, { value: tab, onChange(ev,i){ setTab(i) } },
                files.map(f => h(Tab, {
                    label: _.get(shorterLabels, f) || t(logLabels[f]),
                    key: f,
                    sx: { minWidth: 0, px: { xs: 1.5, sm: 2 } } // save space
                }))),
            h(Box, { sx: { flex: 1 } }),
            h(IconBtn, {
                icon: Download,
                title: fileAvailable ? t("Download as file") : t("Not available"),
                link: API_URL + `get_log_file?file=${file}`,
                disabled: !fileAvailable
            }),
            h(IconBtn, { icon: Settings, title: t("Options"), onClick: showLogOptions })
        ),
        files.map(f =>
            h(LogFile, { hidden: file !== f, file: f, key: f, fillFlex: true }) ),
    )

    function showLogOptions() {
        newDialog({
            title: t("Log options"),
            dialogProps: { sx: { maxWidth: '40em' } },
            Content() {
                return h(ConfigForm, {
                    barSx: { gap: 2, width: '100%', ...useDialogBarColors() },
                    form: {
                        stickyBar: true,
                        fields: [
                            { k: CFG.log, label: t(logLabels.log), sm: 6, helperText: t("Requests are logged here. Empty to disable it.") },
                            { k: CFG.error_log, label: t(logLabels.error_log), sm: 6, placeholder: t("errors go to main log"),
                                helperText: t("Write errors in a different file. Empty to use same file.")
                            },
                            { k: CFG.log_rotation, comp: SelectField, sm: 6, options: [
                                { value: '', label: t("disabled") },
                                { value: 'daily', label: t('daily') },
                                { value: 'weekly', label: t('weekly') },
                                { value: 'monthly', label: t('monthly') },
                            ],
                                helperText: [wikiLink('Logs#rotation', t("To keep log-files smaller")), t(" (deletion is not automatic)")],
                            },
                            { k: CFG.dont_log_net, comp: NetmaskField, label: t("Don't log address"), sm: 6, placeholder: t("no exception") },
                            { k: CFG.log_gui, sm: 6, comp: BoolField, label: t("Log interface loading"), helperText: t("Some requests are necessary to load the interface") },
                            { k: CFG.log_api, sm: 6, comp: BoolField, label: t("Log API requests"), helperText: t("Requests for commands") },
                            { k: CFG.log_ua, sm: 6, comp: BoolField, label: t("Log User-Agent"), helperText: t("Contains browser and possibly OS information. Can double the size of your logs on disk.") },
                            { k: CFG.log_spam, sm: 6, comp: BoolField, label: t("Log spam requests"), helperText: md(t("Spam requests are *failed* requests that you probably don't want to see")) },
                            { k: CFG.track_ips, sm: 6, comp: BoolField, label: t("Keep track of IPs"),
                                parentProps: { sx: { display: 'flex', gap: 1 } },
                                after: h(Btn, {
                                    size: 'small', variant: 'outlined', color: 'warning',
                                    confirm: true, doneMessage: true,
                                    onClick: () => apiCall('reset_ips').then(reloadIps)
                                }, t("Reset"))
                            },
                        ]
                    }
                })
            }
        })
    }
}

const LOGS_ON_FILE: string[] = [CFG.log, CFG.error_log]

type LogFileProps = { filter?: (row:any) => boolean, limit?: number, hidden?: boolean, file: string, footerSide?: ReactNode } & Partial<DataTableProps>
export function LogFile({ file, footerSide, hidden, limit, filter, ...rest }: LogFileProps) {
    const [showCountry, setShowCountry] = useState(false)
    const [showAgent, setShowAgent] = useState(false)
    const { pause, pauseButton } = usePauseButton()
    const [showApi, showApiButton] = useToggleButton(t("Show APIs"), t("Hide APIs"), v => ({
        icon: SmartToy,
        sx: { rotate: v ? 0 : '180deg' },
        disabled: file === 'console',
    }), true)
    const [totalSize, setTotalSize] = useState(NaN)
    const [limited, setLimited] = useState(true)
    const [skipped, setSkipped] = useState(0)
    const MAX = 2**20 // 1MB
    const invert = true
    const [firstSight, setFirstSight] = useState(!hidden)
    useEffect(() => setFirstSight(x => x || !hidden), [hidden])
    const hasFile = LOGS_ON_FILE.includes(file)
    useApi(firstSight && hasFile && 'get_log_file', { file, range: limited || !skipped ? String(-MAX) : `0-${skipped}` }, {
        skipParse: true, skipLog: true,
        onResponse(res, body) {
            const lines = body.split('\n')
            if (limited) {
                const size = Number(splitAt('/', res.headers.get('Content-Range') ||'')?.[1])
                if (isNaN(size)) throw _dbg("shouldn't happen")
                setTotalSize(size)
                if (body.length >= size)
                    setLimited(false)
                else
                    setSkipped(size! - body.length + lines.shift().length + 1)
            }
            else if (skipped) {
                toast(t("Entire log loaded, {size}", { size: formatBytes(skipped) }))
                setSkipped(0)
            }
            const treated = mapFilter(lines, (x: any, i) => enhanceLogLine(parseLogLine(x, i)), Boolean, invert)
            setList(x => [...x, ...treated])
        }
    })
    const { list, setList, error, connecting, reload } = useApiList(firstSight && 'get_log', { file }, { limit, invert, pause, map: enhanceLogLine })
    const isIps = file === 'ips'
    if (isIps)
        reloadIps = reload
    const tsColumn: DataTableColumn = {
        field: 'ts',
        headerName: t("Timestamp"),
        type: 'dateTime',
        width: 96,
        valueGetter: v => new Date(v),
        renderCell: ({ value }) => h(Fragment, {}, value.toLocaleDateString(), h('br'), value.toLocaleTimeString()),
    }
    const ipColumn: DataTableColumn = {
        field: 'ip',
        headerName: t("Address"),
        flex: .6,
        minWidth: 130,
        maxWidth: 230,
        mergeRender: {
            user: { sx: { display: 'flex', justifyContent: 'space-between', gap: '.5em' } },
            country: showCountry && {},
            ua: {},
        },
    }
    const rows = useMemo(() =>
        filter ? list.filter(filter)
            : showApi || list?.[0]?.uri === undefined ? list
                : list.filter(x => !x.uri.startsWith(API_URL)),
        [list, showApi, filter])
    const isConsole = file === 'console'
    return hidden ? null : h(DataTable, {
        persist: 'log_' + file,
        error,
        loading: connecting,
        rows,
        compact: true,
        actionsProps: { hideUnder: 'md' },
        actions: isConsole ? undefined : (({ row }) => onlyTruthy([
            h(BlockIpBtn, { ip: row.ip, comment: t("From log") }),
            isIps && h(Btn, {
                icon: Delete,
                confirm: true,
                title: t("Delete {item}", { item: row.ip }),
                doneMessage: true,
                onClick: () => apiCall('delete_ips', { ip: row.ip }).then(() => setList(was => was.filter(x => x.ip !== row.ip)))
            }),
            isIps && h(Btn, {
                icon: AutoDelete,
                confirm: true,
                title: t("Delete all records up to {time}", { time: formatTimestamp(row.ts) }),
                onClick: () => apiCall('delete_ips', { ts: row.ts }).then(res => toast(t("{n} deleted", { n: res.n }))).then(reload)
            }),
            hasFile && h(Btn, {
                icon: ContentCopy,
                title: t("Copy request"),
                onClick() { copyTextToClipboard(JSON.stringify(_.omit(row, 'id'), undefined, 2)) }
            })
        ])),
        initialState: isIps ? { sorting: { sortModel: [{ field: 'ts', sort: 'desc' }] } } : undefined,
        ...rest,
        footerSide: width => h(Box, {}, // 4 icons don't fit the tab row on mobile
            pauseButton,
            showApiButton,
            !connecting && skipped > 0 && h(Btn, {
                icon: ClearAll,
                variant: 'outlined',
                sx: { ml: { sm: 1 } },
                labelIf: width > 700,
                title: t("Only {loaded} was loaded, for speed. Total size is {total}", { loaded: formatBytes(MAX), total: formatBytes(totalSize) }),
                loading: !limited,
                onClick: () => setLimited(false)
            }, t("Load whole log")),
            footerSide,
        ),
        columns: isConsole ? [
            tsColumn,
            {
                field: 'k',
                headerName: t("Level"),
                hideUnder: 'sm',
            },
            {
                field: 'msg',
                headerName: t("Message"),
                flex: 1,
                mergeRender: { k: { override: { valueFormatter: (value) => value !== 'log' && value } } }
            }
        ] : isIps || file === 'disconnections' ? [
            tsColumn,
            ipColumn,
            {
                headerName: t("Country"),
                field: 'country',
                flex: 1,
                hideUnder: !showCountry || 'md',
                valueGetter: (value) => _.find(COUNTRIES, { code: value })?.name || value,
                renderCell: ({ row }) => h(Country, { code: row.country, long: true, def: '-' }),
            },
            !isIps && {
                field: 'msg',
                headerName: t("Message"),
                flex: 4,
            }
        ] : [
            ipColumn,
            {
                headerName: t("Country"),
                field: 'country',
                valueGetter: (_value: any, row: any) => row.extra?.country,
                hideUnder: !showCountry || 'xl',
                renderCell: ({ value }) => h(Country, { code: value, def: '-' }),
            },
            {
                field: 'user',
                headerName: t("Username"),
                flex: .3,
                maxWidth: 200,
                hideUnder: 'xl',
            },
            tsColumn,
            {
                field: 'method',
                headerName: t("Method"),
                width: 80,
                hideUnder: 'xl',
            },
            {
                field: 'status',
                headerName: t("Code"),
                type: 'number',
                width: 70,
                hideUnder: 'xl',
                renderCell: ({ value }) => hTooltip(prefix(value + ' - ', httpCodes[value]) || t("Unknown"), undefined,
                    h(Box, { sx: { bgcolor: '#888a', color: '#fff', borderRadius: '.3em', p: '.05em .3em', lineHeight: '1.2em' } }, value))
            },
            {
                field: 'length',
                headerName: t("Size"),
                type: 'number',
                hideUnder: 'md',
                valueFormatter: (value) => formatBytes(value as number)
            },
            {
                headerName: t("Agent"),
                field: 'ua',
                width: 60,
                hideUnder: !showAgent || 'md',
                valueGetter: (_value: any, row: any) => row.extra?.ua,
                renderCell: ({ value }) => agentIcons(value),
            },
            {
                field: 'notes',
                headerName: t("Notes"),
                width: 110,
                hideUnder: 'sm',
                cellClassName: 'wrap',
                renderCell: ({ value }) => value && md(value),
            },
            {
                field: 'uri',
                headerName: t('URI'),
                flex: 2,
                minWidth: 100,
                sx: { wordBreak: 'break-all' }, // be flexible, uri can be a mess
                mergeRender: { method: {}, status: {} },
                renderCell: ({ value, row }) => {
                    const [path, query] = splitAt('?', value).map(x => safeDecodeURIComponent(x))
                    const ul = row.extra?.ul
                    if (_.isArray(ul))
                        return path + ul.join(' + ')
                    if (!path.startsWith(API_URL))
                        return [path, query && h(Box as any, { key: 0, component: 'span', sx: { color: 'text.secondary', fontSize: 'smaller' } }, '?', query)]
                    const name = path.slice(API_URL.length)
                    const params = query && ': ' + Array.from(new URLSearchParams(query)).map(x => `${x[0]}=${tryJson(x[1]) ?? x[1]}`).join(' ; ')
                    return "API " + name + params
                }
            },
            {
                field: 'agentText',
                valueGetter: (_value: any, row: any) => row.extra?.ua,
                headerName: t("Agent text"),
                flex: 2,
                hideUnder: true,
            },
        ]
    })

    function enhanceLogLine(row: any) {
        if (!row) return
        const { extra } = row
        if ((extra?.country || row.country) && !showCountry)
            setShowCountry(true)
        if (extra?.ua && !showAgent)
            setShowAgent(true)
        if (row.uri) {
            const upload = row.method === 'PUT' || extra?.ul
            const partial = upload && stringAfter('?', row.uri).includes('partial=')
            if (upload)
                row.length =  (extra?.size ?? 0)
                    + (!partial && Number(row.uri.match(/\?.*resume=(\d+)/)?.[1]) || 0) // show full size for full uploads
            row.notes = extra?.dl ? t('full download {speed}', { speed: extra.speed ? formatSpeed(extra.speed, { sep: '\u00a0' }) : '' })
                : upload ? (partial ? t('partial upload {speed}', { speed: extra.speed ? formatSpeed(extra.speed, { sep: '\u00a0' }) : '' })
                    : t('upload {speed}', { speed: extra.speed ? formatSpeed(extra.speed, { sep: '\u00a0' }) : '' }))
                    : row.status === HTTP_UNAUTHORIZED && row.uri?.startsWith(API_URL + 'loginSrp') ? t("login failed") + prefix(':\n', extra?.u)
                        : _.map(extra?.params, (v, k) => `${k}: ${v}\n`).join('') + (row.notes || '')
            if (extra?.aborted)
                row.notes += t('(aborted)')
        }
        return row
    }
}

const UW = 'https://upload.wikimedia.org/wikipedia/commons/'
const CLIENT_ICONS = {
    Chrome: UW + 'e/e1/Google_Chrome_icon_%28February_2022%29.svg',
    Chromium: UW + 'f/fe/Chromium_Material_Icon.svg',
    Firefox: UW + 'a/a0/Firefox_logo%2C_2019.svg',
    Safari: UW + '5/52/Safari_browser_logo.svg',
    Edge: UW + '9/98/Microsoft_Edge_logo_%282019%29.svg',
    Opera: UW + '4/49/Opera_2015_icon.svg',
    Finder: UW + 'thumb/b/b9/Finder_Icon_macOS_Tahoe.png/250px-Finder_Icon_macOS_Tahoe.png',
    Cyberduck: UW + 'archive/4/48/20091115091336%21Cyberduck_icon.png',
    ForkLift: UW + '../en/9/96/ForkLift_3_File_Manager_and_File_Transfer_Client_Logo.png',
    Explorer: UW + '3/33/Microsoft_PowerToys-Logo_File_Explorer_Preview_02.svg',
    WinSCP: UW + '4/4f/WinSCP_6_Logo.png',
}
const OS_ICONS = {
    Android: UW + 'd/d7/Android_robot.svg',
    Linux: UW + '0/0a/Tux-shaded.svg',
    Windows: UW + '0/0a/Unofficial_Windows_logo_variant_-_2002%E2%80%932012_%28Multicolored%29.svg',
    macOS: UW + '7/74/Apple_logo_dark_grey.svg', // grey works for both themes
    iOS: UW + '7/74/Apple_logo_dark_grey.svg', // grey works for both themes
}
const OSS = {
    iOS: /iPhone OS|iPad/,
    macOS: /Mac OS|Darwin/,
    Windows: /Windows NT|^Microsoft-WebDAV|^WinSCP/,
    Android: /Android/,
    Linux: /Linux/,
}

export function agentIcons(agent: string | undefined) {
    if (!agent) return
    const short = shortenAgent(agent)
    const browserIcon = h(AgentIcon, { k: short, altText: true, map: CLIENT_ICONS })
    const os = _.findKey(OSS, re => re.test(agent))
    return h(Box, { sx: { fontSize: '110%' } }, browserIcon, ' ', os && osIcon(os as any))
}

const alreadyFailed: any = {}

export function osIcon(k: keyof typeof OS_ICONS) {
    return h(AgentIcon, { k, map: OS_ICONS })
}

function AgentIcon({ k, map, altText }: { k: string, map: Dict<string>, altText?: boolean }) {
    const src = map[k]
    const [err, setErr] = useState(alreadyFailed[k])
    return !src || err ? h(Fragment, {}, altText ? k : null) : h('img', {
        src,
        alt: k + " icon",
        title: k,
        style: { height: '1.2em', verticalAlign: 'bottom', marginRight: '.2em' },
        onError() { setErr(alreadyFailed[k] = true) }
    })
}

function parseLogLine(line: string, id: number) {
    const m = /^(.+?) (.+?) (.+?) \[(.{11}):(.{14})] "(\w+) ([^"]+) HTTP\/\d.\d" (\d+) (-|\d+) ?(.*)/.exec(line)
    if (!m) return
    const [, ip, , user, date, time, method, uri, status, length, extra] = m
    return { // keep object format same as events emitted by the log module
        id,
        ip,
        user: user === '-' ? undefined : user,
        ts: new Date(date + ' ' + time),
        method,
        uri,
        status: Number(status),
        length: length === '-' ? undefined : Number(length),
        extra: tryJson(tryJson(extra)) || undefined,
    }
}
