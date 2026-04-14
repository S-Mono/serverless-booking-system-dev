import { collection, addDoc, Timestamp } from 'firebase/firestore'
import { db } from './firebase'
import liff from '@line/liff'

/**
 * PII（個人情報）をマスキングする
 */
function maskPII(text: string | null | undefined): string | null {
  if (text == null) return null
  return String(text)
    // 日本の電話番号（ハイフンあり・なし）
    .replace(/0\d{1,4}[-\s]?\d{1,4}[-\s]?\d{4}/g, '***-****-****')
    // メールアドレス
    .replace(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g, '***@***.***')
    // カタカナ氏名（4文字以上の連続カタカナ）
    .replace(/[ァ-ヶー]{4,}/g, '****')
}

/**
 * エラーをFirestoreに記録する
 * 審査時のエラー特定や本番環境のトラブルシューティングに使用
 */
export async function reportError(
  error: any,
  context: string,
  additionalInfo?: Record<string, any>
) {
  try {
    const errorData = {
      message: maskPII(error?.message || String(error)),
      name: error?.name || 'Unknown',
      stack: maskPII(error?.stack || null),
      context: context,
      userAgent: navigator.userAgent,
      url: window.location.href,
      timestamp: Timestamp.now(),
      ...additionalInfo
    }

    console.log('Reporting error to Firestore:', errorData)
    
    await addDoc(collection(db, 'error_logs'), errorData)
    
    console.log('Error reported successfully')
  } catch (e) {
    // エラーレポート自体が失敗してもアプリは継続
    console.error('Failed to report error:', e)
  }
}

/**
 * LIFF初期化エラー専用のレポート
 */
export async function reportLiffError(
  error: any,
  stage: 'init' | 'login' | 'profile',
  liffId?: string
) {
  await reportError(error, `LIFF_${stage.toUpperCase()}`, {
    stage,
    liffId,
    isInClient: typeof liff !== 'undefined' && liff.isInClient ? liff.isInClient() : null,
    isLoggedIn: typeof liff !== 'undefined' && liff.isLoggedIn ? liff.isLoggedIn() : null
  })
}
