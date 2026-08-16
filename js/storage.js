export function readJSON(key,fallback){try{return JSON.parse(localStorage.getItem(key))??fallback}catch{return fallback}}
export function writeJSON(key,value){localStorage.setItem(key,JSON.stringify(value))}
