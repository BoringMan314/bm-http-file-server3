import { dirname, enforceFinal, join } from './misc'
import _ from 'lodash'
import { useApiList } from './api'
import { ChangeEvent, createElement as h, useMemo } from 'react'
import { Autocomplete, AutocompleteProps, TextField } from '@mui/material'
import { FieldProps } from '@hfs/mui-grid-form'
import { t, useAdminLanguage } from './adminI18n'

interface VfsPathFieldProps extends FieldProps<string> {
    autocompleteProps: Partial<AutocompleteProps<string, false, true, undefined>>
}

export default function VfsPathField({value='', onChange, helperText, setApi, autocompleteProps, folders=true, files=true,
    InputLabelProps, slotProps, ...props
}: VfsPathFieldProps) {
    useAdminLanguage()
    const uri = dirname(value.replace(/\/{2,}/g, '/'))
    const { list, loading } = useApiList('get_file_list', {
        uri,
        admin: true,
        fileMask: typeof files === 'string' ? files : undefined,
        onlyFolders: !files
    })
    const options = useMemo(() => {
        const ret = _.uniq([uri && (dirname(uri) + '/'), enforceFinal('/', uri)].filter(Boolean))
            .concat(list.map(x => join(uri, x.n)))
        if (value && !ret.includes(value)) ret.push(value) // allow re-selection of the same value without issuing a console warning
        return ret
    }, [list, uri])
    setApi?.({
        getError() {
            return !folders && value?.endsWith('/') && t('must be a file') || false
        }
    })
    return h(Autocomplete<string, false, true, undefined>, {
        value,
        options,
        noOptionsText: t('No options'),
        isOptionEqualToValue: (o,v) => o === v || o === v + '/',
        loading,
        disableClearable: true,
        disableCloseOnSelect: true,
        renderInput: params => h(TextField, {
            helperText,
            onBlur(event) {
                // if the user specified a folder without the final slash, try to enforce it
                const v = enforceFinal('/', event.target.value)
                if (options.includes(v))
                    onChange(v, { was: value, event })
            },
            ...params,
            ...props,
            slotProps: {
                ...slotProps,
                input: {
                    ...slotProps?.input,
                    ...params.slotProps.input,
                },
                inputLabel: {
                    shrink: true,
                    ...params.slotProps.inputLabel,
                    ...InputLabelProps,
                    ...slotProps?.inputLabel,
                },
                htmlInput: {
                    ...slotProps?.htmlInput,
                    ...params.slotProps.htmlInput,
                    onChange(event: ChangeEvent<HTMLInputElement>) {
                        params.slotProps.htmlInput.onChange?.(event)
                        const v = event.target.value
                        if (files || !v || v.endsWith('/'))
                            onChange(v, { was: value, event })
                    },
                },
            },
        }),
        onChange: (event, sel) => onChange(sel, { was: value, event }),
        ...autocompleteProps,
    })
}
