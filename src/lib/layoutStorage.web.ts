const key='buildwatch.layout.v1';
export async function readLayout(){return localStorage.getItem(key);}
export async function writeLayout(value:string){localStorage.setItem(key,value);}
