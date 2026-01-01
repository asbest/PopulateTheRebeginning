import asyncio
from playwright.async_api import async_playwright

async def verify_camera():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page()

        # Load the game file
        import os
        cwd = os.getcwd()
        filepath = f"file://{cwd}/PopulateTheRebeginning.html"
        await page.goto(filepath)

        # Wait for game to initialize (shaman creation)
        await page.wait_for_timeout(2000)

        # Inject validation script
        result = await page.evaluate("""
            async () => {
                // 1. Select Shaman
                const shaman = window.units.find(u => u.isShaman);
                if (!shaman) return { success: false, msg: "No shaman found" };
                window.selectedUnits = [shaman];

                // 2. Set Joystick Active
                window.joystickVector.set(1, 0); // Move right

                // 3. Wait for a few frames (approx 500ms) to let it move
                await new Promise(r => setTimeout(r, 500));

                // 4. Check Camera LookAt
                const camTarget = window.cameraLookAt;
                const unitPos = shaman.mesh.position;

                // We expect exact match or very close match because we copy position in animate loop
                const dx = Math.abs(camTarget.x - unitPos.x);
                const dz = Math.abs(camTarget.z - unitPos.z);

                // Stop joystick
                window.joystickVector.set(0, 0);

                const dist = Math.sqrt(dx*dx + dz*dz);

                return {
                    success: dist < 0.1,
                    dist: dist,
                    msg: dist < 0.1 ? "Camera matches unit position" : `Camera off by ${dist.toFixed(4)}`
                };
            }
        """)

        print(f"Verification Result: {result}")

        # Take screenshot of the centered view
        await page.screenshot(path="verification/camera_centered.png")

        await browser.close()

        if result['success']:
            print("TEST PASSED")
        else:
            print("TEST FAILED")
            exit(1)

if __name__ == "__main__":
    asyncio.run(verify_camera())
