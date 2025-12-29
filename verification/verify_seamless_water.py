from playwright.sync_api import sync_playwright
import time

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.goto("http://localhost:8000/PopulateTheRebeginning.html")
        page.wait_for_selector("#loading", state="hidden", timeout=10000)

        # Verify shader content (indirectly via checking if it runs)
        # We can try to extract the shader source from the material
        shader_src = page.evaluate("""
            () => {
                return chunkWaterMat.vertexShader;
            }
        """)

        if "worldPosition" in shader_src and "modelMatrix" in shader_src:
            print("SUCCESS: Shader uses world position")
        else:
            print("FAILURE: Shader missing world position logic")

        if "height +=" in shader_src:
             print("SUCCESS: Multiple wave layers detected")

        page.screenshot(path="/home/jules/verification/seamless_water.png")

        browser.close()

if __name__ == "__main__":
    run()
