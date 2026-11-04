'use strict';
const {test,expect}=require('@playwright/test');
test('loginpagina en presentatie-koppelcode openen zonder browserfout',async({browser})=>{
 const context=await browser.newContext();
 const page=await context.newPage();
 const errors=[];page.on('pageerror',e=>errors.push(String(e)));
 const base=process.env.E2E_BASE_URL||'http://127.0.0.1:3785';
 await page.goto(base+'/');
 await expect(page.locator('#loginForm')).toBeVisible();
 await expect(page.locator('#email')).toBeVisible();
 await expect(page.locator('#password')).toBeVisible();
 const player=await context.newPage();
 player.on('pageerror',e=>errors.push(String(e)));
 await player.goto(base+'/player');
 await expect(player.locator('#pairCodeDisplay')).toHaveText(/^[A-HJ-NP-Z2-9]{10}$/,{timeout:25000});
 expect(errors).toEqual([]);
 await context.close();
});
