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
let phase = 'initial campaign load';
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

    phase = 'phone-sized pre-level Match Settings';
    await page.setViewportSize({ width: 390, height: 640 });
    await page.locator('#story-settings').click();
    await page.locator('#objective-kind-select').selectOption('escort');
    await page.locator('[data-objective-field="followers"]').fill('4');
    await page.locator('[data-objective-field="followers"]').press('Tab');
    const editor = await page.evaluate(() => {
        if (document.getElementById('match-settings-menu').style.display !== 'flex' ||
            document.getElementById('story-overlay').style.display !== 'none') throw new Error('Pre-level settings did not open');
        const select = document.getElementById('objective-level-select');
        select.value = '1';
        renderObjectiveSettings();
        const kind = document.getElementById('objective-kind-select');
        return {
            levels: select.options.length,
            kinds: kind.options.length,
            summary: document.getElementById('objective-settings-summary').textContent,
            stored: JSON.parse(localStorage.getItem('rebeginning_campaign_objectives')),
            fields: document.querySelectorAll('#objective-settings-fields input').length,
            liveRule: state.campaignMission?.rule,
            liveEscorts: state.campaignMission?.escortIds?.length,
            liveHud: document.getElementById('campaign-objective-summary').textContent
        };
    });
    if (editor.levels !== 12 || editor.kinds !== 7 || editor.fields !== 2 ||
        editor.stored?.['1']?.kind !== 'escort' || editor.stored?.['1']?.followers !== 4 ||
        editor.liveRule?.followers !== 4 || editor.liveEscorts !== 4 || !editor.liveHud.includes('Escort 4 followers') ||
        !editor.summary.includes('4 marked followers')) throw new Error('Objective editor failed: ' + JSON.stringify(editor));
    phase = 'returning from Match Settings to the story';
    await page.locator('#match-settings-menu button').last().click({ noWaitAfter: true });
    const revisedStory = await page.locator('#story-objective-list').textContent();
    if (!revisedStory.includes('4 marked followers')) throw new Error('Pre-level story did not update');
    await page.setViewportSize({ width: 1280, height: 800 });
    phase = 'reloading the configured level';
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
    phase = 'starting play with the configured objective';
    await page.locator('#story-close').click({ noWaitAfter: true });
    if (!await page.locator('#campaign-objective-summary').isVisible() ||
        !await page.locator('#campaign-objective').isVisible()) {
        throw new Error('Configured goal and progress are missing from the gameplay HUD');
    }
    phase = 'editing and saving the live objective';
    await page.evaluate(() => {
        if (!state.isPaused) togglePause();
        toggleMatchSettings();
        const previousEscorts = [...state.campaignMission.escortIds];
        document.getElementById('objective-kind-select').value = 'settlement';
        setObjectiveKind('settlement');
        const huts = document.querySelector('[data-objective-field="huts"]');
        huts.value = '4';
        huts.dispatchEvent(new Event('change'));
        if (state.campaignMission.rule.kind !== 'settlement' || state.campaignMission.rule.huts !== 4 ||
            previousEscorts.some(id => state.units.some(unit => unit.id === id)) ||
            !document.getElementById('campaign-objective-summary').textContent.includes('Build 4 huts') ||
            !document.getElementById('campaign-objective').textContent.includes('Huts 0/4')) {
            throw new Error('Edited goal did not change the running level and HUD');
        }
        saveGame();
        loadGame();
        if (state.campaignMission.rule.huts !== 4 ||
            !document.getElementById('campaign-objective-summary').textContent.includes('Build 4 huts')) {
            throw new Error('Edited goal did not survive save/load');
        }
        setObjectiveKind('capture');
        if (state.campaignMission.rule.kind !== 'capture' || state.campaignMission.sites.length !== 1 ||
            state.campaignMission.rule.required !== 1 ||
            !document.getElementById('campaign-objective-summary').textContent.includes('Secure 1 conduit')) {
            throw new Error('Changed goal did not create a reachable capture marker');
        }
        resetAllObjectiveSettings();
        if (localStorage.getItem('rebeginning_campaign_objectives') !== '{}' ||
            state.campaignMission.rule.huts !== 2 ||
            state.campaignMission.sites.length !== 0 ||
            !document.getElementById('campaign-objective-summary').textContent.includes('Build 2 huts')) {
            throw new Error('Objective reset did not update the running level');
        }
    });
    console.log('PASS Match Settings updates live objectives, HUD, story, save/load and reset');

    phase = 'loading campaign level 5';
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

    phase = 'loading campaign level 12';
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
} catch (error) {
    const detail = `${phase}: ${String(error)}`;
    if (process.env.GITHUB_ACTIONS === 'true') {
        const escaped = detail.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
        console.log(`::error title=Campaign story::${escaped}`);
    }
    throw error;
} finally {
    await browser.close();
}
