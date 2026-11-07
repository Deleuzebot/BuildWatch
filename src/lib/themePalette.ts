/** Keep development-status and state colors outside this UI palette. */
export function darkColor(value:string,property:string){
 const normalized=value.toLowerCase();let hex=normalized==='white'?'#ffffff':normalized==='black'?'#000000':normalized;
 if(/^#[0-9a-f]{3}$/.test(hex))hex='#'+hex.slice(1).split('').map(v=>v+v).join('');
 if(!/^#[0-9a-f]{6}$/.test(hex)||property==='shadowColor')return value;
 const [r,g,b]=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255),light=.2126*r+.7152*g+.0722*b;
 if(property==='color'||property==='tintColor'){
  if(light>.9)return '#f4f7f4';
  if(b>r*1.25&&b>g*1.1)return '#99c9ee';
  if(r>g*1.25&&r>b*1.25)return '#edbc91';
  return light<.32?'#e5eee8':'#aebfb5';
 }
 if(/border/i.test(property))return '#42594c';
 if(property==='backgroundColor'){
  if(hex==='#f6f7f2')return '#101b16';
  if(light>.94)return '#1b2a22';
  if(light>.6)return r>g*1.04?'#3a3024':'#293d31';
 }
 return value;
}
export function darkStyles<T extends Record<string,any>>(styles:T):T{
 return Object.fromEntries(Object.entries(styles).map(([key,style])=>[key,Object.fromEntries(Object.entries(style).map(([property,value])=>[property,typeof value==='string'?darkColor(value,property):value]))])) as T;
}
