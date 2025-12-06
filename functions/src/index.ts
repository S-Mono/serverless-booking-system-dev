import {onDocumentCreated} from "firebase-functions/v2/firestore";
import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";

admin.initializeApp();

// 予約が作成されたら発火するトリガー
export const onReservationCreated = onDocumentCreated(
  {
    document: "reservations/{reservationId}",
    region: "asia-northeast1",
  },
  async (event) => {
    const snap = event.data;

    if (!snap) return;

    const reservation = snap.data();

    // 🔴 WEB予約のみ通知を送信（電話予約は通知しない）
    if (reservation.source !== "web") {
      logger.info("Skipping notification for non-web reservation", {
        reservationId: snap.id,
        source: reservation.source,
      });
      return;
    }

    // 日付の整形
    // 80文字制限を回避するため、条件判定を変数に切り出し
    const hasToDate =
      reservation.start_at &&
      typeof reservation.start_at.toDate === "function";

    const dateObj = hasToDate ?
      reservation.start_at.toDate() :
      new Date();

    const dateStr = dateObj.toLocaleString("ja-JP", {
      timeZone: "Asia/Tokyo",
    });

    // メニュー名と顧客名の取得
    // ここも長くなりやすいので適宜改行
    const menuName =
      reservation.menu_items && reservation.menu_items[0] ?
        reservation.menu_items[0].title :
        "メニュー未定";

    const customerName = reservation.customer_name || "ゲスト";

    // 通知ペイロード
    const payload = {
      notification: {
        title: "🎉 新しい予約が入りました！",
        body: `${dateStr}\n${customerName}様\n${menuName}`,
        click_action: "https://serverless-booking-system-seven.vercel.app/admin",
      },
    };

    const db = admin.firestore();
    const tokensSnap = await db.collection("admin_tokens").get();

    if (tokensSnap.empty) {
      logger.info("送信先トークンがありません");
      return;
    }

    const tokens = tokensSnap.docs.map((doc) => doc.data().token);

    // 一斉送信
    // Extract click_action (link) and create a safe notification object
    const clickAction = payload.notification?.click_action;
    let safeNotification: admin.messaging.Notification | undefined;
    if (payload.notification) {
      safeNotification = {
        title: payload.notification.title,
        body: payload.notification.body,
      };
    } else {
      safeNotification = undefined;
    }

    const message: admin.messaging.MulticastMessage = {
      tokens: tokens,
      // only allowed notification fields (title, body, image) should go here
      notification: safeNotification,
      webpush: {
        fcmOptions: {
          link: clickAction,
        },
      },
      // provide fallback to the data payload for clients that read data
      // include reservationId so clients can deduplicate notifications
      data: ((): { [key: string]: string } => {
        const dataPayload: { [key: string]: string } = {
          reservationId: String(snap.id || ""),
        };
        if (clickAction) dataPayload.link = String(clickAction);
        return dataPayload;
      })(),
    };
    logger.info("Prepared multicast message", {
      tokenCount: tokens.length,
      hasLink: !!clickAction,
    });

    const response = await admin.messaging().sendEachForMulticast(message);
    // ログ：送信結果のサマリを残しておく（トラブルシュート用）
    try {
      logger.info("sendEachForMulticast result", {
        reservationId: snap.id || null,
        successCount: response.successCount,
        failureCount: response.failureCount,
        total: response.responses.length,
      });
    } catch (e) {
      logger.warn("Failed logging send result", e);
    }

    // エラーになったトークンをお掃除
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tokensToRemove: Promise<any>[] = [];

    response.responses.forEach((res, index) => {
      const error = res.error;
      if (error) {
        logger.error(
          "Failure sending notification to",
          tokens[index],
          error
        );
        if (
          error.code === "messaging/invalid-registration-token" ||
          error.code === "messaging/registration-token-not-registered"
        ) {
          tokensToRemove.push(
            db.collection("admin_tokens").doc(tokens[index]).delete()
          );
        }
      }
    });

    await Promise.all(tokensToRemove);
  }
);
