const key='buildwatch.theme.v1';
export async function readTheme(){return localStorage.getItem(key);}
export async function writeTheme(value:string){localStorage.setItem(key,value);}
