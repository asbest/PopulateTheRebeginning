// Pin the preset before renderer and texture initialization. Browser hardware
// reporting stays available to regular startup tests.
export function useGraphicsTier(page,tier){
    return page.addInitScript(value=>localStorage.setItem('graphics-quality',value),tier);
}
