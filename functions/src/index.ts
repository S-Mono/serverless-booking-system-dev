import {onDocumentCreated} from "firebase-functions/v2/firestore";
import {onCall, HttpsError} from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";
import * as nodemailer from "nodemailer";
import axios from "axios";

admin.initializeApp();

/**
 * JWTを生成してチャネルアクセストークンv2.1を取得
 */
/**
 * 短期のチャネルアクセストークンを取得
 * client_idとclient_secretを使用（JWTアサーション不要）
 */
const getLineChannelAccessToken = async (): Promise<string | null> => {
  try {
    const channelId = process.env.LINE_CHANNEL_ID;
    const channelSecret = process.env.LINE_CHANNEL_SECRET;

    if (!channelId || !channelSecret) {
      logger.warn("LINE credentials not configured");
      return null;
    }

    logger.info("Obtaining short-lived channel access token");

    const response = await axios.post(
      "https://api.line.me/oauth2/v3/token",
      new URLSearchParams({
        grant_type: "client_credentials",
        client_id: channelId,
        client_secret: channelSecret,
      }),
      {
        headers: {"Content-Type": "application/x-www-form-urlencoded"},
      }
    );

    logger.info("Channel access token obtained successfully");
    return response.data.access_token;
  } catch (error: unknown) {
    const errorObj = error as {message?: string; response?: {data?: unknown}};
    logger.error("Failed to get channel access token", {
      error: errorObj.message,
      data: errorObj.response?.data,
    });
    return null;
  }
};

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

