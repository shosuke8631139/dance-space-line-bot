// ============================================================
// キーワードマッチングロジック
// 大文字/小文字、ひらがな/カタカナの揺らぎを吸収します
// ============================================================

import { responses, ResponseEntry } from "./responses";

/**
 * カタカナ → ひらがな に変換
 */
function katakanaToHiragana(str: string): string {
  return str.replace(/[\u30A1-\u30F6]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) - 0x60)
  );
}

/**
 * テキストを正規化（小文字化 + カタカナ→ひらがな）
 */
function normalize(text: string): string {
  return katakanaToHiragana(text.toLowerCase());
}

/**
 * メッセージにキーワードが含まれるか検索し、対応する返信を返す
 * @returns マッチした返信文、なければ null
 */
export function findReply(message: string): string | null {
  const normalizedMessage = normalize(message);

  for (const entry of responses) {
    for (const keyword of entry.keywords) {
      if (normalizedMessage.includes(normalize(keyword))) {
        return entry.reply;
      }
    }
  }

  // ============================================================
  // 将来AI応答を組み込む場合はここに追加
  // 例:
  // const aiReply = await askAI(message);
  // return aiReply;
  // ============================================================

  return null; // マッチなし → 手動返信モード
}
