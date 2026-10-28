"""Convert official Census 2025 1:20m KML to deduplicated display-only lines.
Usage: python3 scripts/build-state-boundaries.py /path/to/cb_2025_us_state_20m.zip
No project data is read or changed. Python standard library only.
"""
import sys,json,zipfile,xml.etree.ElementTree as E
from pathlib import Path
from collections import defaultdict
root=Path(__file__).resolve().parents[1]
ns={'k':'http://www.opengis.net/kml/2.2'}
z=zipfile.ZipFile(sys.argv[1]);tree=E.fromstring(z.read('cb_2025_us_state_20m.kml'))
codes=set('AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY'.split())
names={};edges=set()
for place in tree.findall('.//k:Placemark',ns):
 attrs={v.attrib['name']:v.text for v in place.findall('.//k:SimpleData',ns)}
 code=attrs['STUSPS']
 if code not in codes:continue
 names[code]=attrs['NAME']
 for ring in place.findall('.//k:LinearRing/k:coordinates',ns):
  points=[tuple(round(float(v),5) for v in token.split(',')[:2]) for token in ring.text.split()]
  for a,b in zip(points,points[1:]):
   if a!=b and abs(a[0]-b[0])<=180:edges.add(tuple(sorted((a,b))))
adj=defaultdict(set)
for a,b in edges:adj[a].add(b);adj[b].add(a)
remaining=set(edges);paths=[]
def walk(a,b):
 pts=[a,b];remaining.remove(tuple(sorted((a,b))))
 while len(adj[b])==2:
  c=next(v for v in adj[b] if v!=a);edge=tuple(sorted((b,c)))
  if edge not in remaining:break
  remaining.remove(edge);pts.append(c);a,b=b,c
 return pts
for a in sorted(adj):
 if len(adj[a])!=2:
  for b in sorted(adj[a]):
   if tuple(sorted((a,b))) in remaining:paths.append(walk(a,b))
while remaining:
 a,b=min(remaining);paths.append(walk(a,b))
lines=[{'id':str(i),'bounds':{'west':min(p[0] for p in line),'east':max(p[0] for p in line),'south':min(p[1] for p in line),'north':max(p[1] for p in line)},'coordinates':line} for i,line in enumerate(paths)]
assert len(names)==50
out=root/'server/map/data/state-boundaries-2025.json';out.parent.mkdir(exist_ok=True,parents=True)
out.write_text(json.dumps({'version':'census-2025-20m-v1','source':'https://www2.census.gov/geo/tiger/GENZ2025/kml/cb_2025_us_state_20m.zip','states':names,'lines':lines},separators=(',',':'))+'\n')
(root/'src/lib/stateNames.ts').write_text('export const stateNames: Record<string,string> = '+json.dumps(names,indent=2)+';\n')
print(f'{len(names)} states, {len(lines)} deduplicated lines, {len(edges)} unique segments, {out.stat().st_size} JSON bytes')
