// Browser privacy settings and full quotas must not prevent the game from starting.
export function createBrowserStorage(provider=()=>window.localStorage){
    const session=new Map();
    return {
        getItem(key){
            key=String(key);
            if(session.has(key))return session.get(key);
            try{return provider().getItem(key);}catch{return null;}
        },
        setItem(key,value){
            key=String(key);value=String(value);
            try{provider().setItem(key,value);session.delete(key);return true;}
            catch{session.set(key,value);return false;}
        },
        removeItem(key){
            key=String(key);
            try{provider().removeItem(key);session.delete(key);}
            catch{session.set(key,null);}
        }
    };
}