const sendLineMessageToCustomer = async (
  lineUserId: string,
  text: string,
  reservationId: string
): Promise<void> => {
  const messagingToken = process.env.LINE_MESSAGING_CHANNEL_ACCESS_TOKEN;

  if (!messagingToken) {
    logger.warn(
      "LINE_MESSAGING_CHANNEL_ACCESS_TOKEN not configured," +
        " skipping customer push",
      {reservationId}
    );
    return;
  }

  try {
    await axios.post(
      "https://api.line.me/v2/bot/message/push",
      {
        to: lineUserId,
        messages: [{type: "text", text}],
      },
      {
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${messagingToken}`,
        },
      }
    );
    logger.info("LINE push sent to customer", {reservationId, lineUserId});
  } catch (error: unknown) {
    const errorObj = error as {message?: string; response?: {data?: unknown}};
    logger.error("Failed to send LINE push to customer", {
      reservationId,
      lineUserId,
      error: errorObj.message,
      data: errorObj.response?.data,
    });
    // 顧客へのLINE送信失敗は致命的エラーとせず続行
  }
};

/**
 * LINE Messaging API を使って admin_line_users コレクションの全ユーザーに
 * プッシュメッセージを送信する。
 * 環境変数 LINE_MESSAGING_CHANNEL_ACCESS_TOKEN が必要。
 * @param {string} text 送信するテキストメッセージ
 * @param {string} reservationId ログ用の予約ID
 */
const sendLineMessageToAdmins = async (
  text: string,
  reservationId: string
): Promise<void> => {
  const messagingToken = process.env.LINE_MESSAGING_CHANNEL_ACCESS_TOKEN;

  if (!messagingToken) {
    logger.warn(
      "LINE_MESSAGING_CHANNEL_ACCESS_TOKEN not configured, skipping LINE push"
    );
    return;
  }

  const db = admin.firestore();
  const adminLineSnap = await db
    .collection("admin_line_users")
    .where("enabled", "==", true)
    .get();

  if (adminLineSnap.empty) {
    logger.info("No admin LINE user IDs registered in admin_line_users", {
      reservationId,
    });
    return;
  }

  // ドキュメントIDを LINE User ID として使用
  const lineUserIds = adminLineSnap.docs.map((doc) => doc.id);

  try {
    await axios.post(
      "https://api.line.me/v2/bot/message/multicast",
      {
        to: lineUserIds,
        messages: [{type: "text", text}],
      },
      {
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${messagingToken}`,
        },
      }
    );
    logger.info("LINE multicast sent to admins", {
      reservationId,
      adminCount: lineUserIds.length,
    });
  } catch (error: unknown) {
    const errorObj = error as {message?: string; response?: {data?: unknown}};
    logger.error("Failed to send LINE multicast", {
      reservationId,
      error: errorObj.message,
      data: errorObj.response?.data,
    });
    // LINE送信失敗は致命的エラーとせず続行
  }
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
      logger.info("送信先FCMトークンがありません。LINE通知のみ実行します");
    } else {
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
    } // end else (admin_tokens not empty)

    // ── LINE Messaging API でも管理者に通知 ──────────────────────────
    const lineText =
      "🎉 新しい予約が入りました！\n\n" +
      "📅 " + dateStr + "\n" +
      "👤 " + customerName + "様\n" +
      "✂️ " + menuName;
    await sendLineMessageToAdmins(lineText, snap.id);

    // ── 顧客の LINE アカウントにも予約受付確認を送信 ──────────────────
    const customerId = reservation.customer_id;
    if (customerId) {
      const customerDoc = await admin.firestore()
        .collection("customers")
        .doc(customerId)
        .get();
      const lineUserId = customerDoc.data()?.line_user_id;
      if (lineUserId) {
        const confirmText =
          "✅ 予約リクエストを受け付けました\n\n" +
          "📅 " + dateStr + "\n" +
          "✂️ " + menuName + "\n\n" +
          "担当スタッフより確定のご連絡をお待ちください。";
        await sendLineMessageToCustomer(lineUserId, confirmText, snap.id);
      }
    }
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
        // クライアント側から送信されたユーザーアクセストークン
        const userAccessToken = request.data?.lineAccessToken;

        logger.info("LINE deauthorization attempt", {
          userId,
          hasToken: !!userAccessToken,
          tokenLength: userAccessToken?.length || 0,
        });

        if (userAccessToken) {
          // JWTを使ってチャネルアクセストークンを取得
          logger.info("Obtaining channel access token via JWT...");
          const channelAccessToken = await getLineChannelAccessToken();

          if (!channelAccessToken) {
            logger.warn("Failed to obtain channel access token");
          } else {
            logger.info("Channel access token obtained successfully");

            // ユーザーが認可した権限を取り消す
            const deauthorizeResponse = await axios.post(
              "https://api.line.me/user/v1/deauthorize",
              {
                userAccessToken: userAccessToken,
              },
              {
                headers: {
                  "Content-Type": "application/json",
                  "Authorization": `Bearer ${channelAccessToken}`,
                },
              }
            );

            logger.info("LINE authorization revoked successfully", {
              userId,
              status: deauthorizeResponse.status,
              statusText: deauthorizeResponse.statusText,
            });
          }
        } else {
          logger.warn(
            "No LINE access token provided, skipping deauthorization"
          );
        }
      } catch (lineError: unknown) {
        const errorObj = lineError as {
          message?: string;
          response?: {status?: number; data?: unknown};
        };
        logger.error("Failed to revoke LINE authorization", {
          userId,
          error: errorObj.message,
          status: errorObj.response?.status,
          data: errorObj.response?.data,
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

    // リセットURL
    const baseUrl = process.env.APP_URL ||
      "https://liff.line.me/2000207130-jq8XNWKo";
    const resetUrl = `${baseUrl}/reset-password?token=${token}`;

    logger.info("Sending password reset email", {resetUrl});

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
        <div style="font-family: sans-serif; max-width: 600px; 
                    margin: 0 auto; padding: 20px;">
          <h2 style="color: #333;">パスワード再設定のご案内</h2>
          <p>${customerName}様</p>
          <p>パスワード再設定のリクエストを受け付けました。</p>
          <p>以下のボタンからパスワードを再設定してください。</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${resetUrl}" 
               style="background: #667eea; color: white; 
                      padding: 12px 30px; text-decoration: none; 
                      border-radius: 6px; display: inline-block; 
                      font-weight: bold;">
              パスワードを再設定する
            </a>
          </div>
          <p style="font-size: 0.9em; color: #666;">
            またはこちらのURLをコピーしてブラウザに貼り付けてください:<br/>
            <span style="word-break: break-all; color: #667eea;">
              ${resetUrl}
            </span>
          </p>
          <p style="font-size: 0.9em; color: #666;">
            このリンクの有効期限は10分間です。
          </p>
          <p style="font-size: 0.9em; color: #666;">
            ※このメールに心当たりがない場合は、無視してください。
          </p>
          <hr style="margin: 30px 0; border: none; 
                     border-top: 1px solid #eee;">
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

/**
 * トークンを使用してパスワードをリセット
 */
export const resetPasswordWithToken = onCall(
  {
    region: "asia-northeast1",
  },
  async (request) => {
    const {token, newPassword} = request.data;

    if (!token || !newPassword) {
      throw new HttpsError(
        "invalid-argument",
        "token and newPassword are required"
      );
    }

    if (newPassword.length < 6) {
      throw new HttpsError(
        "invalid-argument",
        "Password must be at least 6 characters"
      );
    }

    try {
      // トークンを検証
      const resetQuery = await admin
        .firestore()
        .collection("password_reset_requests")
        .where("token", "==", token)
        .where("used", "==", false)
        .orderBy("created_at", "desc")
        .limit(1)
        .get();

      if (resetQuery.empty) {
        throw new HttpsError(
          "not-found",
          "Invalid or already used token"
        );
      }

      const resetDoc = resetQuery.docs[0];
      const resetData = resetDoc.data();

      // 有効期限チェック
      const expiresAt = resetData.expires_at?.toDate();
      if (!expiresAt || expiresAt < new Date()) {
        throw new HttpsError("deadline-exceeded", "Token has expired");
      }

      const customerId = resetData.customer_id;

      // パスワードを更新
      await admin.auth().updateUser(customerId, {
        password: newPassword,
      });

      // トークンを使用済みにする
      await resetDoc.ref.update({
        used: true,
        used_at: admin.firestore.FieldValue.serverTimestamp(),
      });

      logger.info("Password reset successful", {
        customerId,
        token,
      });

      return {success: true};
    } catch (error: unknown) {
      if (error instanceof HttpsError) {
        throw error;
      }

      const errorObj = error as {message?: string};
      logger.error("Password reset failed", {
        error: errorObj.message,
        token,
      });
      throw new HttpsError("internal", "Failed to reset password");
    }
  }
);
