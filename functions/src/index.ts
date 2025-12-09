import {onDocumentCreated} from "firebase-functions/v2/firestore";
import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";
import * as nodemailer from "nodemailer";

admin.initializeApp();

// メール送信用のトランスポーター設定
const createTransporter = () => {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.gmail.com",
    port: parseInt(process.env.SMTP_PORT || "587"),
    secure: false, // TLS
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
};

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

// お問い合わせが作成されたら管理者にメール送信
export const onContactCreated = onDocumentCreated(
  {
    document: "contacts/{contactId}",
    region: "asia-northeast1",
  },
  async (event) => {
    const snap = event.data;
    if (!snap) return;

    const contact = snap.data();
    const db = admin.firestore();

    try {
      // 全管理者のメールアドレスを取得
      const usersSnapshot = await db.collection("users").get();
      const adminEmails: string[] = [];

      usersSnapshot.forEach((doc) => {
        const userData = doc.data();
        if (userData.email && userData.is_admin) {
          adminEmails.push(userData.email);
        }
      });

      if (adminEmails.length === 0) {
        logger.warn("No admin emails found");
      }

      // メール本文作成
      const replyToEmail = contact.customer_email || "メールアドレス未登録";
      const emailBody = `
新しいお問い合わせが届きました。

【お客様情報】
お名前: ${contact.customer_name || "未登録"}
メールアドレス: ${contact.customer_email || "未登録"}
電話番号: ${contact.customer_phone || "未登録"}

【お問い合わせ内容】
${contact.message || ""}

【送信日時】
${contact.created_at?.toDate().toLocaleString("ja-JP", {
        timeZone: "Asia/Tokyo",
      }) || ""}

---
このメールは自動送信されています。

【返信先】
メールアドレス: ${replyToEmail}
電話番号: ${contact.customer_phone || "未登録"}

上記のメールアドレスまたは電話番号にご返信ください。
      `.trim();

      // メール送信設定
      const transporter = createTransporter();
      const toEmail = process.env.TO_EMAIL || process.env.FROM_EMAIL || process.env.SMTP_USER || "";
      const mailOptions = {
        from: {
          name: process.env.FROM_NAME || "ヘアーサロン JOY's 予約システム",
          address: process.env.FROM_EMAIL || process.env.SMTP_USER || "",
        },
        to: toEmail, // 環境変数で設定された宛先
        cc: contact.customer_email || undefined, // 顧客にCC
        bcc: adminEmails.length > 0 ? adminEmails.join(",") : undefined, // 全管理者にBCC
        subject: `【お問い合わせ】${contact.customer_name || "お客様"}より`,
        text: emailBody,
      };

      // メール送信
      await transporter.sendMail(mailOptions);

      logger.info("Contact email sent successfully", {
        contactId: snap.id,
        adminCount: adminEmails.length,
        hasCustomerEmail: !!contact.customer_email,
      });
    } catch (error) {
      logger.error("Error sending contact email", error);
      throw error;
    }
  }
);
