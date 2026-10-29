import test from 'node:test';import assert from 'node:assert/strict';import {shadowPlan,requireShadowProfile} from '../server/maintenance/shadow-plan';import {readFileSync} from 'node:fs';
test('NC shadow plan remains inactive and refuses unaffordable four-run claims',()=>{
 const p=shadowPlan(23,new Date('2026-10-29T16:00:00Z'));assert.equal(p.state,'NC');assert.equal(p.scheduleEnabled,false);assert.equal(p.publication,false);assert.equal(p.archiving,false);assert.equal(p.budget.maximumFullyReservedRuns,1);assert.equal(p.budget.fourRunsFitCurrentAllowance,false);assert.equal(p.proposedSchedule.nextUnactivatedSlot,'2026-10-30T09:17:00.000Z');assert.equal(shadowPlan(64).budget.fourRunsFitCurrentAllowance,true);assert.throws(()=>shadowPlan(-1));
});
test('planned local time survives daylight saving and full research cannot be mislabeled',()=>{
 assert.equal(shadowPlan(23,new Date('2026-10-31T12:00:00Z')).proposedSchedule.nextUnactivatedSlot,'2026-11-06T10:17:00.000Z');requireShadowProfile('structured-feeds');assert.throws(()=>requireShadowProfile('evidence-research'),/not ready/);assert.throws(()=>requireShadowProfile('nationwide'),/Unknown/);
 const workflow=readFileSync('.github/workflows/nc-shadow.yml','utf8');assert.doesNotMatch(workflow,/^\s*schedule:/m);assert.match(workflow,/BW_ALLOW_LIVE_WRITES: 'false'/);assert.match(workflow,/BW_AI_ENABLED: 'false'/);
});
