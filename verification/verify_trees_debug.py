from playwright.sync_api import sync_playwright
import time

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.goto("http://localhost:8000/PopulateTheRebeginning.html")
        page.wait_for_selector("#loading", state="hidden", timeout=10000)

        # Wait for chunks to generate
        for i in range(10):
            page.evaluate("animate()") # Force frames if needed
            time.sleep(0.5)

        chunks_len = page.evaluate("Object.keys(chunks).length")
        print(f"Chunks: {chunks_len}")

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
        page.evaluate("""
            () => {
                let targetTree = null;
                Object.values(chunks).some(c => {
                    if(c.userData && c.userData.trees && c.userData.trees.length > 0) {
                        targetTree = c.userData.trees[0];
                        return true;
                    }
                });

                if(targetTree) {
                    mana = 100;
                    // Directly call explode to skip projectile travel time issues in test
                    burnTreesAt(targetTree.mesh.position.x, targetTree.mesh.position.z, 10);
                }
            }
        """)

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

        browser.close()

if __name__ == "__main__":
    run()
