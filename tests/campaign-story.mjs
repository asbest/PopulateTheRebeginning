import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { CAMPAIGN_STORIES, CAMPAIGN_ENDINGS } from '../art/campaign-story.js';

for (let level = 1; level <= 12; level++) {
    const chapter = CAMPAIGN_STORIES[level];
    if (!chapter || !['title', 'text', 'objective', 'beat', 'outro'].every(key => chapter[key]?.trim())) {
        throw new Error(`Incomplete campaign chapter ${level}`);
    }
}
if (!CAMPAIGN_ENDINGS.keep?.text || !CAMPAIGN_ENDINGS.return?.text) throw new Error('Both endings need an epilogue');

const modulePath = process.argv.find(arg => arg.startsWith('--playwright='))?.slice(13);
const { chromium } = modulePath ? await import(pathToFileURL(modulePath).href) : createRequire(import.meta.url)('playwright');
const browser = await chromium.launch({ headless: true, ...(process.platform === 'win32' ? { channel: 'chrome' } : {}) });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', error => errors.push(String(error)));
const url = (process.env.GAME_URL || 'http://127.0.0.1:8765') + '/PopulateTheRebeginning.html?test=1';

async function startLevel(level) {
    await page.evaluate(level => {
        localStorage.setItem('rebeginning_start_campaign', String(level));
        localStorage.removeItem('populous_save');
    }, level);
    await page.goto(url, { waitUntil: 'load', timeout: 60000 });
    await page.waitForFunction(level => window.gameTestAPI && state.shaman && state.campaignLevel === level,
        level, { timeout: 90000 });
}

