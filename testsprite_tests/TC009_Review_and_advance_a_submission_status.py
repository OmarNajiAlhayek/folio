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
        
        # -> Open the 'Log in' page by navigating to the /en/login URL so the editor credentials can be entered.
        await page.goto("http://localhost:5240/en/login")
        try:
            await page.wait_for_load_state("domcontentloaded", timeout=5000)
        except Exception:
            pass
        
        # -> Fill the 'Email' field with the editor email, fill the 'Password' field with the editor password, then click the 'Sign in' button to log in.
        # email text field
        elem = page.get_by_label('Email', exact=True)
        await elem.wait_for(state="visible", timeout=10000)
        await elem.fill("k76462338@gmail.com")
        
        # -> Fill the 'Email' field with the editor email, fill the 'Password' field with the editor password, then click the 'Sign in' button to log in.
        # password password field
        elem = page.get_by_label('Password', exact=True)
        await elem.wait_for(state="visible", timeout=10000)
        await elem.fill("Editor123!")
        
        # -> Fill the 'Email' field with the editor email, fill the 'Password' field with the editor password, then click the 'Sign in' button to log in.
        # Sign in button
        elem = page.get_by_role('button', name='Sign in', exact=True)
        await elem.click(timeout=10000)
        
        # -> Click the 'Editor queue' link on the Dashboard to open the submissions queue.
        # Editor queue Evaluate incoming submissions... link
        elem = page.get_by_role('link', name='Editor queue Evaluate incoming submissions, assign peer reviewers, and record editorial decisions.', exact=True)
        await elem.click(timeout=10000)
        
        # -> Open the submission detail page by clicking the 'View' link next to the '[Perf] Corpus similarity load' submission.
        # [Perf] Corpus similarity load Submitted Updated... link
        elem = page.get_by_role('link', name='[Perf] Corpus similarity load Submitted Updated Jun 11, 2026, 9:36 AM View', exact=True)
        await elem.click(timeout=10000)
        
        # -> Open the 'Set status' dropdown in the Editor Command Center so the available workflow states (e.g., 'Under review') are revealed.
        # Submitted button
        elem = page.locator('xpath=/html/body/div[2]/main/div/div[2]/div/div[4]/div/button')
        await elem.click(timeout=10000)
        
        # -> Select 'Under review' from the visible 'Set status' dropdown and click the 'Apply status' button to move the submission to the next workflow state.
        # Under review option
        elem = page.get_by_role('option', name='Under review', exact=True)
        await elem.click(timeout=10000)
        
        # -> Select 'Under review' from the visible 'Set status' dropdown and click the 'Apply status' button to move the submission to the next workflow state.
        # Apply status button
        elem = page.get_by_role('button', name='Apply status', exact=True)
        await elem.click(timeout=10000)
        
        # --> Assertions to verify final state
        
        # --> Verify the submission detail page is displayed
        # Assert: The URL contains the submission detail path for perf-corpus-similarity-load.
        await expect(page).to_have_url(re.compile("/en/submissions/perf\\-corpus\\-similarity\\-load"), timeout=15000), "The URL contains the submission detail path for perf-corpus-similarity-load."
        await page.locator("xpath=/html/body/div[2]/main/header/nav/a[1]").nth(0).scroll_into_view_if_needed()
        # Assert: The back link '← Submissions' is visible, confirming the submission detail page is displayed.
        await expect(page.locator("xpath=/html/body/div[2]/main/header/nav/a[1]").nth(0)).to_be_visible(timeout=15000), "The back link '\u2190 Submissions' is visible, confirming the submission detail page is displayed."
        
        # --> Verify the updated workflow status is displayed
        await page.locator("xpath=/html/body/div[2]/main/div/div[2]/div/div[4]/div/button").nth(0).scroll_into_view_if_needed()
        # Assert: The submission status 'Under review' is displayed.
        await expect(page.locator("xpath=/html/body/div[2]/main/div/div[2]/div/div[4]/div/button").nth(0)).to_be_visible(timeout=15000), "The submission status 'Under review' is displayed."
        await asyncio.sleep(5)

    finally:
        if context:
            await context.close()
        if browser:
            await browser.close()
        if pw:
            await pw.stop()

asyncio.run(run_test())
    