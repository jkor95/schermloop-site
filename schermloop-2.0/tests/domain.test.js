'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {hasCapacity,normEmail,sanitizeSchedule,isScheduleActive}=require('../domain');
test('one screen license cannot be exceeded',()=>{assert.equal(hasCapacity(1,0),true);assert.equal(hasCapacity(1,1),false);assert.equal(hasCapacity(2,1),true);});
test('emails normalized',()=>assert.equal(normEmail(' TEST@EXAMPLE.COM  '),'test@example.com'));
test('invalid scheduling input sanitized',()=>{
 const x=sanitizeSchedule({enabled:true,days:[1,1,9],on:'99:99',off:'20:30',background:'javascript'});
 assert.deepEqual(x.days,[1]);assert.equal(x.on,'07:30');assert.equal(x.off,'20:30');assert.equal(x.background,'black');
});
test('scheduled playback obeys local time',()=>{
 const s=sanitizeSchedule({enabled:true,days:[1],on:'09:00',off:'17:00'});
 assert.equal(isScheduleActive(s,new Date('2026-11-02T09:00:00Z')),true);
 assert.equal(isScheduleActive(s,new Date('2026-11-02T17:00:00Z')),false);
});
test('overnight schedule stays active after midnight',()=>{
 const s=sanitizeSchedule({enabled:true,days:[1],on:'22:00',off:'02:00'});
 assert.equal(isScheduleActive(s,new Date('2026-11-03T00:00:00Z')),true);
});
