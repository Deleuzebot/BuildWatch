/** Encode SVG payloads even when the Auth SDK has already added a data prefix.
 * Its raw SVG can contain # colours, which otherwise become URL fragments. */
export function authenticatorQrSource(value:string){
 if(/^data:image\/svg\+xml;base64,/i.test(value))return value;
 let svg=value;
 if(/^data:image\/svg\+xml[;,]/i.test(svg))svg=svg.slice(svg.indexOf(',')+1);
 if(/^%3c/i.test(svg.trim())){try{svg=decodeURIComponent(svg);}catch{throw Error('The authenticator image could not be displayed. Use the private setup key.');}}
 if(!/<svg[\s>]/i.test(svg))throw Error('The authenticator image could not be displayed. Use the private setup key.');
 return'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);
}
