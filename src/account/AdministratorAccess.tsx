import React from'react';import{Text,View}from'react-native';import AccountEntry from'./AccountEntry';
export default function AdministratorAccess(){return <View><Text>Sign in with your BuildWatch email and password, then your Duo code.</Text><AccountEntry onGuest={()=>{}} onAdministrator={()=>{}}/></View>;}
