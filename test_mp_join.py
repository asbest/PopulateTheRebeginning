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

        # CLIENT
        page_client = browser.new_page()
        page_client.on("console", lambda msg: print(f"CLIENT CONSOLE: {msg.text}"))
        page_client.goto("file:///app/PopulateTheRebeginning.html")
        page_client.wait_for_timeout(1000)
        page_client.evaluate(f"window.NetworkManager.joinGame('{host_id}')")

        for i in range(10):
            page_host.wait_for_timeout(1000)
            status_h = page_host.evaluate("document.getElementById('mp-status').innerText")
            status_c = page_client.evaluate("document.getElementById('mp-status').innerText")
            print(f"Time {i}s -> HOST: {status_h} | CLIENT: {status_c}")

        browser.close()

if __name__ == "__main__":
    run()
