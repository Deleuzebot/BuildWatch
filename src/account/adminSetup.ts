/** UI progress only; the backend independently enforces ownership and MFA. */
export function administratorStep(signed:boolean,verified:number,aal2:boolean,linked:boolean){
 if(!signed)return 'password';
 if(!verified)return 'primary';
 if(!aal2)return 'verify';
 if(linked)return 'ready';
 return 'link';
}
export function normalizeAuthenticatorCode(code:string){return code.replace(/\s/g,'');}
