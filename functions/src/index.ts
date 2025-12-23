import {onDocumentCreated} from "firebase-functions/v2/firestore";
import {onCall, HttpsError} from "firebase-functions/v2/https";
import {onSchedule} from "firebase-functions/v2/scheduler";
// import {onObjectFinalized} from "firebase-functions/v2/storage";
import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";
import * as nodemailer from "nodemailer";
import axios from "axios";
// import * as path from "path";
// import * as os from "os";
// import * as fs from "fs";

admin.initializeApp();

// メール送信用のトランスポーター設定
const createTransporter = () => {
  const config = {
    host: process.env.SMTP_HOST || "smtp.gmail.com",
    port: parseInt(process.env.SMTP_PORT || "587"),
    secure: false, // TLS
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  };

  logger.info("SMTP Config (password hidden)", {
    host: config.host,
    port: config.port,
    user: config.auth.user,
    hasPassword: !!config.auth.pass,
  });

  return nodemailer.createTransport(config);
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
      const toEmail = process.env.TO_EMAIL ||
        process.env.FROM_EMAIL ||
        process.env.SMTP_USER || "";
      const mailOptions = {
        from: {
          name: process.env.FROM_NAME ||
            "ヘアーサロン JOY's 予約システム",
          address: process.env.FROM_EMAIL ||
            process.env.SMTP_USER || "",
        },
        to: toEmail, // 環境変数で設定された宛先
        cc: contact.customer_email || undefined, // 顧客にCC
        bcc: adminEmails.length > 0 ?
          adminEmails.join(",") : undefined, // 全管理者にBCC
        subject: `【お問い合わせ】${contact.customer_name || "お客様"}より`,
        text: emailBody,
      };

      // メール送信
      logger.info("Attempting to send email", {
        to: toEmail,
        hasCC: !!contact.customer_email,
        bccCount: adminEmails.length,
      });

      const result = await transporter.sendMail(mailOptions);

      logger.info("Contact email sent successfully", {
        contactId: snap.id,
        messageId: result.messageId,
        response: result.response,
        adminCount: adminEmails.length,
        hasCustomerEmail: !!contact.customer_email,
      });
    } catch (error: unknown) {
      const errorObj = error as {
        message?: string;
        code?: string;
        command?: string;
        response?: string;
        stack?: string;
      };
      logger.error("Error sending contact email", {
        errorMessage: errorObj.message,
        errorCode: errorObj.code,
        errorCommand: errorObj.command,
        errorResponse: errorObj.response,
        errorStack: errorObj.stack,
      });
      throw error;
    }
  }
);

/**
 * ユーザー退会処理
 * LINEミニアプリ開発ガイドライン準拠
 * https://developers.line.biz/ja/docs/line-mini-app/development-guidelines/#deauthorize
 */
