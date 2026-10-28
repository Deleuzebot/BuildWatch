import test from 'node:test';
import assert from 'node:assert/strict';
import { statewideCatalog } from '../server/imports/catalog';
import coverage from '../src/data/northCarolinaCoverage.json';
import { validateProject } from '../src/lib/validate';
import { clusterProjects } from '../src/lib/mapClusters';
import { filterProjects } from '../src/lib/projects';

test('statewide catalog covers qualifying jurisdictions and explicitly qualifies permit evidence', () => {
  assert.equal(coverage.municipalities.length, 24);
  assert.equal(coverage.counties.length, 52);
  assert.equal(statewideCatalog.length, coverage.total);
  assert.equal(new Set(statewideCatalog.map(p => p.id)).size, statewideCatalog.length);
  for (const c of coverage.counties) {
    assert.ok(c.population >= 50000);
    assert.equal(statewideCatalog.filter(p => p.county === c.county).length, c.records);
    assert.ok(filterProjects(statewideCatalog, `${c.county} County`, 'All').length >= c.records);
  }
  for (const c of coverage.municipalities) assert.ok(c.population >= 50000 && c.records > 0);
  for (const p of statewideCatalog) {
    assert.equal(validateProject(p), null, p.id);
    assert.notEqual(p.status, 'Completed');
    assert.ok(p.county && p.sources?.length);
    if (p.evidenceType === 'permit') {
      assert.equal(p.status, 'Approved');
      assert.equal(p.sourceAsOf, '2026-08-10');
      assert.match(p.verificationNote!, /not|unverified/i);
      assert.ok(p.permitNumbers?.length);
      assert.equal(p.homes, 0);
    }
  }
});

test('map clustering reduces statewide markers without losing any record or breaking close-up selection', () => {
  const groups = clusterProjects(statewideCatalog, 7);
  assert.ok(groups.length < statewideCatalog.length / 3);
  const ids = groups.flatMap(g => g.projects.map(p => p.id));
  assert.equal(new Set(ids).size, statewideCatalog.length);
  assert.equal(ids.length, statewideCatalog.length);
  const detail = clusterProjects(statewideCatalog.slice(0,100), 17);
  assert.equal(detail.length, 100);
  assert.ok(detail.every(g => g.projects.length === 1));
});
