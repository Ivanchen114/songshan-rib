import test from 'node:test';
import assert from 'node:assert/strict';
import {mergeW8Entries,w8Pair,w8EntryStatus,w8ProposalState} from '../../workspace/w8-flow.js';
const materials={id:'m',term:'11501',week:8,kind:'w8-materials',test_only:false,archived:false,accepting:false};
const proposal={...materials,id:'p',kind:'w8-proposal',materialsActivityId:'m',accepting:true};
test('one entry retains both stages and their independent availability',()=>{
 const other={...materials,id:'other',kind:'w4',week:4};
 assert.deepEqual(mergeW8Entries([other,proposal,materials]),[other,materials]);
 assert.deepEqual(w8Pair([materials,proposal],materials),{materials,proposal});
 assert.equal(w8EntryStatus([materials,proposal],materials),'抽題未開放 · 交件已開放');
});
test('do not merge unrelated semesters, test scopes, archives, or ambiguous links',()=>{
 for(const changes of [{term:'11401'},{test_only:true},{archived:true},{materialsActivityId:'missing'}]){
  const p={...proposal,...changes};assert.equal(mergeW8Entries([materials,p]).length,2);
 }
 assert.equal(mergeW8Entries([materials,proposal,{...proposal,id:'p2'}]).length,3);
 assert.equal(mergeW8Entries([proposal]).length,1);
});
test('formal and test W8 each have exactly one entry',()=>{
 const m={...materials,id:'mt',test_only:true},p={...proposal,id:'pt',test_only:true,materialsActivityId:'mt'};
 assert.deepEqual(mergeW8Entries([materials,proposal,m,p]).map(a=>a.id),['m','mt']);
});
test('proposal entry explains group prerequisite and does not offer an upload action',()=>{
 const b={activity:proposal,works:[]};
 for(const source of [undefined,{works:[]},{works:[{topic:null}]}]){
  const s=w8ProposalState(b,source);assert.match(s.title,/先完成本組抽題/);assert.equal(s.canStart,false);
 }
});
test('drawn topic does not imply submission; closed and archived submissions cannot start',()=>{
 const source={works:[{topic:'T1'}]},b={activity:proposal,works:[]};
 assert.equal(w8ProposalState(b,source).canStart,true);
 for(const changes of [{accepting:false},{archived:true}])assert.equal(w8ProposalState({...b,activity:{...proposal,...changes}},source).canStart,false);
 const saved=w8ProposalState({...b,works:[{versions:[{id:'v1'}]}]},source);
 assert.match(saved.title,/提案已保存/);assert.equal(saved.canStart,false);
});