export const deleteUserAccount = onCall(
  {
    region: "asia-northeast1",
  },
  async (request) => {
    const userId = request.auth?.uid;

    if (!userId) {
      throw new HttpsError("unauthenticated", "認証が必要です");
    }

    logger.info("User account deletion started", {userId});

    try {
      const db = admin.firestore();
      const batch = db.batch();

      // 1. LINE連携解除（権限取り消し）
      try {
        // ユーザードキュメントからLINE情報を取得
        const customerDoc = await db.collection("customers").doc(userId).get();
        const customerData = customerDoc.data();

        if (customerData?.line_user_id) {
          const lineUserId = customerData.line_user_id;
          const channelId = process.env.LINE_CHANNEL_ID;
          const channelSecret = process.env.LINE_CHANNEL_SECRET;

          if (!channelId || !channelSecret) {
            logger.warn("LINE credentials not configured");
          } else {
            // チャネルアクセストークン取得
            const tokenResponse = await axios.post(
              "https://api.line.me/oauth2/v2.1/token",
              new URLSearchParams({
                grant_type: "client_credentials",
                client_id: channelId,
                client_secret: channelSecret,
              }),
              {
                headers: {"Content-Type": "application/x-www-form-urlencoded"},
              }
            );

            const accessToken = tokenResponse.data.access_token;

            // LINE権限取り消しAPI呼び出し
            await axios.post(
              "https://api.line.me/oauth2/v2.1/revoke",
              new URLSearchParams({
                access_token: accessToken,
                client_id: channelId,
                client_secret: channelSecret,
              }),
              {
                headers: {"Content-Type": "application/x-www-form-urlencoded"},
              }
            );

            logger.info("LINE authorization revoked", {userId, lineUserId});
          }
        }
      } catch (lineError: unknown) {
        const errorObj = lineError as {message?: string};
        logger.error("Failed to revoke LINE authorization", {
          userId,
          error: errorObj.message,
        });
        // LINE連携解除に失敗してもアカウント削除は続行
      }

      // 2. 予約データを物理削除
      const reservationsSnapshot = await db
        .collection("reservations")
        .where("customer_id", "==", userId)
        .get();

      reservationsSnapshot.docs.forEach((doc) => {
        batch.delete(doc.ref);
      });

      logger.info("Reservations deleted", {
        userId,
        count: reservationsSnapshot.size,
      });

      // 3. メッセージを物理削除
      const messagesSnapshot = await db
        .collection("messages")
        .where("customer_id", "==", userId)
        .get();

      messagesSnapshot.docs.forEach((doc) => {
        batch.delete(doc.ref);
      });

      logger.info("Messages deleted", {
        userId,
        count: messagesSnapshot.size,
      });

      // 4. お問い合わせデータに退会マーク
      const contactsSnapshot = await db
        .collection("contacts")
        .where("customer_id", "==", userId)
        .get();

      contactsSnapshot.docs.forEach((doc) => {
        batch.update(doc.ref, {
          user_deleted: true,
        });
      });

      // 5. 顧客情報を削除
      batch.delete(db.collection("customers").doc(userId));

      // バッチコミット
      await batch.commit();

      logger.info("Firestore data deleted/updated", {userId});

      // 6. Firebase Authenticationからユーザー削除
      await admin.auth().deleteUser(userId);

      logger.info("User account deleted successfully", {userId});

      return {success: true, message: "退会処理が完了しました"};
    } catch (error: unknown) {
      const errorObj = error as {message?: string; code?: string};
      logger.error("Error deleting user account", {
        userId,
        error: errorObj.message,
        code: errorObj.code,
      });
      throw new HttpsError(
        "internal",
        "退会処理中にエラーが発生しました: " + errorObj.message
      );
    }
  }
);

/**
 * 毎日 深夜 1:00 実行
 * 2年（730日）経過したカルテを削除
 * ただし、各顧客の最新1件は必ず保持
 */
