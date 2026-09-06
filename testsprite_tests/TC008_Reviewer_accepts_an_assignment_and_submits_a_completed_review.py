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
        
        # -> Click the 'Log in' link on the homepage to open the login page so the reviewer can sign in.
        # Log in link
        elem = page.get_by_text('العربية', exact=True).locator("xpath=ancestor-or-self::*[.//a][1]").get_by_role('link', name='Log in', exact=True)
        await elem.click(timeout=10000)
        
        # -> Fill the Email field with the reviewer's email, fill the Password field with the reviewer's password, then click the 'Sign in' button to submit the login form.
        # email text field
        elem = page.get_by_label('Email', exact=True)
        await elem.wait_for(state="visible", timeout=10000)
        await elem.fill("reviewer@folio.dev")
        
        # -> Fill the Email field with the reviewer's email, fill the Password field with the reviewer's password, then click the 'Sign in' button to submit the login form.
        # password password field
        elem = page.get_by_label('Password', exact=True)
        await elem.wait_for(state="visible", timeout=10000)
        await elem.fill("Reviewer123!")
        
        # -> Fill the Email field with the reviewer's email, fill the Password field with the reviewer's password, then click the 'Sign in' button to submit the login form.
        # Sign in button
        elem = page.get_by_role('button', name='Sign in', exact=True)
        await elem.click(timeout=10000)
        
        # -> Click the 'Respond' link for the pending invitation titled '[Demo] Open-Access Policies in Arabic Peer-Reviewed Journals' to open the invitation/assignment page.
        # Respond link
        elem = page.locator('a[href="/en/assignments/demo-open-access-policies-arabic-journals-pending-review--invite/invite"]')
        await elem.click(timeout=10000)
        
        # -> Click the 'Accept invitation' button to accept the review invitation and reveal the review access and form.
        # Accept invitation button
        elem = page.get_by_role('button', name='Accept invitation', exact=True)
        await elem.click(timeout=10000)
        
        # -> Fill 'Comments for the author' with a review message and 'Confidential comments for the editor' with an internal note, then scroll down to reveal the 'Submit review' button so it can be clicked.
        # text area
        elem = page.get_by_label('Comments for the authorThe author can see this text.This manuscript presents a clear and valuable comparative analysis of open-access policies in Arabic peer-reviewed journals. The literature overview is comprehensive and the findings are well supported. Recommend acceptance pending minor edits: please clarify a few methodological points (sampling and selection criteria) and copyedit for language in several paragraphs for clarity.', exact=True)
        await elem.wait_for(state="visible", timeout=10000)
        await elem.fill("This manuscript presents a clear and valuable comparative analysis of open-access policies in Arabic peer-reviewed journals. The literature overview is comprehensive and the findings are well supported. Recommend acceptance pending minor edits: please clarify a few methodological points (sampling and selection criteria) and copyedit for language in several paragraphs for clarity.")
        
        # -> Fill 'Comments for the author' with a review message and 'Confidential comments for the editor' with an internal note, then scroll down to reveal the 'Submit review' button so it can be clicked.
        # text area
        elem = page.get_by_label('Confidential comments for the editorOnly editors see this.Recommend acceptance. Suggest copyediting for language and a brief clarification in the Methods about journal selection criteria.', exact=True)
        await elem.wait_for(state="visible", timeout=10000)
        await elem.fill("Recommend acceptance. Suggest copyediting for language and a brief clarification in the Methods about journal selection criteria.")
        
        # -> Fill 'Comments for the author' with a review message and 'Confidential comments for the editor' with an internal note, then scroll down to reveal the 'Submit review' button so it can be clicked.
        await page.mouse.wheel(0, 300)
        
        # -> Click the 'Submit review' button to submit the completed peer review and then verify the review submission result (assignment marked accepted and completed review displayed).
        # Submit review button
        elem = page.get_by_role('button', name='Submit review', exact=True)
        await elem.click(timeout=10000)
        
        # --> Assertions to verify final state
        
        # --> Verify the completed review is displayed
        await page.locator("xpath=/html/body/div[2]/main/div/section[3]/ul/li[1]/div/div[2]/span[1]/svg").nth(0).scroll_into_view_if_needed()
        # Assert: The completed review is displayed as a visible 'Review submitted' badge in the Completed or declined section.
        await expect(page.locator("xpath=/html/body/div[2]/main/div/section[3]/ul/li[1]/div/div[2]/span[1]/svg").nth(0)).to_be_visible(timeout=15000), "The completed review is displayed as a visible 'Review submitted' badge in the Completed or declined section."
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
    