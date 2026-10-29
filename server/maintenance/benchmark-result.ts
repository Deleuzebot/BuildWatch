import {pdfLimits} from './pdf-limits';
/** A safe rejection passes the resource test, but never establishes source coverage. */
export function assessGovernmentBenchmark(rows:any[]){
 const limits=pdfLimits.planning50;let parsed=0;const problems:string[]=[];
 if(rows.length!==2)problems.push('Both configured representative jurisdictions must be attempted');
 for(const row of rows){
  if(row.unexpectedErrors?.length)problems.push(row.jurisdiction+': '+row.unexpectedErrors.join('; '));
  if(!row.documents?.length&&!row.capacityDeferrals?.length)problems.push(row.jurisdiction+': no completed processing or verified capacity rejection');
  for(const d of row.documents||[]){parsed++;const m=d.metrics;
   if(!m||!Number.isFinite(d.inputBytes)||d.inputBytes<5||d.inputBytes>limits.bytes||!Number.isInteger(d.processedPages)||d.processedPages<1||d.processedPages>limits.pages||!Number.isFinite(m.peakRSSBytes)||m.peakRSSBytes>limits.memoryBytes||!Number.isFinite(m.cpuSeconds)||m.cpuSeconds>limits.cpuSeconds||!Number.isFinite(m.wallMs)||m.wallMs>limits.wallMs||!Number.isFinite(m.expandedBytes)||m.expandedBytes>limits.expandedBytes)problems.push(row.jurisdiction+': measured resource limit was not satisfied');
  }
 }
 if(!parsed)problems.push('At least one real government PDF must be successfully processed');
 return{passed:problems.length===0,parsedDocuments:parsed,problems,sourceCoverageComplete:rows.every(r=>r.documents?.length&&!r.capacityDeferrals?.length&&!r.documents.some((d:any)=>d.truncated))};
}
