import assert from "node:assert/strict";
import test from "node:test";
import { projects, statuses } from "../src/data/projects";
import { filterProjects, upcomingMeetings } from "../src/lib/projects";
test("search and status filters combine, ignoring whitespace and case", () => {
  assert.deepEqual(
    filterProjects(projects, " RIVER ", "In review").map((p) => p.id),
    ["river"],
  );
  assert.equal(filterProjects(projects, "river", "Completed").length, 0);
  assert.equal(filterProjects(projects, "zzzz", "All").length, 0);
});
test("agenda excludes past meetings and orders upcoming meetings", () => {
  const dates = upcomingMeetings(projects, 0).map((m) =>
    Date.parse(m.startsAt),
  );
  assert.deepEqual(
    dates,
    [...dates].sort((a, b) => a - b),
  );
  assert.equal(upcomingMeetings(projects, Number.MAX_SAFE_INTEGER).length, 0);
});
test("sample data has unique identifiers, valid map coordinates and every status", () => {
  assert.equal(new Set(projects.map((p) => p.id)).size, projects.length);
  assert.deepEqual(new Set(projects.map((p) => p.status)), new Set(statuses.filter(s=>!["Cancelled","On hold"].includes(s))));
  for (const p of projects) {
    assert.ok(Math.abs(p.latitude) <= 90 && Math.abs(p.longitude) <= 180);
  }
  const meetings = projects.flatMap((p) => p.meetings);
  assert.equal(new Set(meetings.map((m) => m.id)).size, meetings.length);
});

test('North Carolina coverage is sourced, valid, and city/category filters combine', async () => {
  const { northCarolinaProjects: records } = await import('../src/data/northCarolina');
  const { validateProject } = await import('../src/lib/validate');
  assert.equal(records.length, 80);
  assert.equal(new Set(records.map(p => p.id)).size, records.length);
  for (const city of ['Chapel Hill', 'Raleigh', 'Durham', 'Greensboro']) {
    assert.equal(filterProjects(records, '', 'All', city).length, 20);
  }
  assert.equal(filterProjects(records, '', 'Under construction', 'Greensboro', 'Civic')[0].id, 'nc-gr-windsor-chavis');
  assert.equal(filterProjects(records, 'durham', 'All').length, 20);
  for (const p of records) {
    assert.equal(validateProject(p), null);
    assert.ok(p.sources?.length);
    assert.equal(p.state, 'NC');
    assert.notEqual(p.status, 'Completed');
    assert.ok(!p.archived);
    assert.ok(p.latitude > 35 && p.latitude < 37 && p.longitude > -81 && p.longitude < -78);
  }
});

test('Carolina North stays searchable with forest and preliminary-plan context', async () => {
  const { northCarolinaProjects: records } = await import('../src/data/northCarolina');
  const forest = filterProjects(records, 'carolina north forest', 'All');
  assert.equal(forest.length, 1);
  assert.equal(forest[0].status, 'Proposed');
  assert.match(forest[0].description, /230-acre former Horace Williams Airport/);
  assert.match(forest[0].description, /remain untouched/);
  assert.match(forest[0].description, /not a confirmed construction date/);
  assert.ok(forest[0].sources?.some(s => s.url.startsWith('https://carolinanorth.unc.edu/')));
});
