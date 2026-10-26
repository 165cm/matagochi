const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");
const path = require("node:path");

// 家族で見ている間の「相手の変更を取りにいく」（shouldPollSync）と、同期の待ち時間。
function app(net) {
 const visibility="visible",busy=false; const storage=new Map();
  const body = { classList: { contains: (c) => busy && c === "cook-mode-open" }, append() {} };
  const ctx = vm.createContext({ console, URL, URLSearchParams, Date, setTimeout:()=>1,clearTimeout(){}, setInterval: () => 0, MATAGOCHI_API_BASE_URL: "https://api.test",
    fetch: async () => ({ ok: true, json: async () => ({}) }),
    localStorage: { getItem: k => storage.get(k)||null, setItem(k,v) {storage.set(k,v)}, removeItem(k) {storage.delete(k)} },
    sessionStorage: { getItem: () => null, setItem() {} },
    location: { reload() {} }, navigator: {}, window: { scrollTo() {},confirm:()=>true },
    document: { visibilityState: visibility, querySelector: () => null, querySelectorAll: () => [], createElement: () => ({ setAttribute() {}, remove() {}, querySelector: () => null }), activeElement: null, body } });
  for (const f of ["dinner-persona.js", "taste.js", "taste-ui.js", "starter-recipes.js", "skills.js", "aisles.js", "lifestyle.js", "profile-talk.js", "talk-ui.js", "daily-ui.js", "playlist-import.js", "household.js", "skill-quiz.js", "cook-level.js", "weekly.js", "cook-type.js", "plan-moves.js", "plus.js", "cook-mode.js", "folders.js", "install.js", "push.js", "tickets.js", "account.js", "discover.js", "app.js"]) {
    let s = fs.readFileSync(path.join(__dirname, "..", f), "utf8");
    if (f === "app.js") s = s.slice(0, s.lastIndexOf('document.querySelectorAll(".tab")'));
    vm.runInContext(s, ctx);
  }
  ctx.network=net;ctx.hash=s=>require("node:crypto").createHash("sha256").update(s).digest("hex");
  vm.runInContext(`state = freshState();state.onboarded=true;state.recipes=[];state.evaluations=[];state.family=["me"];state.sync={roomId:"${"a".repeat(64)}",code:"test-code",lastSyncAt:"",planBase:null,conflicts:{}}; showToast=()=>{};render=()=>{};idbAvailable=false;fetchWithTimeout=network;sha256Hex=async s=>hash(s);saveState=()=>{};`, ctx);
  return { run: (s) => vm.runInContext(s, ctx),ctx,storage };
}
function server() {
 let data=null,revision=0;const requests=[];
 const net=async(url,opts={})=>{
  requests.push(opts.method||'GET');
  if(opts.method==='PUT') {
   const body=JSON.parse(opts.body);
   if(body.baseRevision!==(revision?String(revision):''))return {ok:false,status:409,json:async()=>({})};
   data=structuredClone(body.data);revision++;return {ok:true,status:200,json:async()=>({revision:String(revision)})};
  }
  return {ok:true,status:200,json:async()=>!data?{found:false}:new URL(url).searchParams.get('since')===String(revision)?{found:true,unchanged:true,revision:String(revision)}:{found:true,data:structuredClone(data),revision:String(revision)}};
 };
 return {net,requests,get data(){return data},set data(d){data=structuredClone(d);revision++}};
}
const day='2026-10-26',next='2026-10-27';
const recipe=id=>({id,title:id,mealType:'dinner',ingredients:[],steps:[]});
function setDay(a,date,id){a.run(`state.mealSlots['${date}']={date:'${date}',status:'confirmed',recipe:${JSON.stringify(recipe(id))},updatedAt:'2026-10-26T12:00:00Z'}`)}
function value(a,expr){return JSON.parse(a.run(`JSON.stringify(${expr})`))}

