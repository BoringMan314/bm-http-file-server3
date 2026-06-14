// This file is part of HFS - Copyright 2021-2023, Massimo Melina <a@rejetto.com> - License https://www.gnu.org/licenses/gpl-3.0.txt

import { createElement as h, Fragment, useEffect, useMemo, useState } from 'react';
import { apiCall, useApiEx, useApiList } from './api'
import { DataTable, fillFlexParentSx } from './DataTable'
import { Alert, Box } from '@mui/material'
import { Delete, Upload } from '@mui/icons-material'
import { CFG, readFile, selectFiles } from './misc'
import { Btn, IconBtn } from './mui'
import { PageProps } from './App'
import _ from 'lodash'
import { alertDialog, toast } from './dialog'
import { Field, SelectField } from '@hfs/mui-grid-form';
import { t, useAdminLanguage } from './adminI18n'

export default function LangPage({setTitleSide }: PageProps) {
    const { language } = useAdminLanguage()
    const { list, error, connecting, reload } = useApiList('get_langs')
    const langs = useMemo(() => ['en', ..._.uniq(list.map(x => x.code))], [list])
    setTitleSide(useMemo(() =>
        h(Alert, { severity: 'info', sx: { display: { xs: 'none', sm: 'inherit' }  } }, t('languageFrontEndOnlyNotice')),
        [language]))
    return h(Fragment, {},
        h(Box, { sx: { mt: 1, maxWidth: '50em', flex: 1, ...fillFlexParentSx } },
            h(Box, { sx: { mb: 1, display: 'flex' } },
                h(Btn, { icon: Upload, onClick: add }, t("Add")),
                h(Box, { sx: { flex: 1 } }),
                h(ForceLang, { langs }),
            ),
            h(DataTable, {
                error,
                loading: connecting,
                rows: useMemo(() => _.sortBy(list, x => (x.embedded ? 2 : 1) + x.code), [list.length]), // multi-sorting is only in pro version of DataGrid
                hideFooter: true,
                fillFlex: true,
                columns: [
                    {
                        field: 'code',
                        headerName: t("code"),
                        width: 110,
                        valueFormatter: (value: string | undefined) => value?.toUpperCase(),
                    },
                    {
                        field: 'version',
                        headerName: t("version"),
                        width: 120,
                        hideUnder: 'sm',
                    },
                    {
                        field: 'author',
                        headerName: t("author"),
                        flex: 1,
                        hideUnder: 'sm',
                    }
                ],
                actions: ({ row }) => [
                    h(IconBtn, {
                        icon: Delete,
                        title: row.embedded ? t("Cannot delete (embedded)") : t("Delete"),
                        confirm: t('Delete language code "{code}"?', { code: row.code }),
                        disabled: row.embedded,
                        async onClick() {
                            await apiCall('del_lang', _.pick(row, 'code'))
                            reload()
                            toast(t("Deleted"))
                        }
                    }),
                ]
            })
        )
    )

    function add() {
        selectFiles(async list => {
            if (!list) return
            const langs: any = {}
            for (const f of list)
                langs[f.name] = await readFile(f)
            try {
                await apiCall('add_langs', { langs })
                reload()
                toast(t("Loaded"))
            }
            catch (e: any) {
                await alertDialog(e)
            }
        }, { accept: '.json' })
    }
}

function ForceLang({ langs }: { langs: string[] }) {
    const K = CFG.force_lang
    const { data, reload, loading } = useApiEx('get_config', { only: [K] })
    const [lang, setLang] = useState()
    useEffect(() => setLang(data?.[K] ?? lang), [data])
    const [saving, setSaving] = useState<string>()

    return h(SelectField as Field<string>, {
        fullWidth: false,
        size: 'small',
        disabled: Boolean(loading) || typeof saving === 'string',
        value: saving ?? lang,
        async onChange(v) {
            setSaving(v)
            try {
                await apiCall('set_config', { values: { [K]: v } })
                await reload()
            }
            finally { setSaving(undefined) }
        },
        options: [
            { label: t("Respect browser language"), value: '' },
            ...langs.map(x => ({ value: x, label: t("Force language: {code}", { code: x }) }))
        ]
    })
}
