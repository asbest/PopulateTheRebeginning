import {ASSET_HASHES} from './asset-revisions.js';
export const ASSET_ROOT=new URL('../',import.meta.url);
export function assetPath(input){
 const url=new URL(input,ASSET_ROOT);
 return url.origin===ASSET_ROOT.origin&&url.pathname.startsWith(ASSET_ROOT.pathname)
  ?decodeURIComponent(url.pathname.slice(ASSET_ROOT.pathname.length)):null;
}
export function assetURL(input){
 const url=new URL(input,ASSET_ROOT),key=assetPath(url);
 if(key&&ASSET_HASHES[key])url.searchParams.set('v',ASSET_HASHES[key]);
 return url.href;
}
