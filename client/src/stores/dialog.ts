import { ref } from 'vue'
import { defineStore } from 'pinia'

interface DialogOptions
{
    title?: string
    confirmText?: string
    cancelText?: string
    type?: 'normal' | 'danger' | 'warning'
    alertOnly?: boolean // trueならキャンセルボタンなし(alert代わり)
    showMemoInput?: boolean // trueならメモ入力欄を表示する
    memoPlaceholder?: string // メモ入力欄のプレースホルダー
    thirdText?: string // 指定時のみ第3の選択肢ボタンを表示する（例：「予約枠の確保のみ」）
}

export const useDialogStore = defineStore('dialog', () =>
{
    const isOpen = ref(false)
    const message = ref('')
    const options = ref<DialogOptions>({})
    const memoInput = ref('') // メモ入力欄の値（showMemoInput時のみ使用）

    // Promiseの解決関数を保持する変数
    // true: 確定(confirm), false: キャンセル(cancel), 'skip': 第3の選択肢（thirdText指定時のみ）
    let resolvePromise: (value: boolean | 'skip') => void = () => { }

    const open = (msg: string, opts: DialogOptions = {}) =>
    {
        message.value = msg
        options.value = opts
        memoInput.value = ''
        isOpen.value = true

        return new Promise<boolean | 'skip'>((resolve) =>
        {
            resolvePromise = resolve
        })
    }

    const close = () =>
    {
        isOpen.value = false
    }

    const resolve = (result: boolean | 'skip') =>
    {
        resolvePromise(result)
    }

    // 便利関数: アラート (OKのみ)
    const alert = (msg: string, title = 'お知らせ') =>
    {
        return open(msg, { title, alertOnly: true, confirmText: 'OK' })
    }

    // 便利関数: 確認 (OK/キャンセル)
    const confirm = (msg: string, title = '確認', type: 'normal' | 'danger' | 'warning' = 'normal') =>
    {
        return open(msg, { title, type })
    }

    return { isOpen, message, options, memoInput, open, close, resolve, alert, confirm }
})