export const pruneOldMedicalRecords = onSchedule(
  {
    schedule: "every day 01:00",
    timeZone: "Asia/Tokyo",
    region: "asia-northeast1",
  },
  async () => {
    const db = admin.firestore();
    const bucketName = process.env.STORAGE_BUCKET ||
      "booking-system-dev-81786.appspot.com";
    const bucket = admin.storage().bucket(bucketName);

    const now = new Date();
    const cutoffDate = new Date(now.getTime() - 730 * 24 * 60 * 60 * 1000);

    logger.info("Pruning medical records older than", {
      cutoffDate: cutoffDate.toISOString(),
    });

    try {
      // 全カルテを取得
      const allRecordsSnap = await db
        .collection("customer_medical_records")
        .orderBy("recorded_at", "desc")
        .get();

      // 顧客ごとにグループ化
      interface MedicalRecord {
        id: string;
        ref: FirebaseFirestore.DocumentReference;
        recorded_at: FirebaseFirestore.Timestamp;
        expiry_date: FirebaseFirestore.Timestamp;
        customer_id: string;
        [key: string]: unknown;
      }

      const recordsByCustomer = new Map<string, MedicalRecord[]>();

      allRecordsSnap.docs.forEach((doc) => {
        const data = doc.data();
        const customerId = data.customer_id;

        if (!recordsByCustomer.has(customerId)) {
          recordsByCustomer.set(customerId, []);
        }

        recordsByCustomer.get(customerId)!.push({
          id: doc.id,
          ref: doc.ref,
          ...data,
        } as MedicalRecord);
      });

      let deletedCount = 0;

      // 顧客ごとに処理
      for (const [customerId, records] of recordsByCustomer.entries()) {
        // 最新順にソート（念のため）
        records.sort((a, b) => b.recorded_at.seconds - a.recorded_at.seconds);

        // 最新1件はスキップ、2件目以降で期限切れを削除
        for (let i = 1; i < records.length; i++) {
          const record = records[i];
          const recordDate = record.expiry_date.toDate();

          if (recordDate < cutoffDate) {
            try {
              // 1. Storage フォルダ内のファイルを全削除
              const photosPath =
                `customer_medical_records/${customerId}/${record.id}/`;
              const [files] = await bucket.getFiles({prefix: photosPath});

              for (const file of files) {
                await file.delete();
                logger.info(`Deleted storage file: ${file.name}`);
              }

              // 2. Firestore ドキュメント削除
              await record.ref.delete();
              logger.info(
                `Deleted medical record: ${record.id} ` +
                `for customer ${customerId}`
              );

              deletedCount++;
            } catch (error) {
              logger.error(`Failed to prune record ${record.id}:`, error);
            }
          }
        }
      }

      logger.info(
        `Medical records pruning completed. Deleted ${deletedCount} records.`
      );
    } catch (error) {
      logger.error("Error during medical records pruning:", error);
      throw error;
    }
  }
);

/**
 * Storage に画像がアップロードされたら自動でサムネイルを生成
 * Sharp ライブラリを使用
 */
// Storage bucket region detection issue - temporarily disabled
// TODO: Re-enable after configuring Storage bucket properly
/*
export const generateThumbnail = onObjectFinalized(
  {
    region: "us-west1",
    bucket: "booking-system-dev-81786.appspot.com",
  },
  async (event) => {
    const filePath = event.data.name;
    const contentType = event.data.contentType;

    // カルテ画像以外は無視
    if (!filePath.startsWith("customer_medical_records/")) {
      return;
    }

    // すでにサムネイルの場合は無視
    if (filePath.includes("_thumb.")) {
      return;
    }

    // 画像以外は無視
    if (!contentType || !contentType.startsWith("image/")) {
      return;
    }

    logger.info("Generating thumbnail for", {filePath});

    const bucket = admin.storage().bucket(event.data.bucket);
    const fileName = path.basename(filePath);
    const fileDir = path.dirname(filePath);
    const tempFilePath = path.join(os.tmpdir(), fileName);
    const thumbFileName = fileName.replace(/(\.\w+)$/, "_thumb$1");
    const thumbFilePath = path.join(os.tmpdir(), thumbFileName);
    const thumbStoragePath = path.join(fileDir, thumbFileName);

    try {
      // Sharp をここで動的 import
      const sharp = (await import("sharp")).default;

      // 1. オリジナル画像をダウンロード
      await bucket.file(filePath).download({destination: tempFilePath});
      logger.info("Downloaded original image to", tempFilePath);

      // 2. Sharp でサムネイル生成（幅300px）
      await sharp(tempFilePath)
        .resize(300, null, {withoutEnlargement: true})
        .toFile(thumbFilePath);
      logger.info("Generated thumbnail at", thumbFilePath);

      // 3. サムネイルをアップロード
      await bucket.upload(thumbFilePath, {
        destination: thumbStoragePath,
        metadata: {
          contentType: contentType,
          metadata: {
            original: filePath,
          },
        },
      });
      logger.info("Uploaded thumbnail to", thumbStoragePath);

      // 4. 一時ファイル削除
      fs.unlinkSync(tempFilePath);
      fs.unlinkSync(thumbFilePath);

      logger.info("Thumbnail generation completed");
    } catch (error) {
      logger.error("Error generating thumbnail:", error);
      // エラーでも処理を止めない
    }
  }
);
*/

