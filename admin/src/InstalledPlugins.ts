// This file is part of HFS - Copyright 2021-2023, Massimo Melina <a@rejetto.com> - License https://www.gnu.org/licenses/gpl-3.0.txt

import { apiCall, useApiList } from './api'
import { createElement as h, Fragment, useEffect, useState } from 'react'
import { Box, Link, Table, TableBody, TableCell, TableRow, useTheme } from '@mui/material'
import type { Breakpoint } from '@mui/material/styles'
import { DataTable, DataTableColumn } from './DataTable'
import {
    Delete, Error as ErrorIcon, FormatPaint as ThemeIcon, ListAlt, PlayCircle, Settings, StopCircle, Upgrade
} from '@mui/icons-material'
import {
    CFG, HTTP_FAILED_DEPENDENCY, md, prefix, with_, xlate, tryJson, NBSP, isPrimitive, HIDE_IN_TESTS, wait
} from './misc'
import { alertDialog, confirmDialog, toast } from './dialog'
import _ from 'lodash'
import { PLUGIN_ERRORS } from './PluginsPage'
import { Btn, hTooltip, IconBtn, iconTooltip, usePauseButton } from './mui'
import { showPluginOptions, evalWrapper } from './pluginOptions'
import { t, useAdminLanguage } from './adminI18n'

// updates=true will show the "check updates" version of the page
export default function InstalledPlugins({updates }: { updates?: true }) {
    useAdminLanguage()
    const { list, error, setList, initializing } = useApiList<any>(updates ? 'get_plugin_updates' : 'get_plugins', {}, {
        map(x: any) { x.config &&= tryJson(x.config, s => evalWrapper('()=>('+s+')')()) }
    })
    const [sortAgain, setSortAgain] = useState(0)
    useEffect(() => {
        setList(list =>
            _.sortBy(list, x => (x.error ? 0 : x.started ? 1 : x.badApi ? 2 : 3) + treatPluginName(x.repo?.split('/').reverse().join('/') || x.id).toLowerCase()))
    }, [list.length, sortAgain])
    const size = 'small'
    const { pause, pauseButton } = usePauseButton("plugins", () => getSingleConfig(CFG.suspend_plugins).then(x => !x), {
        async onClick() {
            await apiCall('set_config', { values: { [CFG.suspend_plugins]: !pause } })
            if (!pause) return
            await wait(2000)
            setSortAgain(Date.now())
        }
    })
    const theme = useTheme()
    return h(DataTable, {
        error: isPrimitive(error) ? t(xlate(error, PLUGIN_ERRORS))
            : _.map(error, (v, k) => t('Error {code} for: {list}', { code: k, list: v.join(', ') })).join('; '), // complex error for updates
        rows: list.length ? list : [], // workaround for DataGrid's bug causing 'no rows' message to be not displayed after 'loading' was also used
        fillFlex: true,
        initializing,
        disableColumnSelector: true,
        quickFilter: !updates,
        actionsHeader: !updates && pauseButton,
        getRowHeight: updates && (({ model }) => model.changelog ? 'auto' as const : 50),
        noRows: updates && t('No updates available. Only plugins available on "search online" are checked.'),
        columns: [
            {
                field: 'id',
                headerName: t("name"),
                flex: .3,
                minWidth: 150,
                renderCell: renderName,
                valueGetter(_value: any, row: any) { return row.repo || row.id },
                mergeRender: { [updates ? 'changelog' : 'description']: { sx: { fontSize: 'x-small' } } }
            },
            {
                field: 'version',
                headerName: t("version"),
                width: 70,
                hideUnder: 'sm',
                cellInnerProps: { className: HIDE_IN_TESTS },
                mergeRender: { installedVersion: { sx: { fontSize: 'x-small' } } }
            },
            themeField(),
            {
                ...descriptionField(),
                flex: 1,
                hideUnder: 'sm',
            },
            {
                field: 'installedVersion',
                hideUnder: true,
                dialogHidden: true,
                renderCell: ({ value }) => value && t("Yours {version}", { version: value })
            },
            {
                field: 'changelog',
                headerName: t("Change log"),
                flex: 2,
                hideUnder: !updates || 'sm',
                sx: { flexDirection: 'column', alignItems: 'flex-start' },
                renderCell({ value, row }) {
                    if (!Array.isArray(value)) return null
                    return h(Table, { sx: { td: { p: 0 } } },
                        h(TableBody, {},
                            _.uniq(_.sortBy(value, 'version').filter(x => _.isString(x.message) && x.message && x.version > row.installedVersion))
                                .map((x, i) => h(TableRow, { key: i },
                                    h(TableCell, { sx: { whiteSpace: 'pre', verticalAlign: 'top' } }, `• ${x.version}: `),
                                    h(TableCell, {}, md(x.message))
                                ))
                        )
                    )
                }
            }
        ],
        actions: ({ row, id }) => updates ? [
            h(IconBtn, {
                icon: Upgrade,
                title: row.downloading ? t("Downloading") : row.updated ? t("Already updated") : t("Update"),
                disabled: row.updated,
                progress: row.downloading,
                size,
                async onClick() {
                    await apiCall('update_plugin', { id }, { timeout: false }).catch(e => {
                        throw e.code !== HTTP_FAILED_DEPENDENCY ? e
                            : Error(t("Failed dependencies: {details}", { details: e.cause?.map((x: any) => prefix(`plugin "`, x.id || x.repo, `" `) + x.error).join('; ') }))
                    })
                    toast(t("Plugin updated"))
                }
            })
        ] : [
            h(IconBtn, row.started ? {
                icon: StopCircle,
                title: h(Box, { 'aria-hidden': true }, t("Stop {id}", { id }), h('br'), t("Started {time}", { time: new Date(row.started as string).toLocaleString() })),
                'aria-label': t("Stop {id}", { id }),
                size,
                color: 'success',
                doneAnimation: true,
                onClick: () => apiCall('stop_plugin', { id }),
            } : {
                icon: PlayCircle,
                title: t("Start {id}", { id }),
                disabled: pause && t("All plugins are paused – Click the Resume button below"),
                size,
                onClick: () => startPlugin(id),
            }),
            h(IconBtn, {
                icon: row.config || !row.started || !row.log ? Settings : ListAlt,
                title: row.config || !row.log ? t("Options") : t("Log"),
                size,
                disabled: !row.started && t("Start plugin to access options")
                    || !row.config && !row.log && t("No options and no log for this plugin"),
                onClick() {
                    const cd = row.configDialog
                    // support css values for maxWidth without having to wrap in sx, as in DialogProps it only supports breakpoints
                    let maxWidth = theme.breakpoints.values[cd?.maxWidth as Breakpoint] || cd?.sx?.maxWidth || xlate(cd?.maxWidth, { xs: 0 }) || 432
                    if (typeof maxWidth === 'number')  // @ts-ignore
                        maxWidth += 'px'
                    return showPluginOptions(row, maxWidth)
                }
            }),
            h(IconBtn, {
                icon: Delete,
                title: t("Uninstall"),
                size,
                async onClick() {
                    const res = await confirmDialog(t("{id}: delete configuration too?", { id }), {
                        trueText: t("Yes"),
                        falseText: t("No"),
                        after: ({ onClick }) => h(Btn, { variant: 'outlined', onClick(){ onClick(undefined) } }, t("Abort"))
                    })
                    if (res === undefined) return
                    await apiCall('uninstall_plugin', { id, deleteConfig: res })
                    toast(t("Plugin uninstalled"))
                }
            }),
        ]
    })
}

