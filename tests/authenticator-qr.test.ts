import test from'node:test';
import assert from'node:assert/strict';
import{authenticatorQrSource}from'../src/account/authenticatorQr';
const svg='<svg xmlns="http://www.w3.org/2000/svg" width="220" height="220"><path fill="#fff" d="M0 0h220v220H0z"/><path fill="#000" d="M10 10h20v20H10z"/></svg>';
test('raw and SDK-prefixed SVG keep colour hashes inside the image payload',()=>{
 for(const value of[svg,'data:image/svg+xml;utf-8,'+svg,'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg)]){const uri=authenticatorQrSource(value);assert.equal(new URL(uri).hash,'');assert.equal(decodeURIComponent(uri.slice(uri.indexOf(',')+1)),svg);}
});
test('base64 SVG stays intact and invalid input does not leak enrollment content',()=>{
 const uri='data:image/svg+xml;base64,'+Buffer.from(svg).toString('base64');assert.equal(authenticatorQrSource(uri),uri);assert.throws(()=>authenticatorQrSource('private-invalid-fixture'),e=>e instanceof Error&&!e.message.includes('fixture'));
});
