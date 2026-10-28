import{test}from'node:test';import assert from'node:assert/strict';
import{administratorStep,normalizeAuthenticatorCode}from'../src/account/adminSetup';
test('administrator setup resumes primary and requires one authenticator and ownership proof',()=>{
 assert.equal(administratorStep(false,0,false,false),'password');
 assert.equal(administratorStep(true,0,false,false),'primary');
 assert.equal(administratorStep(true,1,false,false),'verify');
 assert.equal(administratorStep(true,1,true,false),'link');
 assert.equal(administratorStep(true,2,true,false),'link');
 assert.equal(administratorStep(true,2,true,true),'ready');
 assert.equal(administratorStep(true,2,false,true),'verify');
});
test('pasted authenticator code accepts whitespace without discarding other characters',()=>{
 assert.equal(normalizeAuthenticatorCode(' 123 456\n'),'123456');assert.equal(normalizeAuthenticatorCode('123x456'),'123x456');
});
