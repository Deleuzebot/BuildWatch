import test from 'node:test';
import assert from 'node:assert/strict';
import{clusterAppearance,boundaryOpacity,overlapsBounds}from'../src/lib/mapAppearance';
import{statusColors}from'../src/data/projects';
import boundaries from'../server/map/data/state-boundaries-2025.json';
import{stateColors}from'../src/lib/stateColors';
test('state clusters and individual status markers keep distinct approved palettes',()=>{
 assert.equal(clusterAppearance('NC').background,'#4477AA');assert.equal(clusterAppearance('SC').background,'#228B83');assert.equal(clusterAppearance('VA').background,'#D69A32');assert.equal(clusterAppearance(null).background,'#5B676C');assert.equal(clusterAppearance('XX').background,'#5B676C');assert.equal(clusterAppearance('NC').label,'North Carolina');
 assert.deepEqual(statusColors,{Proposed:'#7555A3','In review':'#AE6B16',Approved:'#2466A5','Under construction':'#B84932',Completed:'#23725B',Cancelled:'#6A7076','On hold':'#607D8B'});
});
test('boundary fade hides local outlines and viewport filtering supports the dateline',()=>{
 assert.equal(boundaryOpacity(2),0);assert.equal(boundaryOpacity(3),.45);assert.equal(boundaryOpacity(6),.45);assert.ok(Math.abs(boundaryOpacity(10)-.2)<1e-9);assert.ok(boundaryOpacity(11)<boundaryOpacity(10));assert.equal(boundaryOpacity(12),0);assert.equal(boundaryOpacity(19),0);
 assert.ok(overlapsBounds({west:-80,east:-75,south:33,north:37},{west:-79,east:-78,south:35,north:36}));assert.ok(!overlapsBounds({west:-80,east:-75,south:33,north:37},{west:100,east:110,south:35,north:36}));assert.ok(overlapsBounds({west:-180,east:-179,south:50,north:60},{west:179,east:-178,south:51,north:55}));
});
test('official generalized outlines cover 50 states with no duplicated or world-spanning segments',()=>{
 assert.deepEqual(Object.keys(boundaries.states).sort(),Object.keys(stateColors.assignments).sort());assert.equal(boundaries.version,'census-2025-20m-v1');const edges=new Set<string>();let points=0;
 for(const line of boundaries.lines){for(const [lon,lat]of line.coordinates){assert.ok(lon>=-180&&lon<=180&&lat>=-90&&lat<=90);assert.ok(lon>=line.bounds.west&&lon<=line.bounds.east&&lat>=line.bounds.south&&lat<=line.bounds.north);points++;}
 for(let i=1;i<line.coordinates.length;i++){const a=line.coordinates[i-1],b=line.coordinates[i];assert.ok(Math.abs(a[0]-b[0])<=180);const key=[JSON.stringify(a),JSON.stringify(b)].sort().join('|');assert.ok(!edges.has(key));edges.add(key);}}
 assert.ok(points<15000);assert.ok(Buffer.byteLength(JSON.stringify(boundaries))<250000);
});
