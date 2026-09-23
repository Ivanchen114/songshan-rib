import test from 'node:test';
import assert from 'node:assert/strict';
import {planReaders} from '../reader-allocation.mjs';
const data=n=>({students:Array.from({length:n},(_,i)=>({student_id:String(i),seat:i+1,name:'虛構'+i})),works:Array.from({length:n},(_,i)=>({id:'w'+i,owner_id:String(i)}))});
test('odd rosters have complete directed reading assignments without self or duplicate readers',()=>{
 for(const n of [3,5,35])for(let i=0;i<15;i++){const {students,works}=data(n),p=planReaders(students,works,[],new Map());assert.equal(p.matches.size,n);assert.equal(new Set(p.matches.values()).size,n);for(const [wid,sid]of p.matches)assert.notEqual(works.find(w=>w.id===wid).owner_id,sid);}
});
test('one participant and exhausted previously seen pairs report exact unfilled targets',()=>{
 const {students,works}=data(1);assert.match(planReaders(students,works,[],new Map()).unmatched[0].reason,/沒有其他/);
 const d=data(2),p=planReaders(d.students,d.works,[{target_work_id:'w0',reviewer_id:'1',status:'cancelled'},{target_work_id:'w1',reviewer_id:'0',status:'cancelled'}],new Map());assert.equal(p.matches.size,0);assert.equal(p.unmatched.length,2);assert.match(p.unmatched[0].reason,/換件紀錄/);
});
test('reassign augmentation across ready and waiting targets avoids a preventable gap',()=>{
 // Reader 2 can read only ready w0; reader 1 can read either w0 or waiting w2.
 const {students,works}=data(3);for(let i=0;i<30;i++){const p=planReaders(students,works,[{target_work_id:'w1',reviewer_id:'0',status:'done'},{target_work_id:'w2',reviewer_id:'0',status:'cancelled'}],new Map([['w0','v0']]));assert.equal(p.matches.size,2);assert.equal(p.matches.get('w0'),'2');assert.equal(p.matches.get('w2'),'1');}
});
test('submitted work wins scarcity, ongoing and completed work survive, one extra at a time',()=>{
 const {students,works}=data(5),reviews=[{target_work_id:'w0',reviewer_id:'1',status:'done'},{target_work_id:'w1',reviewer_id:'0',status:'assigned'},{target_work_id:'w2',reviewer_id:'3',status:'assigned'}];
 const p=planReaders(students,works,reviews,new Map([['w4','v4']]));assert.ok(p.matches.has('w4'));assert.equal(p.matches.size,2);assert.equal(p.releasing.length,0);assert.equal(new Set(p.matches.values()).size,2);assert.ok(![...p.matches.values()].some(s=>['0','3'].includes(s)));
});
test('absent unfinished reader is replaced while absent completed feedback is retained',()=>{
 const {students,works}=data(4),reviews=[{id:'r0',target_work_id:'w0',reviewer_id:'1',status:'assigned'},{id:'r2',target_work_id:'w2',reviewer_id:'1',status:'done'}];
 const p=planReaders(students,works,reviews,new Map([['w0','v0']]),['1']);assert.ok(p.matches.has('w0'));assert.deepEqual(p.releasing.map(r=>r.id),['r0']);assert.ok(!p.matches.has('w2'));assert.ok(!p.matches.has('w1'));assert.ok(![...p.matches.values()].includes('1'));
});
