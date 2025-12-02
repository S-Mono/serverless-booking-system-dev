import { ref } from 'vue'
import { defineStore } from 'pinia'

interface DialogOptions
{
    title?: string
    confirmText?: string
    cancelText?: string
    type?: 'normal' | 'danger'
    alertOnly?: boolean // trueならキャンセルボタンなし(alert代わり)
}

export const useDialogStore = defineStore('dialog', () =>
{
    const isOpen = ref(false)
    const message = ref('')
    const options = ref<DialogOptions>({})

    // Promiseの解決関数を保持する変数
    let resolvePromise: (value: boolean) => void = () => { }

    const open = (msg: string, opts: DialogOptions = {}) =>
    {
        message.value = msg
        options.value = opts
        isOpen.value = true

        return new Promise<boolean>((resolve) =>
        {
            resolvePromise = resolve
        })
    }

    const close = () =>
    {
        isOpen.value = false
    }

    const resolve = (result: boolean) =>
    {
        resolvePromise(result)
    }

    // 便利関数: アラート (OKのみ)
    const alert = (msg: string, title = 'お知らせ') =>
    {
        return open(msg, { title, alertOnly: true, confirmText: 'OK' })
    }

    // 便利関数: 確認 (OK/キャンセル)
    const confirm = (msg: string, title = '確認', type: 'normal' | 'danger' = 'normal') =>
    {
        return open(msg, { title, type })
    }

    return { isOpen, message, options, open, close, resolve, alert, confirm }
})