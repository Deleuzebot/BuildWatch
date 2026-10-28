import React from 'react';
import {Image} from 'react-native';
import {primaryCategories,type PrimaryCategory} from '../lib/categories';
const icons:Record<PrimaryCategory,any>={Residential:require('../../assets/type-icons/residential.png'),'Mixed-Use':require('../../assets/type-icons/mixed-use.png'),Commercial:require('../../assets/type-icons/commercial.png'),Industrial:require('../../assets/type-icons/industrial.png'),Civic:require('../../assets/type-icons/civic.png'),Transportation:require('../../assets/type-icons/transportation.png'),Utilities:require('../../assets/type-icons/utilities.png'),Environment:require('../../assets/type-icons/environment.png')};
export default function TypeIcon({type,size=24}:{type:string;size?:number}){return primaryCategories.includes(type as PrimaryCategory)?<Image source={icons[type as PrimaryCategory]} style={{width:size,height:size}} accessible={false}/>:null;}