test('different dates merge; same-date concurrent edits wait for a choice without changing the server',async()=>{
 const s=server(),a=app(s.net),b=app(s.net);
 setDay(a,day,'original');assert.equal(await a.run('syncNow({silent:true})'),true);await b.run('syncNow({silent:true})');
 setDay(a,day,'curry');setDay(b,next,'fish');await a.run('syncNow({silent:true})');await b.run('syncNow({silent:true})');await a.run('syncNow({silent:true})');
 assert.equal(value(a,'state.mealSlots')[next].recipe.title,'fish');
 setDay(a,day,'noodles');setDay(b,day,'rice');await a.run('syncNow({silent:true})');
 assert.equal(await b.run('syncNow({silent:true})'),false);assert.equal(s.data.mealSlots[day].recipe.title,'noodles');
 assert.equal(value(b,'state.sync.conflicts')[day].remote.slot.recipe.title,'noodles');
 await b.run(`handleSyncPlanAction('sync-plan-local',{date:'${day}'})`);
 assert.equal(s.data.mealSlots[day].recipe.title,'rice');await a.run('syncNow({silent:true})');assert.equal(value(a,'state.mealSlots')[day].recipe.title,'rice');
});

test('first integration retains both choices and a restorable backup',async()=>{
 const s=server(),a=app(s.net),b=app(s.net);setDay(a,day,'server');await a.run('syncNow({silent:true})');setDay(b,day,'local');
 await b.run('syncNow({silent:true})');assert.equal(Object.keys(value(b,'state.sync.conflicts')).length,1);
 const key=b.run('state.sync.backupKey');assert.equal(JSON.parse(b.storage.get(key)).payload.mealSlots[day].recipe.title,'local');
 await b.run(`handleSyncPlanAction('sync-plan-remote',{date:'${day}'})`);assert.equal(value(b,'state.mealSlots')[day].recipe.title,'server');
 await b.run('restoreIntegrationBackup()');assert.equal(value(b,'state.mealSlots')[day].recipe.title,'local');assert.equal(b.run('syncEnabled()'),false);assert.equal(s.data.mealSlots[day].recipe.title,'server');
});

test('draft removal propagates and cannot resurrect from an unchanged device',async()=>{
 const s=server(),a=app(s.net),b=app(s.net);
 for(const x of [a,b])x.run(`state.recipes=[${JSON.stringify(recipe('draft'))}];`);
 a.run(`state.planOverrides['${day}']='draft'`);await a.run('syncNow({silent:true})');await b.run('syncNow({silent:true})');
 a.run(`delete state.planOverrides['${day}']`);await a.run('syncNow({silent:true})');await b.run('syncNow({silent:true})');
 assert.equal(b.run(`state.planOverrides['${day}']`),undefined);assert.deepEqual(s.data.planOverrides,{});
});

test('a local edit during PUT stays pending and is sent on the next sync',async()=>{
 const s=server();let release,started;const wait=new Promise(r=>started=r);
 const a=app(async(u,o)=>{if(o?.method==='PUT'&&!release){await new Promise(r=>{release=r;started()})}return s.net(u,o)});
 setDay(a,day,'first');const work=a.run('syncNow({silent:true})');await wait;setDay(a,day,'later');release();await work;
 assert.equal(value(a,'state.mealSlots')[day].recipe.title,'later');assert.equal(s.data.mealSlots[day].recipe.title,'first');assert.match(a.run('syncSaveLabel()'),/未送信/);
 await a.run('syncNow({silent:true})');assert.equal(s.data.mealSlots[day].recipe.title,'later');assert.equal(a.run('syncSaveLabel()'),'保存済み');
});

test('backup storage failure blocks integration before fetching or writing shared data',async()=>{
 const s=server(),a=app(s.net);a.run('localStorage.setItem=()=>{throw Error("quota")}');
 assert.equal(await a.run('syncNow({silent:true})'),false);assert.equal(s.requests.length,0);assert.match(a.run('syncRuntimeStatus'),/空き容量/);
});

test('conflicts and merge base survive normalization and clock skew does not choose a winner',()=>{
 const s=server(),a=app(s.net);a.run(`state.sync.planBase={};state.sync.conflicts={'${day}':{local:null,remote:{slot:null,override:'r'}}}`);
 const restored=value(a,'normalizeSyncSettings(state.sync)');assert.deepEqual(restored.planBase,{});assert.ok(restored.conflicts[day]);
 const merged=value(a,`mergePlans({'${day}':{slot:{updatedAt:'2099',recipe:{title:'one'}}}},{'${day}':{slot:{updatedAt:'2000',recipe:{title:'two'}}}}, {})`);assert.ok(merged.conflicts[day]);
});

