from playwright.sync_api import sync_playwright

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()
        page.on("console", lambda msg: print(f"CONSOLE: {msg.text}"))

        page.goto("file:///app/PopulateTheRebeginning.html")
        page.wait_for_timeout(1000)

        for i in range(5):
            val = page.evaluate("generateUUID().substr(0, 5)")
            print(f"UUID: {val}")

        browser.close()

if __name__ == "__main__":
    run()
