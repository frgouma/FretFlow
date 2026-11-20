"""Local-only smoke test for the FretFlow application launcher."""

from pathlib import Path
from urllib.parse import unquote, urlparse

from playwright.sync_api import expect


ROOT = Path(__file__).resolve().parents[2]


def test_local_launcher(browser):
    external_requests = []
    page_errors = []
    context = browser.new_context(service_workers="block")

    def restrict_requests(route):
        url = route.request.url
        parsed = urlparse(url)
        if parsed.scheme in ("http", "https"):
            external_requests.append(url)
            route.abort()
        elif parsed.scheme == "file" and Path(unquote(parsed.path)).resolve().is_relative_to(ROOT):
            route.continue_()
        else:
            route.abort()

    context.route("**/*", restrict_requests)
    page = context.new_page()
    page.on("pageerror", lambda error: page_errors.append(str(error)))
    try:
        page.goto((ROOT / "FretFlow.html").as_uri(), wait_until="load")
        launcher = page.locator("#applicationLauncher")
        expect(launcher).to_be_visible()
        expect(launcher.get_by_role("heading", name="FretFlow", exact=True)).to_be_visible()
        expect(page.locator("#launcherProjectStatus")).to_have_text("Geen gitaarmap geladen")
        expect(page.locator("#launcherLoad")).to_be_visible()
        expect(page.locator("#launcherNew")).to_be_visible()
        expect(page.locator("#launcherLoaded")).to_be_hidden()
        expect(page.locator("#applicationViewer")).to_be_hidden()
        assert not page_errors, f"JavaScript page errors: {page_errors}"
    finally:
        print(f"Blocked external HTTP(S) requests: {external_requests}")
        print(f"JavaScript page errors: {page_errors}")
        context.close()


def test_primary_html_opens_project_without_neighboring_files(browser):
    """Exercise the actual document and .fret import with all other requests blocked."""
    context = browser.new_context(service_workers="block")
    blocked = []
    errors = []
    dialogs = []
    document_url = (ROOT / "FretFlow.html").as_uri()

    def restrict_requests(route):
        if route.request.url == document_url:
            route.continue_()
        else:
            blocked.append(route.request.url)
            route.abort()

    context.route("**/*", restrict_requests)
    page = context.new_page()
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.on("dialog", lambda dialog: (dialogs.append(dialog.message), dialog.dismiss()))
    try:
        page.goto(document_url, wait_until="load")
        assert page.evaluate("typeof FretFlowSpotifyPlaybackController") == "function"
        page.locator("#projectFile").set_input_files({
            "name": "demo.fret", "mimeType": "application/json",
            "buffer": (ROOT / "demo.fret").read_bytes(),
        })
        expect(page.locator("#applicationViewer")).to_be_visible()
        assert page.evaluate("typeof FretFlowSpotifyPlaybackController") == "function"
        assert not dialogs, f"Unexpected dialogs: {dialogs}"
        assert not errors, f"JavaScript page errors: {errors}"
        assert not any("spotify-playback-controller.js" in url for url in blocked)
    finally:
        print(f"Blocked requests: {blocked}; errors: {errors}; dialogs: {dialogs}")
        context.close()
