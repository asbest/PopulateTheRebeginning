from playwright.sync_api import sync_playwright
import time

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch()

        # HOST
        page_host = browser.new_page()
        page_host.on("console", lambda msg: print(f"HOST CONSOLE: {msg.text}"))
        page_host.goto("file:///app/PopulateTheRebeginning.html")
        page_host.wait_for_timeout(1000)

        page_host.evaluate("window.startHost()")
        page_host.wait_for_timeout(2000)

        host_id = page_host.evaluate("state.network.id")
        print(f"HOST ID: {host_id}")

        browser.close()

if __name__ == "__main__":
    run()
