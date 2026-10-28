/** Approved fixed 50-state palette. Individual pins use development status colors. */
export const stateColors = { enabled: true, palette: { blue:'#4477AA', teal:'#228B83', amber:'#D69A32', purple:'#8464A8', mixed:'#5B676C' }, assignments: {
  "AL": "blue",
  "AK": "blue",
  "AZ": "amber",
  "AR": "blue",
  "CA": "purple",
  "CO": "amber",
  "CT": "amber",
  "DE": "teal",
  "FL": "teal",
  "GA": "amber",
  "HI": "blue",
  "ID": "amber",
  "IL": "teal",
  "IN": "purple",
  "IA": "blue",
  "KS": "blue",
  "KY": "blue",
  "LA": "teal",
  "ME": "blue",
  "MD": "purple",
  "MA": "blue",
  "MI": "blue",
  "MN": "teal",
  "MS": "amber",
  "MO": "amber",
  "MT": "teal",
  "NE": "teal",
  "NV": "blue",
  "NH": "teal",
  "NJ": "amber",
  "NM": "blue",
  "NY": "teal",
  "NC": "blue",
  "ND": "blue",
  "OH": "amber",
  "OK": "teal",
  "OR": "teal",
  "PA": "blue",
  "RI": "purple",
  "SC": "teal",
  "SD": "amber",
  "TN": "teal",
  "TX": "amber",
  "UT": "teal",
  "VT": "amber",
  "VA": "amber",
  "WA": "blue",
  "WV": "teal",
  "WI": "amber",
  "WY": "blue"
} } as const;
export const stateNeighbors: Record<string,string[]> = {
  "AL": [
    "FL",
    "GA",
    "MS",
    "TN"
  ],
  "AK": [],
  "AZ": [
    "CA",
    "NM",
    "NV",
    "UT"
  ],
  "AR": [
    "LA",
    "MO",
    "MS",
    "OK",
    "TN",
    "TX"
  ],
  "CA": [
    "AZ",
    "NV",
    "OR"
  ],
  "CO": [
    "KS",
    "NE",
    "NM",
    "OK",
    "UT",
    "WY"
  ],
  "CT": [
    "MA",
    "NY",
    "RI"
  ],
  "DE": [
    "MD",
    "NJ",
    "PA"
  ],
  "FL": [
    "AL",
    "GA"
  ],
  "GA": [
    "AL",
    "FL",
    "NC",
    "SC",
    "TN"
  ],
  "HI": [],
  "ID": [
    "MT",
    "NV",
    "OR",
    "UT",
    "WA",
    "WY"
  ],
  "IL": [
    "IA",
    "IN",
    "KY",
    "MI",
    "MO",
    "WI"
  ],
  "IN": [
    "IL",
    "KY",
    "MI",
    "OH"
  ],
  "IA": [
    "IL",
    "MN",
    "MO",
    "NE",
    "SD",
    "WI"
  ],
  "KS": [
    "CO",
    "MO",
    "NE",
    "OK"
  ],
  "KY": [
    "IL",
    "IN",
    "MO",
    "OH",
    "TN",
    "VA",
    "WV"
  ],
  "LA": [
    "AR",
    "MS",
    "TX"
  ],
  "ME": [
    "NH"
  ],
  "MD": [
    "DE",
    "PA",
    "VA",
    "WV"
  ],
  "MA": [
    "CT",
    "NH",
    "NY",
    "RI",
    "VT"
  ],
  "MI": [
    "IL",
    "IN",
    "MN",
    "OH",
    "WI"
  ],
  "MN": [
    "IA",
    "MI",
    "ND",
    "SD",
    "WI"
  ],
  "MS": [
    "AL",
    "AR",
    "LA",
    "TN"
  ],
  "MO": [
    "AR",
    "IA",
    "IL",
    "KS",
    "KY",
    "NE",
    "OK",
    "TN"
  ],
  "MT": [
    "ID",
    "ND",
    "SD",
    "WY"
  ],
  "NE": [
    "CO",
    "IA",
    "KS",
    "MO",
    "SD",
    "WY"
  ],
  "NV": [
    "AZ",
    "CA",
    "ID",
    "OR",
    "UT"
  ],
  "NH": [
    "MA",
    "ME",
    "VT"
  ],
  "NJ": [
    "DE",
    "NY",
    "PA"
  ],
  "NM": [
    "AZ",
    "CO",
    "OK",
    "TX"
  ],
  "NY": [
    "CT",
    "MA",
    "NJ",
    "PA",
    "RI",
    "VT"
  ],
  "NC": [
    "GA",
    "SC",
    "TN",
    "VA"
  ],
  "ND": [
    "MN",
    "MT",
    "SD"
  ],
  "OH": [
    "IN",
    "KY",
    "MI",
    "PA",
    "WV"
  ],
  "OK": [
    "AR",
    "CO",
    "KS",
    "MO",
    "NM",
    "TX"
  ],
  "OR": [
    "CA",
    "ID",
    "NV",
    "WA"
  ],
  "PA": [
    "DE",
    "MD",
    "NJ",
    "NY",
    "OH",
    "WV"
  ],
  "RI": [
    "CT",
    "MA",
    "NY"
  ],
  "SC": [
    "GA",
    "NC"
  ],
  "SD": [
    "IA",
    "MN",
    "MT",
    "ND",
    "NE",
    "WY"
  ],
  "TN": [
    "AL",
    "AR",
    "GA",
    "KY",
    "MO",
    "MS",
    "NC",
    "VA"
  ],
  "TX": [
    "AR",
    "LA",
    "NM",
    "OK"
  ],
  "UT": [
    "AZ",
    "CO",
    "ID",
    "NV",
    "WY"
  ],
  "VT": [
    "MA",
    "NH",
    "NY"
  ],
  "VA": [
    "KY",
    "MD",
    "NC",
    "TN",
    "WV"
  ],
  "WA": [
    "ID",
    "OR"
  ],
  "WV": [
    "KY",
    "MD",
    "OH",
    "PA",
    "VA"
  ],
  "WI": [
    "IA",
    "IL",
    "MI",
    "MN"
  ],
  "WY": [
    "CO",
    "ID",
    "MT",
    "NE",
    "SD",
    "UT"
  ]
};
export function clusterColor(state: string|null) { const key=state ? stateColors.assignments[state.toUpperCase() as keyof typeof stateColors.assignments] : undefined; return stateColors.palette[key || 'mixed']; }
export function contrast(a:string,b:string){const light=(hex:string)=>{const c=hex.slice(1).match(/../g)!.map(v=>parseInt(v,16)/255).map(v=>v<=0.04045?v/12.92:((v+0.055)/1.055)**2.4);return c[0]*0.2126+c[1]*0.7152+c[2]*0.0722;};const x=light(a),y=light(b);return(Math.max(x,y)+0.05)/(Math.min(x,y)+0.05);}
export function countTextColor(background:string){return contrast(background,'#FFFFFF')>=contrast(background,'#000000')?'#FFFFFF':'#000000';}
