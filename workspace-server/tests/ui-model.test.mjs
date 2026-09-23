import test from 'node:test';
import assert from 'node:assert/strict';
import {matchesWork,missingStudents,studentNext,phaseLabel} from '../../workspace/ui-model.js';
const work=(id,uploaded=true)=>({id,versions:uploaded?[{ordinal:1}]:[],members:[{student_id:id,seat:1,name:'示範學生',status:'confirmed'}],feedback:[],decisions:[],grades:[],publications:[]});
const board={activity:{kind:'w4',phase:'review',accepting:true,testOnly:false},works:[work('1'),work('2',false)],reviews:[],invitations:[]};
test('UI missing roster includes students who never created a work; excludes invited/test/inactive',()=>{
 const w=work('1');w.members.push({student_id:'2',status:'invited'});
 const roster=['1','2','3','4','5'].map(student_id=>({student_id,active:student_id!=='4',is_test:student_id==='5'}));
 assert.deepEqual(missingStudents(roster,{...board,works:[w]}).map(s=>s.student_id),['2','3']);
 w.members[1].status='confirmed';assert.deepEqual(missingStudents(roster,{...board,works:[w]}).map(s=>s.student_id),['3']);
});
test('UI filters combine search with status and do not count waiting assignments as unpaired',()=>{
 assert.equal(matchesWork(board.works[0],board,'feedback','示範'),true);
 assert.equal(matchesWork(board.works[1],board,'feedback'),false);
 assert.equal(matchesWork(board.works[0],board,'feedback','不存在'),false);
 assert.equal(matchesWork(board.works[0],{...board,reviews:[{target_work_id:'1',status:'waiting'}]},'unpaired'),false);
 assert.equal(matchesWork({...board.works[0],grades:[{status:'draft'}]},board,'ungraded'),true);
 assert.equal(matchesWork({...board.works[0],grades:[{status:'graded'}]},board,'ungraded'),false);
});
test('UI student next action distinguishes closed activities from migration read-only activities',()=>{
 assert.match(studentNext({...board,activity:{...board.activity,archived:true}})[0],/封存/);
 const closed={...board,activity:{...board.activity,accepting:false}};
 assert.match(studentNext(closed)[0],/尚未開放交件/);
 assert.match(studentNext({...closed,invitations:[{}]})[0],/尚未開放交件/);
 assert.match(studentNext(closed,{acceptanceOnly:true})[0],/搬遷資料/);
 assert.match(studentNext({...closed,activity:{...closed.activity,testOnly:true}},{acceptanceOnly:true})[0],/尚未開放交件/);
 assert.match(phaseLabel(closed.activity,{acceptanceOnly:true}),/搬遷資料/);
 assert.equal(phaseLabel({...closed.activity,testOnly:undefined,test_only:true},{acceptanceOnly:true}),'尚未開放交件');
 assert.equal(phaseLabel({...closed.activity,archived:true},{acceptanceOnly:true}),'已封存');
 assert.match(studentNext({...board,invitations:[{}]})[0],/名單更新/);
 assert.match(studentNext({...board,reviews:[{status:'assigned'}]})[0],/初讀等你/);
 assert.match(studentNext({...board,activity:{...board.activity,phase:'exhibit'},reviews:[{status:'assigned'}]})[0],/初讀等你/);
});
