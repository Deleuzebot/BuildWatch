import * as SecureStore from 'expo-secure-store';
const key='buildwatch.theme.v1';
export const readTheme=()=>SecureStore.getItemAsync(key);
export const writeTheme=(value:string)=>SecureStore.setItemAsync(key,value);
