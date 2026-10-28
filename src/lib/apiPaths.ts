const publicPaths=new Set(['/api/config','/api/catalog','/api/browse','/api/map','/api/meetings','/api/projects','/api/state-boundaries/2025-20m']);
export function isPublicApiPath(value:string){const path=value.split('?')[0];return publicPaths.has(path)||/^\/api\/public\/projects\/[A-Za-z0-9-]{1,160}(\/activity)?$/.test(path);}
