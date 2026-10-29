/** Synthetic parser benchmark only; never a government source or project finding. */
export function syntheticPDF(pages=1,targetBytes=0,expandedStreamBytes=0){
 if(pages<1||pages>201||targetBytes>50_000_001)throw Error('Invalid benchmark fixture size');
 const build=(padding:number)=>{
  const objects:string[]=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids ['+Array.from({length:pages},(_,i)=>(4+i*2)+' 0 R').join(' ')+'] /Count '+pages+' >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
  for(let i=0;i<pages;i++){const stream='BT /F1 12 Tf 50 750 Td (Synthetic benchmark page '+(i+1)+': case CZ-2026-15 development request; no government facts.) Tj ET'+(expandedStreamBytes?' '.repeat(expandedStreamBytes):'');objects.push('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents '+(5+i*2)+' 0 R >>','<< /Length '+stream.length+' >>\nstream\n'+stream+'\nendstream');}
  const parts:Buffer[]=[Buffer.from('%PDF-1.4\n%')];if(padding)parts.push(Buffer.alloc(padding,32));parts.push(Buffer.from('\n'));let position=parts.reduce((n,b)=>n+b.length,0);const offsets=[0];
  for(let i=0;i<objects.length;i++){offsets.push(position);const b=Buffer.from((i+1)+' 0 obj\n'+objects[i]+'\nendobj\n');parts.push(b);position+=b.length;}
  parts.push(Buffer.from('xref\n0 '+(objects.length+1)+'\n0000000000 65535 f \n'+offsets.slice(1).map(v=>String(v).padStart(10,'0')+' 00000 n \n').join('')+'trailer\n<< /Size '+(objects.length+1)+' /Root 1 0 R >>\nstartxref\n'+position+'\n%%EOF\n'));return Buffer.concat(parts);
 };
 let padding=0,result=build(0);for(let i=0;targetBytes&&result.length!==targetBytes&&i<4;i++){padding+=targetBytes-result.length;if(padding<0)throw Error('Target smaller than fixture');result=build(padding);}return result;
}
