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
