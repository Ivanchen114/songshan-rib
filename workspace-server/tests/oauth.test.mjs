import test from 'node:test';
import assert from 'node:assert/strict';
import {handler} from '../http.mjs';
import {fixture} from './support.mjs';
import {sha} from '../security.mjs';

const origin='https://workspace.example.invalid';
function enableGoogle(t){const previous=process.env.RIB_GOOGLE_ENABLED;process.env.RIB_GOOGLE_ENABLED='true';t.after(()=>{if(previous===undefined)delete process.env.RIB_GOOGLE_ENABLED;else process.env.RIB_GOOGLE_ENABLED=previous;});}
async function request(app,action,cookie='',method='GET') {
  const headers={},res={statusCode:200,setHeader:(k,v)=>headers[k]=v,writeHead:(status,h)=>{res.statusCode=status;Object.assign(headers,h);},end:body=>{res.body=body;}};
  await app({url:'/api/workspace?action='+action,method,headers:{cookie,origin,'content-type':'application/json'},body:{},socket:{remoteAddress:'127.0.0.1'}},res);
  return {...res,headers};
}
function fakeAuth(user) {
  return (_url,_key,{auth:{storage}})=>({auth:{
    signInWithOAuth:async({provider,options})=>{
      assert.equal(provider,'google');assert.equal(options.redirectTo,origin+'/api/workspace?action=teacher-callback');
      storage.setItem('pkce-verifier','test-private-verifier');return {data:{url:'https://accounts.example.invalid/authorize'}};
    },
    exchangeCodeForSession:async code=>{
      assert.equal(code,'valid-code');assert.equal(storage.getItem('pkce-verifier'),'test-private-verifier');
      return {data:{session:{access_token:'test-access-token',user:{email:'teacher@example.invalid'}}}};
    },
    getUser:async token=>{assert.equal(token,'test-access-token');return {data:{user}};}
  }});
}
async function begin(app){const res=await request(app,'teacher-start');assert.equal(res.statusCode,302);assert.match(res.headers['Set-Cookie'],/HttpOnly; SameSite=Lax; Max-Age=600; Secure/);return res.headers['Set-Cookie'].split(';')[0];}

test('teacher OAuth restores PKCE, checks verified identity and live teacher access, and consumes callback once',async t=>{
  enableGoogle(t);const f=await fixture(1);t.after(f.close);
  const app=handler({...f,origin,rateSecret:'test-only',authClientFactory:fakeAuth({email:'TEACHER@example.invalid',email_confirmed_at:'2026-09-23'})});
  const oauth=await begin(app),res=await request(app,'teacher-callback&code=valid-code',oauth);
  assert.equal(res.statusCode,302);assert.equal(res.headers.Location,'/workspace/');
  const sessionCookie=res.headers['Set-Cookie'].find(x=>x.startsWith('rib_session=')).split(';')[0];
  assert.equal((await request(app,'home',sessionCookie)).statusCode,200);
  assert.equal((await request(app,'teacher-callback&code=valid-code',oauth)).statusCode,401);
  await f.db.query("update rib.teachers set active=false where email='teacher@example.invalid'");
  assert.equal((await request(app,'home',sessionCookie)).statusCode,403);
});

test('teacher OAuth refuses unknown or unconfirmed identities, expired state, POST callbacks and disabled login',async t=>{
  enableGoogle(t);const f=await fixture(1);t.after(f.close);
  for(const user of [{email:'outsider@example.invalid',email_confirmed_at:'2026-09-23'},{email:'teacher@example.invalid',email_confirmed_at:null}]){
    const app=handler({...f,origin,rateSecret:'test-only',authClientFactory:fakeAuth(user)}),oauth=await begin(app);
    const denied=await request(app,'teacher-callback&code=valid-code',oauth);assert.equal(denied.statusCode,403);assert.equal(denied.headers['Set-Cookie'],undefined);
  }
  const app=handler({...f,origin,rateSecret:'test-only',authClientFactory:fakeAuth({email:'teacher@example.invalid',email_confirmed_at:'2026-09-23'})}),oauth=await begin(app);
  assert.equal((await request(app,'teacher-callback&code=valid-code',oauth,'POST')).statusCode,405);
  await f.db.query("update rib.sessions set expires_at=now()-interval '1 second' where token_hash=$1",[sha(oauth.split('=')[1])]);
  assert.equal((await request(app,'teacher-callback&code=valid-code',oauth)).statusCode,401);
  process.env.RIB_GOOGLE_ENABLED='false';assert.equal((await request(app,'teacher-start')).statusCode,503);assert.equal((await request(app,'teacher-callback&code=valid-code',oauth)).statusCode,503);
  assert.equal((await f.db.query("select count(*)::integer as n from rib.sessions where principal->>'role' in ('teacher','admin')"))[0].n,0);
});

test('teacher sign-in limits repeated starts before creating unlimited OAuth sessions',async t=>{
  enableGoogle(t);const f=await fixture(1);t.after(f.close);
  const app=handler({...f,origin,rateSecret:'test-only',authClientFactory:fakeAuth({})});
  for(let i=0;i<20;i++)await begin(app);
  assert.equal((await request(app,'teacher-start')).statusCode,429);
  assert.equal((await f.db.query('select count(*)::integer as n from rib.sessions'))[0].n,20);
});