try {
    await page.goto(url, { waitUntil: 'load', timeout: 60000 });
    await page.waitForFunction(() => window.gameTestAPI && state.shaman, null, { timeout: 90000 });
    const opening = await page.evaluate(() => ({
        title: document.getElementById('story-title').textContent,
        objective: document.getElementById('story-objective').textContent,
        visible: document.getElementById('story-overlay').style.display,
        paused: state.isPaused
    }));
    if (opening.title !== CAMPAIGN_STORIES[1].title || !opening.objective.includes(CAMPAIGN_STORIES[1].objective) ||
        opening.visible !== 'flex' || !opening.paused) throw new Error('Opening chapter failed: ' + JSON.stringify(opening));
    console.log('PASS Campaign opens with the new premise and a playable objective');

    const editor = await page.evaluate(() => {
        toggleMatchSettings();
        const select = document.getElementById('objective-level-select');
        select.value = '1';
        renderObjectiveSettings();
        const kind = document.getElementById('objective-kind-select');
        kind.value = 'escort';
        kind.dispatchEvent(new Event('change'));
        const input = document.querySelector('[data-objective-field="followers"]');
        input.value = '4';
        input.dispatchEvent(new Event('change'));
        return {
            levels: select.options.length,
            kinds: kind.options.length,
            summary: document.getElementById('objective-settings-summary').textContent,
            stored: JSON.parse(localStorage.getItem('rebeginning_campaign_objectives')),
            fields: document.querySelectorAll('#objective-settings-fields input').length
        };
    });
    if (editor.levels !== 12 || editor.kinds !== 7 || editor.fields !== 2 ||
        editor.stored?.['1']?.kind !== 'escort' || editor.stored?.['1']?.followers !== 4 ||
        !editor.summary.includes('4 marked followers')) throw new Error('Objective editor failed: ' + JSON.stringify(editor));
    await startLevel(1);
    const configured = await page.evaluate(() => ({
        kind: state.campaignMission?.rule?.kind,
        followers: state.campaignMission?.rule?.followers,
        escorts: state.campaignMission?.escortIds?.length,
        steps: document.getElementById('story-objective-list').textContent,
        paused: state.isPaused
    }));
    if (configured.kind !== 'escort' || configured.followers !== 4 || configured.escorts !== 4 ||
        !configured.steps.includes('4 marked followers') || !configured.paused) {
        throw new Error('Configured objective was not explained before play: ' + JSON.stringify(configured));
    }
    await page.evaluate(() => {
        resetAllObjectiveSettings();
        if (localStorage.getItem('rebeginning_campaign_objectives') !== '{}') throw new Error('Objective reset was not persisted');
    });
    console.log('PASS Match Settings edits, persists and explains every level objective before play');

    await startLevel(5);
    await page.evaluate(() => { closeStoryOverlay(); if (state.isPaused) togglePause(); });
    await page.evaluate(() => {
        const enemy = state.units.find(unit => !window.isAllied(unit.faction, 0) && unit.state !== 'dead');
        if (!enemy) throw new Error('Level 5 has no enemy');
        enemy.state = 'dead';
    });
    await page.waitForFunction(() => state.campaignNarrative?.beatShown, null, { timeout: 10000 });
    await page.evaluate(() => { if (!state.isPaused) togglePause(); showCampaignJournal(); });
    const journal = await page.evaluate(() => ({
        title: document.getElementById('story-title').textContent,
        clue: document.getElementById('story-discovery').textContent,
        clueVisible: !document.getElementById('story-discovery').hidden,
        objective: document.getElementById('story-objective').textContent
    }));
    if (journal.title !== CAMPAIGN_STORIES[5].title || !journal.clueVisible ||
        !journal.clue.includes(CAMPAIGN_STORIES[5].beat) || !journal.objective.includes('three rival tribes')) {
        throw new Error('Midpoint clue or journal failed: ' + JSON.stringify(journal));
    }
    await page.evaluate(() => {
        closeStoryOverlay();
        if (state.isPaused) togglePause();
        const site=state.campaignMission.sites[0];
        for(const enemy of state.units)if(!window.isAllied(enemy.faction,0) &&
            Math.hypot(enemy.mesh.position.x-site.x,enemy.mesh.position.z-site.z)<6)enemy.state='dead';
        state.shaman.mesh.position.set(site.x,state.shaman.mesh.position.y,site.z);
        gameTestAPI.updateCampaignMission(12);
        if(!site.captured)throw new Error('First conduit was not captured');
        saveGame();loadGame();
    });
    const saved = await page.evaluate(() => ({ level: state.campaignLevel, beatShown: state.campaignNarrative?.beatShown,
        missionLevel:state.campaignMission?.level,sites:state.campaignMission?.sites.length,
        captured:state.campaignMission?.sites.filter(site=>site.captured).length }));
    if (saved.level !== 5 || !saved.beatShown || saved.missionLevel !== 5 || saved.sites !== 3 || saved.captured !== 1)
        throw new Error('Campaign clue or mission did not survive save/load: ' + JSON.stringify(saved));
    console.log('PASS Mid-battle revelation, journal and save/load');
    await page.setViewportSize({ width: 390, height: 640 });
    await page.evaluate(() => { if (!state.isPaused) togglePause(); });
    await page.locator('#btn-campaign-journal').click();
    if (await page.locator('#story-discovery').isHidden()) throw new Error('Campaign journal cannot be opened on a narrow screen');
    await page.locator('#story-close').click();
    await page.setViewportSize({ width: 1280, height: 800 });
    console.log('PASS Campaign journal remains usable on a phone-sized viewport');

    await startLevel(12);
    await page.evaluate(() => {
        closeStoryOverlay();
        if (state.isPaused) togglePause();
        for (const unit of state.units) if (!window.isAllied(unit.faction, 0)) unit.state = 'dead';
    });
    await page.waitForFunction(() => window.gameWonAlertShown && !document.getElementById('campaign-ending').hidden,
        null, { timeout: 10000 });
    const choice = await page.evaluate(() => ({
        title: document.getElementById('campaign-ending-title').textContent,
        choices: !document.getElementById('campaign-ending-choices').hidden,
        paused: state.isPaused
    }));
    if (choice.title !== 'The Price of Divinity' || !choice.choices || !choice.paused) {
        throw new Error('Final choice failed: ' + JSON.stringify(choice));
    }
    await page.evaluate(() => { chooseCampaignEnding('return'); closeCampaignEnding(); });
    const returned = await page.evaluate(() => ({
        saved: localStorage.getItem('rebeginning_campaign_ending'),
        menu: document.getElementById('campaign-menu').style.display,
        review: document.getElementById('btn-review-ending').style.display
    }));
    if (returned.saved !== 'return' || returned.menu !== 'flex' || returned.review === 'none') {
        throw new Error('Ending was not saved for review: ' + JSON.stringify(returned));
    }
    await page.evaluate(() => reviewCampaignEnding());
    const reread = await page.evaluate(() => document.getElementById('campaign-ending-text').textContent);
    if (reread !== CAMPAIGN_ENDINGS.return.text) throw new Error('Saved ending cannot be reread');
    await page.evaluate(() => { closeCampaignEnding(); showCampaignEnding(); chooseCampaignEnding('keep'); });
    const kept = await page.evaluate(() => ({
        saved: localStorage.getItem('rebeginning_campaign_ending'),
        text: document.getElementById('campaign-ending-text').textContent
    }));
    if (kept.saved !== 'keep' || kept.text !== CAMPAIGN_ENDINGS.keep.text) {
        throw new Error('Alternative ending failed: ' + JSON.stringify(kept));
    }
    console.log('PASS Final choice, both epilogues and persistent review');
    await page.setViewportSize({ width: 390, height: 640 });
    await page.evaluate(() => showCampaignEnding());
    await page.locator('#campaign-ending-choices button').last().click();
    await page.locator('#campaign-ending-finished button').click();
    if (await page.evaluate(() => localStorage.getItem('rebeginning_campaign_ending')) !== 'return') {
        throw new Error('Final choice cannot be used on a narrow screen');
    }
    console.log('PASS Ending remains usable on a phone-sized viewport');
    if (errors.length) throw new Error('Browser errors: ' + errors.join(' | '));
    console.log('PASS Campaign story has no browser runtime errors');
} finally {
    await browser.close();
}
