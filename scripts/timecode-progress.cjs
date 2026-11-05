// 管理APIの読み取り結果のみを集計。有料処理は呼ばない。
const fs = require('node:fs');
const reasons = { existing_times_invalid: '既存時刻に逆転・重複あり（管理者の点検が必要）', complete: 'すべて補完', partial_or_no_match: '一部補完・一致なし', running: '処理中', daily_limit: '今日の上限', monthly_limit: '月または累計の予算上限', disabled: '停止中', no_eligible_recipes: '今すぐ試せる対象なし', busy: 'ほかの処理が実行中', duration_unknown: '動画の長さが不明', duration_unsupported: '動画が長さの対象外', ai_budget: 'AI全体の利用枠' };
function markdown(data, result = {}) {
  if (!data || !Array.isArray(data.attempts)) return '\n### ⏱ 時刻の補完作業\n\n進捗を取得できませんでした（0件・0円とは扱いません）。\n';
  const attempts = data.attempts.filter(Boolean);
  const videos = new Set(attempts.map(a => a.videoId));
  const improved = new Set(attempts.filter(a => a.improved).map(a => a.videoId));
  const complete = new Set(attempts.filter(a => a.reason === 'complete').map(a => a.videoId));
  const money = v => Number.isFinite(v) ? `${v.toFixed(2)}円` : '不明';
  const reason = result.reason || data.last?.reason;
  const q = data.quality;
  const quality = q && !q.error ? `\n### 補完動画の品質点検\n\n対象：${q.scope}。${q.partial ? '記録の一部のみ。' : ''}\n\n| 項目 | 本数 |\n|---|---:|\n| 点検した動画 | ${q.checked} |\n| 逆転・重複など要点検 | ${q.needsReview} |\n| 時刻の構造検査を通過 | ${q.structurePassed} |\n| 管理者確認済み | ${q.reviewed} |\n| 管理者未確認・再確認 | ${q.unreviewed} |\n| 動画の長さ不明（尺外の検査未実施） | ${q.durationUnknown} |\n\n構造検査の通過は、動画の場面との一致を保証しません。\n` : '\n品質点検：取得できませんでした。\n';
  return quality + `\n### ⏱ 時刻の補完作業\n\n| 項目 | 状況 |\n|---|---:|\n| 設定 | ${data.enabled ? '有効' : '停止'}・${data.pilot ? '試験' : '継続'} |\n| 試験の固定対象（完全な対照群も含む） | ${data.sampleIds?.length ?? '未選定'}品 |\n| 試した動画 | ${videos.size}本 |\n| 時刻が増えた動画 | ${improved.size}本 |\n| すべて補完できた動画 | ${complete.size}本 |\n| 試行回数（再試行を含む） | ${attempts.reduce((n,a) => n + (a.tries || 0), 0)}回 |\n| 今日の処理数（${data.day || '未実行'}） | ${data.recipesToday || 0} / ${data.dailyRecipes}品 |\n| 今月の実測費用（${data.month || '未実行'}） | ${money(data.measuredYen)} |\n| 累計の予算使用額（費用不明の予約も含む） | ${money(data.totalReservedYen)} / ${money(data.totalYen)} |\n| 最終処理日時 | ${data.last?.at || '未実行'} |\n| ${result.done ? '今回の停止理由' : '最後の動画の結果'} | ${reasons[reason] || (reason ? 'その他の失敗・要確認' : '未実行')} |\n\n件数は保存されている各手順版の最新結果です。再試行後に改善なしとなった動画や、手動修正後の状態を表す累積成功数ではありません。${data.next ? ' 記録が上限を超えており、件数は一部です。' : ''}\n`;
}
if (require.main === module) {
  const read = p => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; } };
  const text = markdown(read(process.argv[2]), read(process.argv[3]) || {});
  console.log(text);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, text);
}
module.exports = { markdown };
