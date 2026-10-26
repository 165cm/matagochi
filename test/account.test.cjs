const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
function app(extra={}) {
 const store=new Map(),timers=[],scripts=[],messages=[];
 const target={childElementCount:0,clientWidth:320};
 const ctx=vm.createContext({console,URL,URLSearchParams,Date,Math,location:{href:'https://165cm.github.io/matagochi/',search:''},navigator:{userAgent:'iPhone',standalone:true},
 localStorage:{getItem:k=>store.get(k),setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)},
 setTimeout:(fn)=>{timers.push(fn);return timers.length;},clearTimeout(){},
 document:{querySelector:()=>target,createElement:()=>({remove(){}}),head:{append:s=>scripts.push(s)}},
 state:{view:'settings',onboarded:true,sync:{},family:[]},API_BASE_URL:'https://api.test',render(){},showToast:s=>messages.push(s),
 escapeHtml:String,escapeAttr:String,deviceKey:()=> 'device-123456',refreshTickets(){},saveState(){},
 fetchWithTimeout:async()=>({ok:true,json:async()=>({})}),...extra});
 vm.runInContext(fs.readFileSync(require.resolve('../account.js'),'utf8'),ctx);
 return {ctx,run:s=>vm.runInContext(s,ctx),timers,scripts,store,messages,target};
}
test('iPhone home app offers Safari transfer even with email disabled',()=>{
 const a=app();a.run('authConfig={google:"client",email:false}');
 assert.match(a.run('renderAccountPanel()'),/Safariから引き継ぐ/);
 assert.match(a.run('renderAccountPanel()'),/login-transfer=1/);
 assert.doesNotMatch(a.run('renderAccountPanel()'),/コードを送る/);
});
test('transfer page never links the Safari device or restores household before issuing code',async()=>{
 const a=app({location:{href:'https://app.test/?login-transfer=1',search:'?login-transfer=1'},connectRoom(){throw Error('must not restore');},fetchWithTimeout(){throw Error('must not link');}});
 await a.run('afterSignIn({token:"session",account:{email:"me@example.com",deviceId:"old-device",syncCode:"family"}})');
 assert.equal(a.store.get('ripigochi-session'),'session');assert.equal(a.store.get('ripigochi-device-id'),undefined);
 assert.match(a.run('renderAccountPanel()'),/引き継ぎコードを発行/);
});
test('stalled GIS script times out and can be retried',async()=>{
 const a=app();const p=a.run('loadGis()');const rejected=assert.rejects(p,/読み込めません/);a.timers[0]();await rejected;
 const retry=a.run('loadGis()');assert.equal(a.scripts.length,2);a.ctx.google={accounts:{id:{}}};a.scripts[1].onload();await retry;
});
test('Google button state prevents accepting an old popup after timeout',async()=>{
 let config,button;
 const a=app({google:{accounts:{id:{initialize:c=>config=c,renderButton:(el,c)=>button=c}}}});
 a.run('authConfig={google:"client"}');await a.run('mountGoogleButton()');
 button.click_listener();assert.equal(a.run('googleAuthPending()'),true);
 const old=button.state;a.run('googleWaitUntil=1;googleWaitExpired()');assert.match(a.run('authMessage'),/戻りませんでした/);
 a.run('signInWithGoogle=()=>{throw Error("stale callback")}');config.callback({state:old,credential:'old'});
});
test('linkAccount uses a bounded request and failures release authBusy',async()=>{
 let timeout;
 const a=app({fetchWithTimeout:async(url,opts,ms)=>{if(url.endsWith('/google'))return {ok:true,json:async()=>({token:'session',account:{email:'me@example.com'}})};timeout=ms;throw Error('timeout');}});
 a.run("ensureAccountSync=async()=>false");
 await a.run('signInWithGoogle("credential")');assert.equal(timeout,10000);assert.equal(a.run('authBusy'),false);assert.equal(a.run('account.email'),'me@example.com');
});
