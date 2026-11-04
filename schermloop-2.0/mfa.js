'use strict';
const crypto=require('node:crypto');
const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function encode(bytes){
 let bits=0,value=0,out='';
 for(const b of bytes){value=(value<<8)|b;bits+=8;while(bits>=5){out+=alphabet[(value>>>(bits-=5))&31];}}
 if(bits)out+=alphabet[(value<<(5-bits))&31];
 return out;
}
function decode(text){
 const s=String(text||'').toUpperCase().replace(/\s+/g,'');
 if(!/^[A-Z2-7]{32}$/.test(s))throw Error('Ongeldige authenticatorsleutel.');
 let bits=0,value=0,result=[];
 for(const ch of s){value=(value<<5)|alphabet.indexOf(ch);bits+=5;if(bits>=8){result.push((value>>>(bits-=8))&255);}}
 return Buffer.from(result);
}
function newSecret(){return encode(crypto.randomBytes(20));}
function otpAt(secret,time=Date.now()){
 const key=decode(secret),counter=Math.floor(time/30000),buf=Buffer.alloc(8);
 buf.writeBigUInt64BE(BigInt(counter));
 const h=crypto.createHmac('sha1',key).update(buf).digest(),offset=h[h.length-1]&15;
 const code=(h.readUInt32BE(offset)&0x7fffffff)%1000000;
 return String(code).padStart(6,'0');
}
function verify(secret,code,now=Date.now()){
 if(typeof code!=='string'||!/^[0-9]{6}$/.test(code))return false;
 const supplied=Buffer.from(code);
 return [-1,0,1].some(delta=>crypto.timingSafeEqual(supplied,Buffer.from(otpAt(secret,now+delta*30000))));
}
function keyFromAppSecret(value){return crypto.createHash('sha256').update(String(value)).digest();}
function seal(secret,appSecret){
 const iv=crypto.randomBytes(12),key=keyFromAppSecret(appSecret);
 const cipher=crypto.createCipheriv('aes-256-gcm',key,iv),data=Buffer.concat([cipher.update(secret,'utf8'),cipher.final()]);
 return [iv.toString('base64url'),cipher.getAuthTag().toString('base64url'),data.toString('base64url')].join('.');
}
function open(sealed,appSecret){
 const parts=String(sealed||'').split('.');
 if(parts.length!==3)throw Error('Ongeldige beveiligde opslag.');
 const decipher=crypto.createDecipheriv('aes-256-gcm',keyFromAppSecret(appSecret),Buffer.from(parts[0],'base64url'));
 decipher.setAuthTag(Buffer.from(parts[1],'base64url'));
 return Buffer.concat([decipher.update(Buffer.from(parts[2],'base64url')),decipher.final()]).toString('utf8');
}
function uri(email,secret){
 return 'otpauth://totp/'+encodeURIComponent('SchermLoop 2.0:'+email)+'?secret='+encodeURIComponent(secret)+'&issuer='+encodeURIComponent('SchermLoop 2.0')+'&algorithm=SHA1&digits=6&period=30';
}
module.exports={newSecret,otpAt,verify,seal,open,uri};
