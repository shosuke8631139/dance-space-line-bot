import { Hono } from "hono";
import { findReply } from "./matcher";

// ============================================================
// Cloudflare Workers の環境変数の型定義
// ============================================================
type Bindings = {
  CHANNEL_SECRET: string;
  CHANNEL_ACCESS_TOKEN: string;
  WAITING_USERS: KVNamespace; // 待機メッセージ送信済みユーザー管理
};

const app = new Hono<{ Bindings: Bindings }>();

// 待機メッセージの有効期間（秒）：1時間
const WAITING_TTL_SECONDS = 60 * 60;

// ============================================================
// ヘルスチェック（動作確認用）
// ============================================================
app.get("/", (c) => c.text("LINE Bot is running!"));

// ============================================================
// LINE Webhook エンドポイント
// ============================================================
app.post("/webhook", async (c) => {
  const channelSecret = c.env.CHANNEL_SECRET;
  const accessToken = c.env.CHANNEL_ACCESS_TOKEN;
  const waitingUsers = c.env.WAITING_USERS;

  // リクエストボディを取得
  const body = await c.req.text();

  // ----- 署名検証 -----
  const signature = c.req.header("x-line-signature");
  if (!signature) {
    return c.text("Unauthorized: No signature", 401);
  }

  const isValid = await verifySignature(channelSecret, body, signature);
  if (!isValid) {
    return c.text("Unauthorized: Invalid signature", 401);
  }

  // ----- イベント処理 -----
  const payload = JSON.parse(body);
  const events = payload.events ?? [];

  for (const event of events) {
    // テキストメッセージのみ処理
    if (event.type !== "message" || event.message.type !== "text") {
      continue;
    }

    const userMessage: string = event.message.text;
    const replyToken: string = event.replyToken;
    const userId: string = event.source.userId;

    // キーワードマッチング
    const replyText = findReply(userMessage);

    if (replyText) {
      // ---- キーワード一致 → 自動返信 ----
      await sendReply(accessToken, replyToken, replyText);
    } else {
      // ---- キーワード不一致 → 待機メッセージを1時間に1回だけ送信 ----
      const alreadySent = await waitingUsers.get(userId);

      if (!alreadySent) {
        // 初回のみ待機メッセージを送信し、KVにユーザーIDを記録（1時間後に自動削除）
        await sendReply(
          accessToken,
          replyToken,
          "お問い合わせありがとうございます🙏\n担当者が確認してご返信いたします。\n少々お待ちください⏳"
        );
        await waitingUsers.put(userId, "1", { expirationTtl: WAITING_TTL_SECONDS });
      }
      // 既に待機メッセージを送信済みの場合は何もしない（担当者が手動返信）
    }
  }

  return c.text("OK");
});

// ============================================================
// LINE 署名検証（HMAC-SHA256）
// ============================================================
async function verifySignature(
  channelSecret: string,
  body: string,
  signature: string
): Promise<boolean> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(channelSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signatureBuffer = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(body)
  );

  const expectedSignature = btoa(
    String.fromCharCode(...new Uint8Array(signatureBuffer))
  );

  return expectedSignature === signature;
}

// ============================================================
// LINE Reply API 呼び出し
// ============================================================
async function sendReply(
  accessToken: string,
  replyToken: string,
  text: string
): Promise<void> {
  await fetch("https://api.line.me/v2/bot/message/reply", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      replyToken,
      messages: [{ type: "text", text }],
    }),
  });
}

export default app;
