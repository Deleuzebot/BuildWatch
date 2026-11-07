import {useThemeStyle} from "../lib/Theme";
import React from'react';
import{Text}from'react-native';
export default function AdministratorAccess(){
 const paint=useThemeStyle();
return <Text style={paint({color:"#163A30"})}>Use the BuildWatch website to set up the administrator authenticator login. Your existing mobile sign-in remains available.</Text>;}