function getSingleConfig(k: string) {
    return apiCall('get_config', { only: [k] }).then(x => x[k])
}

// hide the hfs- prefix, as one may want to use it for its repository, because github is the context, but in the hfs context the prefix it's not only redundant, but also ruins the sorting
function treatPluginName(name: string) {
    return name.replace(/hfs-/, '')
}

export function renderName({ row, value }: any) {
    const { repo } = row
    return h(Fragment, {},
        row.downgrade && errorIcon("This version is older than the one you installed. It is possible that the author found a problem with your version and decided to retire it.", true),
        errorIcon(row.error || row.badApi, !row.error),
        repo?.includes('//') ? h(Link, { href: repo, target: 'plugin' }, value)
            : with_(repo?.split('/'), arr => arr?.length !== 2 ? value
                : h(Fragment, {},
                    h(Link, { href: 'https://github.com/' + repo, target: 'plugin', onClick(ev) { ev.stopPropagation() } }, treatPluginName(arr[1])),
                    NBSP + 'by ', arr[0]
                ))
)

    function errorIcon(msg: string, warning=false) {
        return msg && hTooltip(msg, msg, h(ErrorIcon, { fontSize: 'small', color: warning ? 'warning' : 'error', sx: { ml: -.5, mr: .5 } }))
    }
}

export async function startPlugin(id: string) {
    try {
        await apiCall('start_plugin', { id })
        toast(t("Plugin started"), h(PlayCircle, { color: 'success' }))
        return true
    }
    catch(e: any) {
        alertDialog(t("Plugin {id} didn't start, with error: {error}", { id, error: String(e?.message || e) }), 'error')
    }
}

export function descriptionField(): DataTableColumn {
    return {
        field: 'description',
        headerName: t("description"),
        mergeRender: { isTheme: {} } ,
        mergeRenderSx: { float: 'left' },
    }
}

export function themeField(): DataTableColumn {
    return {
        field: 'isTheme',
        headerName: t("is theme"),
        hideUnder: true,
        dialogHidden: true,
        type: 'boolean',
        renderCell({ value }) {
            return value && iconTooltip(ThemeIcon, _.isString(value) ? t("{theme} theme", { theme: value }) : t("theme"), { fontSize: '1.2rem', mr: '.3em' })
        }
    }
}
