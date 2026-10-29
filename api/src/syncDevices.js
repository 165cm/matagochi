import { createHash } from 'node:crypto';
import { ApiError } from './errors.js';
const validId = x => typeof x === 'string' && /^[a-zA-Z0-9_-]{16,80}$/.test(x);
const fail = (code, message, status=400) => { throw new ApiError(status, code, message); };
function plans(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length > 100 || JSON.stringify(value).length > 1_000_000) fail('invalid_plans', '献立の確認データが大きすぎるか、形式が違います。');
  for (const [date, plan] of Object.entries(value)) if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || (plan !== null && (typeof plan !== 'object' || Array.isArray(plan)))) fail('invalid_plans', '献立の確認データを確かめてください。');
  return value;
}
// 同じアカウントのブラウザを識別する。家族の役割・1日の上限の端末IDとは独立。
export function createSyncDevices(store) {
  return async (uid, code, body = {}) => {
    if (!code) fail('sync_not_ready', '先にアカウントの共有へ接続してください。', 409);
    if (!validId(body.clientId)) fail('invalid_device', '端末を登録できませんでした。開き直してください。');
    const key = `auth/devices/${uid}/${createHash('sha256').update(code).digest('hex')}`;
    for (let retry=0;retry<5;retry++) {
      const entry=await store.get(key);
      const state=structuredClone(entry?.envelope || { primary:'', explicit:false, devices:{}, proposals:{} });
      const id=body.clientId, kind=body.kind==='phone'?'phone':'computer';
      const known=state.devices[id];
      let dirty=false;
      if (!known) {
        if (Object.keys(state.devices).length>=20) fail('devices_full','登録端末が上限に達しました。',409);
        state.devices[id]={kind, label:kind==='phone'?'スマホ':'PC・タブレット'};dirty=true;
      }
      if (!state.primary || (!state.explicit && kind==='phone' && state.devices[state.primary]?.kind!=='phone')) {state.primary=id;dirty=true;}
      const action=body.action || 'register';
      if (action==='select') {
        if (body.expectedPrimary!==state.primary) fail('primary_changed','別の端末でメイン端末が変わりました。もう一度確かめてください。',409);
        state.primary=id;state.explicit=true;dirty=true;
      } else if (action==='withdraw') {
        delete state.proposals[id];dirty=true;
      } else if (action==='submit') {
        if (!validId(body.proposalId)) fail('invalid_proposal','確認の番号が正しくありません。');
        const plan=plans(body.plan), old=state.proposals[id];
        if (!old || old.id!==body.proposalId) {state.proposals[id]={id:body.proposalId,plan,status:'pending'};dirty=true;}
      } else if (action==='resolve') {
        if (state.primary!==id) fail('main_device_required','メイン端末で献立を確かめてください。',403);
        const p=state.proposals[body.source];
        if (!p || p.id!==body.proposalId) fail('proposal_changed','確認する献立が変わりました。もう一度確かめてください。',409);
        const result=plans(body.plan);
        if (Object.keys(p.plan).some(date=>!Object.hasOwn(result,date))) fail('incomplete_resolution','すべての日の献立を選んでください。');
        if (p.status!=='resolved') {p.status='resolved';p.result=result;dirty=true;}
      } else if (action!=='register') fail('invalid_device_action','端末の操作を確かめてください。');
      if (!dirty || await store.put(key,state,{ifGeneration:entry?.generation??0})) return state;
    }
    fail('devices_busy','端末の接続が重なりました。もう一度お試しください。',409);
  };
}