/**
 * パスワードリセットリクエストが作成されたらメールを送信
 */
export const onPasswordResetRequest = onDocumentCreated(
  {
    document: "password_reset_requests/{requestId}",
    region: "asia-northeast1",
  },
  async (event) => {
    const snap = event.data;
    if (!snap) {
      logger.warn("No document data in password reset request");
      return;
    }

    const resetData = snap.data();
    const token = resetData.token;
    const email = resetData.email;
    const customerName = resetData.name_kana || "お客様";

    logger.info("Password reset request received", {
      email,
      customerName,
      requestId: snap.id,
    });

    // リセットURL（開発環境のドメインに変更してください）
    const baseUrl = process.env.APP_URL || "http://localhost:5173";
    const resetUrl = `${baseUrl}/reset-password?token=${token}`;

    // Gmail SMTPでメール送信
    const transporter = createTransporter();
    const fromEmail = process.env.SMTP_USER || "noreply@example.com";

    const mailOptions = {
      from: fromEmail,
      to: email,
      subject: "パスワード再設定のご案内",
      text: `${customerName}様\n\n` +
        "パスワード再設定のリクエストを受け付けました。\n" +
        "以下のURLからパスワードを再設定してください。\n\n" +
        `${resetUrl}\n\n` +
        "このリンクの有効期限は10分間です。\n" +
        "※このメールに心当たりがない場合は、無視してください。",
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>パスワード再設定のご案内</h2>
          <p>${customerName}様</p>
          <p>パスワード再設定のリクエストを受け付けました。</p>
          <p>以下のボタンからパスワードを再設定してください。</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${resetUrl}" 
               style="background: linear-gradient(135deg,
                      #667eea 0%, #764ba2 100%);
                      color: white;
                      padding: 12px 30px;
                      text-decoration: none;
                      border-radius: 6px;
                      display: inline-block;
                      font-weight: bold;">
              パスワードを再設定する
            </a>
          </div>
          <p style="font-size: 0.9em; color: #666;">
            このリンクの有効期限は10分間です。
          </p>
          <p style="font-size: 0.9em; color: #666;">
            ※このメールに心当たりがない場合は、無視してください。
          </p>
          <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;">
          <p style="font-size: 0.8em; color: #999;">
            このメールは自動送信されています。返信できません。
          </p>
        </div>
      `,
    };

    try {
      await transporter.sendMail(mailOptions);
      logger.info("Password reset email sent successfully", {
        email,
        requestId: snap.id,
      });
    } catch (error: unknown) {
      const errorObj = error as {message?: string; stack?: string};
      logger.error("Failed to send password reset email", {
        error: errorObj.message,
        stack: errorObj.stack,
        email,
      });
    }
  }
);

/**
 * 管理者が顧客のパスワードを変更
 */
export const adminUpdatePassword = onCall(
  {
    region: "asia-northeast1",
  },
  async (request) => {
    const {uid, newPassword} = request.data;

    if (!uid || !newPassword) {
      throw new HttpsError(
        "invalid-argument",
        "uid and newPassword are required"
      );
    }

    // 管理者権限チェック
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Authentication required");
    }

    const callerUid = request.auth.uid;
    const callerDoc = await admin
      .firestore()
      .collection("customers")
      .doc(callerUid)
      .get();

    if (!callerDoc.exists || callerDoc.data()?.role !== "admin") {
      throw new HttpsError(
        "permission-denied",
        "Admin permission required"
      );
    }

    try {
      await admin.auth().updateUser(uid, {
        password: newPassword,
      });

      logger.info("Admin updated user password", {
        adminUid: callerUid,
        targetUid: uid,
      });

      return {success: true};
    } catch (error: unknown) {
      const errorObj = error as {message?: string};
      logger.error("Failed to update user password", {
        error: errorObj.message,
        targetUid: uid,
      });
      throw new HttpsError("internal", "Failed to update password");
    }
  }
);
