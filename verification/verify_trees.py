from playwright.sync_api import sync_playwright
import time

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.goto("http://localhost:8000/PopulateTheRebeginning.html")
        page.wait_for_selector("#loading", state="hidden", timeout=10000)

        # Verify tree count
        # Originally 1 tree per chunk (50%). Now 3 loop attempts.
        # Average trees per chunk = 1.5. Chunks = RENDER_DISTANCE^2 area...
        # RENDER_DISTANCE is 3. So (3+3+1)^2 = 49 chunks. 49 * 1.5 = ~73 trees.
        # Let's count trees by checking chunks.

        tree_count = page.evaluate("""
            () => {
                let count = 0;
                Object.values(chunks).forEach(c => {
                    if(c.userData && c.userData.trees) {
                        count += c.userData.trees.length;
                    }
                });
                return count;
            }
        """)
        print(f"Total trees: {tree_count}")

        # Verify tree burning
        # Find a tree and blast it
        page.evaluate("""
            () => {
                // Find first tree
                let targetTree = null;
                Object.values(chunks).some(c => {
                    if(c.userData && c.userData.trees && c.userData.trees.length > 0) {
                        targetTree = c.userData.trees[0];
                        return true;
                    }
                });

                if(targetTree) {
                    // Cheat mana
                    mana = 100;
                    // Blast it
                    selectAction('blast');
                    performAction(targetTree.mesh.position.x, targetTree.mesh.position.z);
                }
            }
        """)

        time.sleep(2) # Wait for fireball

        burned_trees = page.evaluate("""
            () => {
                let burned = 0;
                Object.values(chunks).forEach(c => {
                    if(c.userData && c.userData.trees) {
                        c.userData.trees.forEach(t => {
                            if(t.burned) burned++;
                        });
                    }
                });
                return burned;
            }
        """)
        print(f"Burned trees: {burned_trees}")

        page.screenshot(path="/home/jules/verification/trees_and_fire.png")

        browser.close()

if __name__ == "__main__":
    run()
