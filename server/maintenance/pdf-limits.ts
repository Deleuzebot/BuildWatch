/** Large profile is opt-in for manual benchmarks; standard retrieval stays 2 MB. */
export const pdfLimits={
 standard:{bytes:2_000_000,pages:50,text:120_000,cpuSeconds:10,wallMs:15000,memoryBytes:512*1024*1024,streamBytes:8_000_000,expandedBytes:32_000_000},
 planning50:{bytes:50_000_000,pages:200,text:1_000_000,cpuSeconds:45,wallMs:60000,memoryBytes:1024*1024*1024,streamBytes:8_000_000,expandedBytes:64_000_000},
} as const;
export type PDFProfile=keyof typeof pdfLimits;
export function pdfProfile(profile:PDFProfile='standard'){
 if(profile==='planning50'&&process.env.BW_PDF_50MB_BENCHMARK!=='true'&&process.env.BW_PDF_50MB_VALIDATED!=='true')throw Error('50 MB PDF profile requires an explicit benchmark or validated dry-run opt-in');
 return pdfLimits[profile];
}
