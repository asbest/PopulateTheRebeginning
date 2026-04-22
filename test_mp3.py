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

        # Add error handler on host side as well
        page_host.evaluate("""
            window.startHost = function() {
                if(state.network.peer) return;
                state.network.role = 'host';
                state.network.peer = new Peer(generateUUID().substr(0, 5), {debug: 3});

                state.network.peer.on('open', (id) => {
                    state.network.id = id;
                    document.getElementById('my-game-id').innerText = id;
                    document.getElementById('mp-status').innerText = "Waiting for player...";
                });

                state.network.peer.on('error', (err) => {
                    document.getElementById('mp-status').innerText = "Error: " + err.type;
                    console.error("HOST PEER ERROR:", err);
                });
            };
            window.startHost();
        """)

        page_host.wait_for_timeout(2000)
        host_id = page_host.evaluate("state.network.id")
        print(f"HOST ID: {host_id}")

        browser.close()

if __name__ == "__main__":
    run()
