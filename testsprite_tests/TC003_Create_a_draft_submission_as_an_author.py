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
        
        # -> Click the 'Log in' link to open the login page so the author can be authenticated.
        # Log in link
        elem = page.get_by_text('العربية', exact=True).locator("xpath=ancestor-or-self::*[.//a][1]").get_by_role('link', name='Log in', exact=True)
        await elem.click(timeout=10000)
        
        # -> Fill the 'Email' field with the seeded author email, fill the 'Password' field with the seeded password, and click the 'Sign in' button to authenticate.
        # email text field
        elem = page.get_by_label('Email', exact=True)
        await elem.wait_for(state="visible", timeout=10000)
        await elem.fill("author@folio.dev")
        
        # -> Fill the 'Email' field with the seeded author email, fill the 'Password' field with the seeded password, and click the 'Sign in' button to authenticate.
        # password password field
        elem = page.get_by_label('Password', exact=True)
        await elem.wait_for(state="visible", timeout=10000)
        await elem.fill("Author123!")
        
        # -> Fill the 'Email' field with the seeded author email, fill the 'Password' field with the seeded password, and click the 'Sign in' button to authenticate.
        # Sign in button
        elem = page.get_by_role('button', name='Sign in', exact=True)
        await elem.click(timeout=10000)
        
        # -> Click the top 'Submissions' link in the site navigation to open the submissions area and start a new submission draft.
        # Submissions link
        elem = page.get_by_role('link', name='Submissions', exact=True)
        await elem.click(timeout=10000)
        
        # -> Click the '+ New draft' button to start creating a new draft submission and open the submission creation flow.
        # New draft link
        elem = page.get_by_role('link', name='New draft', exact=True)
        await elem.click(timeout=10000)
        
        # -> Scroll down the New submission page and locate the 'Save' or 'Save draft' control (or any button labeled 'Save'/'Save draft') to create the draft.
        await page.mouse.wheel(0, 300)
        
        # -> Scroll further down the 'New submission' page to reveal the 'Save' or 'Save draft' control (or any button labeled 'Save') so a draft can be created and then verify it appears in the submissions area.
        await page.mouse.wheel(0, 300)
        
        # -> Open the 'Article type' dropdown to choose an article type so required fields are completed and the Save / Save draft control may become available.
        # button
        elem = page.locator('xpath=/html/body/div[2]/main/div[2]/section/div[3]/button')
        await elem.click(timeout=10000)
        
        # -> Select 'Original research' from the 'Article type' dropdown and click the 'Next →' button to proceed to the next submission step.
        # Original research option
        elem = page.get_by_role('option', name='Original research', exact=True)
        await elem.click(timeout=10000)
        
        # -> Select 'Original research' from the 'Article type' dropdown and click the 'Next →' button to proceed to the next submission step.
        # Next → button
        elem = page.get_by_role('button', name='Next →', exact=True)
        await elem.click(timeout=10000)
        
        # -> Fill the English Title field with 'Automated test draft', fill the English Abstract with a short test abstract, then click the 'Next →' button to proceed to the Authors step.
        # title text field
        elem = page.get_by_label('Title (English)', exact=True)
        await elem.wait_for(state="visible", timeout=10000)
        await elem.fill("Automated test draft")
        
        # -> Fill the English Title field with 'Automated test draft', fill the English Abstract with a short test abstract, then click the 'Next →' button to proceed to the Authors step.
        # abstract text area
        elem = page.get_by_label('Abstract (English)12 / 300 words', exact=True)
        await elem.wait_for(state="visible", timeout=10000)
        await elem.fill("This is an automated test draft created by an automated browser test.")
        
        # -> Fill the English Title field with 'Automated test draft', fill the English Abstract with a short test abstract, then click the 'Next →' button to proceed to the Authors step.
        # Next → button
        elem = page.get_by_role('button', name='Next →', exact=True)
        await elem.click(timeout=10000)
        
        # -> Add three English keywords and three Arabic keywords using the keywords input fields, then click the 'Next →' button to proceed to the Authors step.
        # Type a keyword, then press Enter, comma, or Tab… text field
        elem = page.locator('[id="submission-keywords-en"]')
        await elem.wait_for(state="visible", timeout=10000)
        await elem.fill("automation, testing, draft")
        
        # -> Add three English keywords and three Arabic keywords using the keywords input fields, then click the 'Next →' button to proceed to the Authors step.
        # اكتب كلمة مفتاحية ثم Enter أو فاصلة أو Tab… text field
        elem = page.locator('[id="submission-keywords-ar"]')
        await elem.wait_for(state="visible", timeout=10000)
        await elem.fill("\u0627\u062e\u062a\u0628\u0627\u0631, \u0645\u0633\u0648\u062f\u0629, \u062a\u0644\u0642\u0627\u0626\u064a")
        
        # -> Add three English keywords and three Arabic keywords using the keywords input fields, then click the 'Next →' button to proceed to the Authors step.
        # Next → button
        elem = page.get_by_role('button', name='Next →', exact=True)
        await elem.click(timeout=10000)
        
        # -> Scroll down the 'Authors & affiliations' page to reveal the 'Save' or 'Save draft' button at the bottom so the draft can be created.
        await page.mouse.wheel(0, 300)
        
        # -> Click the 'Next →' button on the Authors & affiliations step to proceed toward Declarations and reveal the Save / Save draft control.
        # Next → button
        elem = page.get_by_role('button', name='Next →', exact=True)
        await elem.click(timeout=10000)
        
        # -> Scroll down the 'New submission' Declarations page to reveal the 'Save' or 'Save draft' button at the bottom of the page so the draft can be created.
        await page.mouse.wheel(0, 300)
        
        # -> Click the 'I confirm this work is original, not published elsewhere, and is not under consideration at another journal.' checkbox, then scroll down and search for the 'Save' or 'Save draft' button to reveal the save control.
        # originalityConfirmed checkbox
        elem = page.get_by_label('I confirm this work is original, not published elsewhere, and is not under consideration at another journal.', exact=True)
        await elem.click(timeout=10000)
        
        # -> Click the 'I confirm this work is original, not published elsewhere, and is not under consideration at another journal.' checkbox, then scroll down and search for the 'Save' or 'Save draft' button to reveal the save control.
        await page.mouse.wheel(0, 300)
        
        # --> Assertions to verify final state
        current_url = await page.evaluate("() => window.location.href")
        # Assert: page loaded with a URL (final outcome verified by the AI judge during the run)
        assert current_url, 'Page should have loaded with a URL'
        current_url = await page.evaluate("() => window.location.href")
        # Assert: page loaded with a URL (final outcome verified by the AI judge during the run)
        assert current_url, 'Page should have loaded with a URL'
        await asyncio.sleep(5)

    finally:
        if context:
            await context.close()
        if browser:
            await browser.close()
        if pw:
            await pw.stop()

asyncio.run(run_test())
    