test('sequential draft edits use content ancestry and deletion-versus-edit asks for confirmation',async()=>{
 const s=server(),a=app(s.net),b=app(s.net);for(const x of [a,b])x.run(`state.recipes=[${JSON.stringify(recipe('one'))},${JSON.stringify(recipe('two'))}]`);
 a.run(`state.planOverrides['${day}']='one'`);await a.run('syncNow({silent:true})');await b.run('syncNow({silent:true})');
 a.run(`state.planOverrides['${day}']='two'`);b.run(`delete state.planOverrides['${day}']`);await a.run('syncNow({silent:true})');await b.run('syncNow({silent:true})');
 assert.ok(value(b,'state.sync.conflicts')[day]);await b.run(`handleSyncPlanAction('sync-plan-local',{date:'${day}'})`);assert.equal(s.data.planOverrides[day],undefined);
});

test('a late response after account logout cannot replace local plans',async()=>{
 let release;const s=server(),a=app(async(u,o)=>{await new Promise(r=>release=r);return s.net(u,o)});
 a.run(`account={email:'me@example.com'};localStorage.setItem('ripigochi-session','token');state.sync.accountEmail=account.email`);
 setDay(a,day,'mine');const work=a.run('syncNow({silent:true})');for(let i=0;i<20&&!release;i++)await new Promise(r=>setImmediate(r));
 a.run('signOutLocal()');release();await work;assert.equal(s.data,null);assert.equal(value(a,'state.mealSlots')[day].recipe.title,'mine');
});

test('same-account reconnection replaces a stale local room and polls even for one person',async()=>{
 const s=server(),a=app(s.net);
 a.run(`account={email:'me@example.com'};localStorage.setItem('ripigochi-session','token');state.onboarded=false;authPost=async()=>({email:'me@example.com',syncCode:'canonical-code',syncManaged:true});deriveSyncRoomId=async()=> '${'b'.repeat(64)}';`);
 assert.equal(await a.run('ensureAccountSync()'),true);
 assert.equal(a.run('state.sync.roomId'),'b'.repeat(64));assert.equal(a.run('state.sync.code'),'canonical-code');assert.equal(a.run('shouldPollSync()'),true);
 a.run('signOutLocal()');assert.equal(a.run('shouldPollSync()'),false);assert.equal(a.run('syncEnabled()'),false);
});

test('account suggestions are stored without turning them into explicit choices',async()=>{
 const s=server(),a=app(s.net);
 a.run(`account={email:'me@example.com'};localStorage.setItem('ripigochi-session','token');state.sync.accountEmail=account.email;state.foodProfile=Lifestyle.profile({completed:true});`);
 await a.run('syncNow({silent:true})');assert.ok(Object.keys(s.data.planDrafts).length);
 assert.equal(a.run('dailyPlan().find(d=>d.candidate).candidate.chosen'),false);
});

test('a write race re-fetches and asks instead of overwriting the other device',async()=>{
 const s=server();let race=false;
 const a=app(async(u,o)=>{
  if(race&&o?.method==='PUT') {race=false;const d=structuredClone(s.data);d.mealSlots[day].recipe=recipe('other-device');s.data=d;}
  return s.net(u,o);
 });
 setDay(a,day,'base');await a.run('syncNow({silent:true})');setDay(a,day,'this-device');race=true;
 assert.equal(await a.run('syncNow({silent:true})'),false);
 assert.equal(s.data.mealSlots[day].recipe.title,'other-device');assert.equal(value(a,'state.sync.conflicts')[day].local.slot.recipe.title,'this-device');
});

test('family invitation remains connected when initial plans need a choice',async()=>{
 const s=server(),a=app(s.net),b=app(s.net);setDay(a,day,'family');await a.run('syncNow({silent:true})');setDay(b,day,'own');
 b.run(`deriveSyncRoomId=async()=> '${'a'.repeat(64)}';refreshTickets=()=>{};linkAccount=()=>{}`);
 assert.equal(await b.run('connectRoom("family-code")'),true);assert.ok(value(b,'state.sync.conflicts')[day]);
});

test('late account reads and link replies cannot restore a signed-out session', async()=>{
 for (const action of ['loadAuth()', 'linkAccount()']) {
  let release,started;const ready=new Promise(r=>started=r);
  const a=app(async url=>{
   if(url.endsWith('/config'))return {ok:true,json:async()=>({})};
   started();return new Promise(r=>release=()=>r({ok:true,json:async()=>({email:'me@example.com'})}));
  });
  a.storage.set('ripigochi-session','session');a.run('account={email:"me@example.com"}');
  const pending=a.run(action);await ready;a.run('signOutLocal()');release();await pending;
  assert.equal(a.run('account'),null);
 }
});
