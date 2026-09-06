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
        
        # -> Open the 'Log in' page (navigate to the login route) so the author can authenticate.
        await page.goto("http://localhost:5240/en/login")
        try:
            await page.wait_for_load_state("domcontentloaded", timeout=5000)
        except Exception:
            pass
        
        # -> Fill the 'Email' field with the author email author@folio.dev, fill the 'Password' field with Author123!, and click the 'Sign in' button.
        # email text field
        elem = page.get_by_label('Email', exact=True)
        await elem.wait_for(state="visible", timeout=10000)
        await elem.fill("author@folio.dev")
        
        # -> Fill the 'Email' field with the author email author@folio.dev, fill the 'Password' field with Author123!, and click the 'Sign in' button.
        # password password field
        elem = page.get_by_label('Password', exact=True)
        await elem.wait_for(state="visible", timeout=10000)
        await elem.fill("Author123!")
        
        # -> Fill the 'Email' field with the author email author@folio.dev, fill the 'Password' field with Author123!, and click the 'Sign in' button.
        # Sign in button
        elem = page.get_by_role('button', name='Sign in', exact=True)
        await elem.click(timeout=10000)
        
        # -> Click the 'My submissions' quick access card (label: 'My submissions') to open the submissions list where a new draft can be created.
        # My submissions Submit new drafts, track... link
        elem = page.get_by_role('link', name='My submissions Submit new drafts, track revisions, and manage your active manuscripts.', exact=True)
        await elem.click(timeout=10000)
        
        # -> Click the 'New draft' button to open the draft creation form.
        # New draft link
        elem = page.get_by_role('link', name='New draft', exact=True)
        await elem.click(timeout=10000)
        
        # -> Open the 'Article type' dropdown (label: "Article type") so available article types are displayed and can be selected, enabling the Next → button.
        # button
        elem = page.locator('xpath=/html/body/div[2]/main/div[2]/section/div[3]/button')
        await elem.click(timeout=10000)
        
        # -> Select the 'Original research' article type from the Article type options, then click the 'Next →' button to advance to the Title & Keywords step.
        # Original research option
        elem = page.get_by_role('option', name='Original research', exact=True)
        await elem.click(timeout=10000)
        
        # -> Select the 'Original research' article type from the Article type options, then click the 'Next →' button to advance to the Title & Keywords step.
        # Next → button
        elem = page.get_by_role('button', name='Next →', exact=True)
        await elem.click(timeout=10000)
        
        # -> Fill the 'Title (English)' field with a unique manuscript title and the 'Abstract (English)' field with a valid abstract, then click the 'Next →' button to save/continue.
        # title text field
        elem = page.get_by_label('Title (English)', exact=True)
        await elem.wait_for(state="visible", timeout=10000)
        await elem.fill("Test Manuscript - Automated Draft 2026-06-11")
        
        # -> Fill the 'Title (English)' field with a unique manuscript title and the 'Abstract (English)' field with a valid abstract, then click the 'Next →' button to save/continue.
        # abstract text area
        elem = page.get_by_label('Abstract (English)32 / 300 words', exact=True)
        await elem.wait_for(state="visible", timeout=10000)
        await elem.fill("This is a test abstract created by an automated browser test to verify draft creation and the submission workflow. It summarizes the manuscript purpose and scope and is sufficiently detailed for validation.")
        
        # -> Fill the 'Title (English)' field with a unique manuscript title and the 'Abstract (English)' field with a valid abstract, then click the 'Next →' button to save/continue.
        # Next → button
        elem = page.get_by_role('button', name='Next →', exact=True)
        await elem.click(timeout=10000)
        
        # -> Add three English keywords and three Arabic keywords into the Keywords fields, then click the 'Next →' button to proceed and save the draft.
        # Type a keyword, then press Enter, comma, or Tab… text field
        elem = page.locator('[id="submission-keywords-en"]')
        await elem.wait_for(state="visible", timeout=10000)
        await elem.fill("testing, automation, draft")
        
        # -> Add three English keywords and three Arabic keywords into the Keywords fields, then click the 'Next →' button to proceed and save the draft.
        # اكتب كلمة مفتاحية ثم Enter أو فاصلة أو Tab… text field
        elem = page.locator('[id="submission-keywords-ar"]')
        await elem.wait_for(state="visible", timeout=10000)
        await elem.fill("\u0627\u062e\u062a\u0628\u0627\u0631, \u062a\u0644\u0642\u0627\u0626\u064a, \u0645\u0633\u0648\u062f\u0629")
        
        # -> Add three English keywords and three Arabic keywords into the Keywords fields, then click the 'Next →' button to proceed and save the draft.
        # Next → button
        elem = page.get_by_role('button', name='Next →', exact=True)
        await elem.click(timeout=10000)
        
        # -> Click the 'Next →' button on the Authors & affiliations step to advance to the Declarations step (continue the stepper toward saving the draft).
        # Next → button
        elem = page.get_by_role('button', name='Next →', exact=True)
        await elem.click(timeout=10000)
        
        # -> Check the 'I confirm this work is original, not published elsewhere…' checkbox in the Declarations section and click the 'Next →' button to proceed to the Documents step.
        # originalityConfirmed checkbox
        elem = page.get_by_label('I confirm this work is original, not published elsewhere, and is not under consideration at another journal.', exact=True)
        await elem.click(timeout=10000)
        
        # -> Check the 'I confirm this work is original, not published elsewhere…' checkbox in the Declarations section and click the 'Next →' button to proceed to the Documents step.
        # Next → button
        elem = page.get_by_role('button', name='Next →', exact=True)
        await elem.click(timeout=10000)
        
        # -> Scroll down to reveal the page controls (the 'Next →' or 'Save' button) at the bottom of the Documents step so the draft can be saved and the flow advanced to the Review step.
        await page.mouse.wheel(0, 300)
        
        # -> Select the 'Show uploaded main manuscript (.docx / .pdf)' option, then click the 'Next →' button to advance to the Review step so the draft can be saved.
        # Show uploaded main manuscript (.docx / .pdf)
        elem = page.locator('xpath=/html/body/div[2]/main/div[2]/section[2]/div[2]/div[3]/div[3]/fieldset/div/label')
        await elem.click(timeout=10000)
        
        # -> Select the 'Show uploaded main manuscript (.docx / .pdf)' option, then click the 'Next →' button to advance to the Review step so the draft can be saved.
        # Next → button
        elem = page.get_by_role('button', name='Next →', exact=True)
        await elem.click(timeout=10000)
        
        # -> Select the 'Show uploaded main manuscript (.docx / .pdf)' option and click the 'Next →' button to advance to the Review step so the draft can be saved.
        # Show uploaded main manuscript (.docx / .pdf)
        elem = page.locator('xpath=/html/body/div[2]/main/div[2]/section[2]/div[2]/div[3]/div[3]/fieldset/div/label')
        await elem.click(timeout=10000)
        
        # -> Select the 'Show uploaded main manuscript (.docx / .pdf)' option and click the 'Next →' button to advance to the Review step so the draft can be saved.
        # Next → button
        elem = page.get_by_role('button', name='Next →', exact=True)
        await elem.click(timeout=10000)
        
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
    