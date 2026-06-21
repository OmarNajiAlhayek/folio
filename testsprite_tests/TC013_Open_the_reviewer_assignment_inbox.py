import asyncio
import re
from playwright import async_api
from playwright.async_api import expect

async def run_test():
    pw = None
    browser = None
    context = None

    try:
        # Start a Playwright session in asynchronous mode
        pw = await async_api.async_playwright().start()

        # Launch a Chromium browser in headless mode with custom arguments
        browser = await pw.chromium.launch(
            headless=True,
            args=[
                "--window-size=1280,720",
                "--disable-dev-shm-usage",
                "--ipc=host",
                "--single-process"
            ],
        )

        # Create a new browser context (like an incognito window)
        context = await browser.new_context()
        # Wider default timeout to match the agent's DOM-stability budget;
        # auto-waiting Playwright APIs (expect, locator.wait_for) inherit this.
        context.set_default_timeout(15000)

        # Open a new page in the browser context
        page = await context.new_page()

        # Interact with the page elements to simulate user flow
        # -> navigate
        await page.goto("http://localhost:5240/en")
        try:
            await page.wait_for_load_state("domcontentloaded", timeout=5000)
        except Exception:
            pass
        
        # -> Click the 'Log in' link to open the login page so the reviewer can sign in.
        # Log in link
        elem = page.get_by_text('العربية', exact=True).locator("xpath=ancestor-or-self::*[.//a][1]").get_by_role('link', name='Log in', exact=True)
        await elem.click(timeout=10000)
        
        # -> Fill the reviewer email 'ysryrwthqsdthwy@gmail.com' into the Email field, fill the password 'Reviewer123!' into the Password field, then click the 'Sign in' button to submit the login form.
        # email text field
        elem = page.get_by_label('Email', exact=True)
        await elem.wait_for(state="visible", timeout=10000)
        await elem.fill("ysryrwthqsdthwy@gmail.com")
        
        # -> Fill the reviewer email 'ysryrwthqsdthwy@gmail.com' into the Email field, fill the password 'Reviewer123!' into the Password field, then click the 'Sign in' button to submit the login form.
        # password password field
        elem = page.get_by_label('Password', exact=True)
        await elem.wait_for(state="visible", timeout=10000)
        await elem.fill("Reviewer123!")
        
        # -> Fill the reviewer email 'ysryrwthqsdthwy@gmail.com' into the Email field, fill the password 'Reviewer123!' into the Password field, then click the 'Sign in' button to submit the login form.
        # Sign in button
        elem = page.get_by_role('button', name='Sign in', exact=True)
        await elem.click(timeout=10000)
        
        # -> Click the 'My review assignments' quick-access link on the Dashboard to open the review assignment inbox.
        # My review assignments Access assigned... link
        elem = page.locator('xpath=/html/body/div[2]/main/div/div[2]/div/nav/ul/li/a')
        await elem.click(timeout=10000)
        
        # --> Assertions to verify final state
        
        # --> Verify the review assignment inbox is displayed
        # Assert: The browser is on the review assignments page.
        await expect(page).to_have_url(re.compile("/en/assignments"), timeout=15000), "The browser is on the review assignments page."
        # Assert: A pending review invitation is listed in the assignments inbox.
        await expect(page.locator("xpath=/html/body/div[2]/main/div/section[1]/ul/li[1]/a").nth(0)).to_contain_text("[Demo] Open-Access Policies in Arabic Peer-Reviewed Journals", timeout=15000), "A pending review invitation is listed in the assignments inbox."
        
        # --> Verify pending assignments are displayed
        await page.locator("xpath=/html/body/div[2]/main/div/section[1]/ul/li[1]/a").nth(0).scroll_into_view_if_needed()
        # Assert: The pending invitation '[Demo] Open-Access Policies in Arabic Peer-Reviewed Journals' is visible.
        await expect(page.locator("xpath=/html/body/div[2]/main/div/section[1]/ul/li[1]/a").nth(0)).to_be_visible(timeout=15000), "The pending invitation '[Demo] Open-Access Policies in Arabic Peer-Reviewed Journals' is visible."
        await page.locator("xpath=/html/body/div[2]/main/div/section[1]/ul/li[2]/a").nth(0).scroll_into_view_if_needed()
        # Assert: The pending invitation '[Demo] The Effect of Immediate Feedback on Student Performance in Large Classes' is visible.
        await expect(page.locator("xpath=/html/body/div[2]/main/div/section[1]/ul/li[2]/a").nth(0)).to_be_visible(timeout=15000), "The pending invitation '[Demo] The Effect of Immediate Feedback on Student Performance in Large Classes' is visible."
        await asyncio.sleep(5)

    finally:
        if context:
            await context.close()
        if browser:
            await browser.close()
        if pw:
            await pw.stop()

asyncio.run(run_test())
    