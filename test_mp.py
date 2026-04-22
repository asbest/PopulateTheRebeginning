from playwright.sync_api import sync_playwright

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()
        page.on("console", lambda msg: print(f"CONSOLE: {msg.text}"))
        page.on("pageerror", lambda err: print(f"PAGE ERROR: {err}"))

        page.goto("file:///app/PopulateTheRebeginning.html")
        page.evaluate("window.startHost()")
        page.wait_for_timeout(3000)
        browser.close()

if __name__ == "__main__":
    run()
