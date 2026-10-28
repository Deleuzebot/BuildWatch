import test from 'node:test';import assert from 'node:assert/strict';import{caryApplicationId}from'../server/research/identifiers';
test('Cary source matching requires the complete official application number, not a numeric suffix',()=>{
 const url=(id:string)=>'https://data.townofcary.org/api/explore/v2.1/catalog/datasets/developments/records?'+new URLSearchParams({where:`applicationnumber='${id}'`,limit:'100'});
 assert.equal(caryApplicationId(url('27-DP-0122')),'27-DP-0122');assert.notEqual(caryApplicationId(url('27-DP-0122')),'0122');assert.equal(caryApplicationId(url('0122')),'0122');assert.equal(caryApplicationId(url('25-DP-6236')),'25-DP-6236');assert.equal(caryApplicationId(url('25-DP-6236').replace('data.townofcary.org','example.org')),undefined);assert.equal(caryApplicationId('https://data.townofcary.org/api/explore/v2.1/catalog/datasets/developments/records?where=1%3D1'),undefined);
});
