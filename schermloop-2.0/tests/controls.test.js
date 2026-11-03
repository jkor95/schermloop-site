'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {identifyKey,shouldResume}=require('../public/controls');
const event=(key,other={})=>({key,target:{tagName:'BODY',isContentEditable:false},...other});
test('USB clicker: next and previous slide keys',()=>{
 for(const k of ['ArrowRight','PageDown',' ','Enter'])assert.equal(identifyKey(event(k)),'next');
 for(const k of ['ArrowLeft','PageUp','Backspace'])assert.equal(identifyKey(event(k)),'previous');
});
test('presentation shortcuts',()=>{
 assert.equal(identifyKey(event('Home')),'first');
 assert.equal(identifyKey(event('End')),'last');
 assert.equal(identifyKey(event('m')),'toggle');
 assert.equal(identifyKey(event('Escape')),'automatic');
});
test('never intercept typing or focused control buttons',()=>{
 for(const tagName of ['INPUT','TEXTAREA','SELECT','BUTTON']){
  assert.equal(identifyKey(event('Enter',{target:{tagName,isContentEditable:false}})),null);
 }
 assert.equal(identifyKey(event(' ',{target:{tagName:'DIV',isContentEditable:true}})),null);
 assert.equal(identifyKey(event('PageDown',{ctrlKey:true})),null);
 assert.equal(identifyKey(event('ArrowRight',{repeat:true})),null);
});
test('manual mode returns to loop after 30 minutes of inactivity',()=>{
 assert.equal(shouldResume(1000,1000+29*60*1000),false);
 assert.equal(shouldResume(1000,1000+30*60*1000),true);
 assert.equal(shouldResume(0,10000000),false);
});
