import test from 'node:test';
import assert from 'node:assert/strict';
import {createSyncDevices} from '../src/syncDevices.js';
import {createMemorySyncStore} from '../src/syncStore.js';
const pc='browser-pc-12345678',phone='browser-phone-12345678',other='browser-other-12345678',proposalId='proposal-1234567890';
test('phone becomes default, manual choice sticks, and accounts/rooms are isolated',async()=>{
 const run=createSyncDevices(createMemorySyncStore());const call=b=>run('user','room',b);
 assert.equal((await call({clientId:pc})).primary,pc);
 assert.equal((await call({clientId:phone,kind:'phone'})).primary,phone);
 assert.equal((await call({clientId:pc,action:'select',expectedPrimary:phone})).primary,pc);
 assert.equal((await call({clientId:other,kind:'phone'})).primary,pc);
 await assert.rejects(call({clientId:phone,action:'select',expectedPrimary:phone}),e=>e.code==='primary_changed');
 assert.equal((await run('another','room',{clientId:other})).primary,other);
 assert.equal((await run('user','another-room',{clientId:phone,kind:'phone'})).primary,phone);
});
test('only main can resolve pending proposals; retries and replacing stale proposals are safe',async()=>{
 const call=createSyncDevices(createMemorySyncStore()),run=b=>call('user','room',b);
 await run({clientId:phone,kind:'phone'});
 const body={clientId:pc,action:'submit',proposalId,plan:{'2026-10-27':{override:'fish'}}};
 await run(body);
 await assert.rejects(run({clientId:pc,action:'resolve',source:pc,proposalId,plan:{'2026-10-27':null}}),e=>e.status===403);
 await assert.rejects(run({clientId:phone,action:'resolve',source:pc,proposalId,plan:{}}),e=>e.code==='incomplete_resolution');
 const resolved=await run({clientId:phone,kind:'phone',action:'resolve',source:pc,proposalId,plan:{'2026-10-27':null}});
 assert.equal(resolved.proposals[pc].status,'resolved');
 assert.equal((await run(body)).proposals[pc].status,'resolved');
 await run({...body,proposalId:'proposal-new-123456789'});
 await assert.rejects(run({clientId:phone,action:'resolve',source:pc,proposalId,plan:{'2026-10-27':null}}),e=>e.code==='proposal_changed');
});
test('simultaneous registrations retain devices and bounded invalid proposals are rejected',async()=>{
 const run=createSyncDevices(createMemorySyncStore());
 await Promise.all([run('u','r',{clientId:pc}),run('u','r',{clientId:phone,kind:'phone'})]);
 const result=await run('u','r',{clientId:phone,kind:'phone'});
 assert.equal(result.primary,phone);assert.equal(Object.keys(result.devices).length,2);
 await assert.rejects(run('u','r',{clientId:'bad'}));
 await assert.rejects(run('u','r',{clientId:pc,action:'submit',proposalId,plan:{oops:{}}}));
});
