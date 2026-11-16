// Dispatch a real gesture without Playwright's post-click navigation/render
// barrier. Software WebGL can keep that barrier busy after a successful click.
// Callers assert the resulting UI/game state explicitly.
export async function clickVisibleControl(page,selector,{touch=false}={}){
    await page.locator(selector).waitFor({state:'visible'});
    const point=await page.locator(selector).evaluate(element=>{
        element.scrollIntoView({block:'center',inline:'nearest',behavior:'instant'});
        const r=element.getBoundingClientRect();
        if(element.disabled||!r.width||!r.height)throw Error('Control is not actionable');
        return {x:r.x+r.width/2,y:r.y+r.height/2};
    });
    if(touch)await page.touchscreen.tap(point.x,point.y);
    else await page.mouse.click(point.x,point.y);
}
