from playwright.sync_api import sync_playwright
import time

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.goto("http://localhost:8000/PopulateTheRebeginning.html")
        page.wait_for_selector("#loading", state="hidden", timeout=10000)

        # Verify chunkWaterMat type (indirectly via uniforms check)
        has_uniforms = page.evaluate("!!chunkWaterMat.uniforms")
        print(f"Has Uniforms: {has_uniforms}")

        # Verify chunkWaterGeo segments
        # parameters: {width, height, widthSegments, heightSegments}
        # In r128 PlaneGeometry parameters might not be exposed directly on instance or as 'parameters' property depending on build.
        # But we can check index count or position count.
        # CHUNK_RES = 150. Segments = 75. Vertices = 76*76 = 5776.
        vertex_count = page.evaluate("chunkWaterGeo.attributes.position.count")
        print(f"Water Vertex Count: {vertex_count}")
        expected = 76 * 76
        print(f"Expected: {expected}")

        if has_uniforms and vertex_count == expected:
            print("SUCCESS: Water shader and geometry updated")
        else:
            print("FAILURE: Verification failed")

        page.screenshot(path="/home/jules/verification/animated_water.png")

        browser.close()

if __name__ == "__main__":
    run()
