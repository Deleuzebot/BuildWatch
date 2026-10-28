import * as SecureStore from 'expo-secure-store';
const key='buildwatch.layout.v1';
export async function readLayout(){return SecureStore.getItemAsync(key);}
export async function writeLayout(value:string){await SecureStore.setItemAsync(key,value);}
