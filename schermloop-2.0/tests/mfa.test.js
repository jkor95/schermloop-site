'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const mfa=require('../mfa');
const {recoveryHash}=require('../mfa-routes');
test('Authenticator-code klopt met de bekende RFC 6238 testvector',()=>{
 const secret='GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
 assert.equal(mfa.otpAt(secret,59*1000),'287082');
 assert.equal(mfa.verify(secret,'287082',59*1000),true);
 assert.equal(mfa.verify(secret,'287083',59*1000),false);
});
test('2FA-geheim wordt versleuteld en kan alleen met APP_SECRET worden ontsleuteld',()=>{
 const code=mfa.newSecret();
 assert.match(code,/^[A-Z2-7]{32}$/);
 const encrypted=mfa.seal(code,'unieke-lange-app-secret');
 assert.ok(!encrypted.includes(code));
 assert.equal(mfa.open(encrypted,'unieke-lange-app-secret'),code);
 assert.throws(()=>mfa.open(encrypted,'verkeerde-app-secret'));
 assert.match(mfa.uri('beheer@example.test',code),/^otpauth:\/\/totp\//);
});
test('Herstelcode krijgt een herleidbare maar niet-terugleesbare hash',()=>{
 const one=recoveryHash('AABB11223344FF889900','app-secret');
 assert.equal(one,recoveryHash('aabb11223344ff889900','app-secret'));
 assert.notEqual(one,recoveryHash('aabb11223344ff889900','andere-secret'));
 assert.ok(!one.includes('aabb1122'));
});
