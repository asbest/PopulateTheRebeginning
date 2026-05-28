const { test, expect } = require('@playwright/test');
const path = require('path');

test('Verify statistics dashboard in cheat menu', async ({ page }) => {
    // Path to the game file
    const filePath = 'file://' + path.resolve('PopulateTheRebeginning.html');

    // Go to the game
    await page.goto(filePath);

    // Wait for the game to initialize
    await page.waitForTimeout(2000);

    // Close story overlay if it exists
    const storyOverlay = page.locator('#story-overlay');
    if (await storyOverlay.isVisible()) {
        await page.evaluate(() => {
            if (typeof window.closeStoryOverlay === 'function') {
                window.closeStoryOverlay();
            } else {
                document.getElementById('story-overlay').style.display = 'none';
                state.isPaused = false;
            }
        });
    }

    // Press Escape to open pause menu
    await page.keyboard.press('Escape');
    await expect(page.locator('#pause-menu')).toBeVisible();

    // The cheat menu is hidden by default.
    // We need to click #top-bar 10 times rapidly (less than 500ms apart)
    const topBar = page.locator('#top-bar');
    for (let i = 0; i < 11; i++) {
        await topBar.click();
        await page.waitForTimeout(100);
    }

    // After 10 clicks, an alert should appear. We handle it.
    // However, Playwright handles dialogs automatically or we can set up a listener.
    page.on('dialog', dialog => dialog.accept());

    // Check if cheat menu is visible
    const cheatMenu = page.locator('#cheat-menu');
    await expect(cheatMenu).toBeVisible();

    // Verify statistics dashboard
    const statsDashboard = page.locator('#stats-dashboard');
    await expect(statsDashboard).toBeVisible();

    const statsHeader = statsDashboard.locator('h3');
    await expect(statsHeader).toHaveText('STATISTICS');

    const visitCountDisplay = page.locator('#visit-count-display');
    await expect(visitCountDisplay).toBeVisible();

    // Take a screenshot for visual verification
    await page.screenshot({ path: 'tests/dashboard_verification.png' });
});
