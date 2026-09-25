import {test} from 'node:test';
import assert from 'node:assert/strict';
import {judgmentStatus} from '../../workspace/ai-judgment-ui.js';
test('teacher distinguishes actionable missing responses from unavailable or reminder-only material',()=>{
 assert.equal(judgmentStatus([]),'尚無已發布的甲乙留言');
 assert.equal(judgmentStatus([{status:'draft',has_pair:true}]),'尚無已發布的甲乙留言');
 assert.equal(judgmentStatus([{status:'published',has_pair:false}]),'先處理圖卡提醒');
 assert.equal(judgmentStatus([{status:'published',has_pair:true}]),'尚未保存');
 assert.equal(judgmentStatus([],{status:'submitted'}),'已送出');
 assert.equal(judgmentStatus([],{status:'draft'}),'草稿');
});
