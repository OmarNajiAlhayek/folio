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
        
        # -> Click the 'Log in' link on the homepage to open the login page.
        # Log in link
        elem = page.get_by_text('العربية', exact=True).locator("xpath=ancestor-or-self::*[.//a][1]").get_by_role('link', name='Log in', exact=True)
        await elem.click(timeout=10000)
        
        # -> Fill the 'Email' field with the editor email (editor@folio.dev), fill the 'Password' field with the editor password (Editor123!), then click the 'Sign in' button to submit the login form.
        # email text field
        elem = page.get_by_label('Email', exact=True)
        await elem.wait_for(state="visible", timeout=10000)
        await elem.fill("editor@folio.dev")
        
        # -> Fill the 'Email' field with the editor email (editor@folio.dev), fill the 'Password' field with the editor password (Editor123!), then click the 'Sign in' button to submit the login form.
        # password password field
        elem = page.get_by_label('Password', exact=True)
        await elem.wait_for(state="visible", timeout=10000)
        await elem.fill("Editor123!")
        
        # -> Fill the 'Email' field with the editor email (editor@folio.dev), fill the 'Password' field with the editor password (Editor123!), then click the 'Sign in' button to submit the login form.
        # Sign in button
        elem = page.get_by_role('button', name='Sign in', exact=True)
        await elem.click(timeout=10000)
        
        # -> Click the 'Editor queue' link on the Dashboard to open the submissions queue.
        # Editor queue Evaluate incoming submissions... link
        elem = page.get_by_role('link', name='Editor queue Evaluate incoming submissions, assign peer reviewers, and record editorial decisions.', exact=True)
        await elem.click(timeout=10000)
        
        # -> Open the submission details by clicking the 'View' link for the first submission titled '[Perf] Corpus similarity load' to access its workflow controls.
        # [Perf] Corpus similarity load Submitted Updated... link
        elem = page.get_by_role('link', name='[Perf] Corpus similarity load Submitted Updated Jun 11, 2026, 9:36 AM View', exact=True)
        await elem.click(timeout=10000)
        
        # -> Open the 'Set status' dropdown in the Editor Command Center (the combobox currently showing 'Submitted') so the available workflow statuses become visible.
        # Submitted button
        elem = page.locator('xpath=/html/body/div[2]/main/div/div[2]/div/div[4]/div/button')
        await elem.click(timeout=10000)
        
        # -> Select 'Under review' from the open 'Set status' dropdown and click the 'Apply status' button to update the submission workflow.
        # Under review option
        elem = page.get_by_role('option', name='Under review', exact=True)
        await elem.click(timeout=10000)
        
        # -> Select 'Under review' from the open 'Set status' dropdown and click the 'Apply status' button to update the submission workflow.
        # Apply status button
        elem = page.get_by_role('button', name='Apply status', exact=True)
        await elem.click(timeout=10000)
        
        # -> Search the submission page for the text 'Under review' to confirm the status is displayed, then return to the submissions list using the '← Submissions' link to verify the submission remains visible in the queue.
        # ← Submissions link
        elem = page.get_by_role('link', name='← Submissions', exact=True)
        await elem.click(timeout=10000)
        
        # -> Click the 'Editor queue' tile on the Dashboard to open the submissions list so the queue can be inspected for the submission '[Perf] Corpus similarity load' and the status 'Under review'.
        # Editor queue Evaluate incoming submissions... link
        elem = page.get_by_role('link', name='Editor queue Evaluate incoming submissions, assign peer reviewers, and record editorial decisions.', exact=True)
        await elem.click(timeout=10000)
        
        # -> Open the submission '[Perf] Corpus similarity load' by clicking its 'View' link to verify the detail page displays the 'Under review' status and that the submission remains in the editor workflow.
        # [Perf] Corpus similarity load Under review... link
        elem = page.get_by_role('link', name='[Perf] Corpus similarity load Under review Updated Jun 11, 2026, 10:17 AM View', exact=True)
        await elem.click(timeout=10000)
        
        # -> Verify that the submission details page displays the text 'Under review', then click the '← Submissions' link to return to the submissions list.
        # ← Submissions link
        elem = page.get_by_role('link', name='← Submissions', exact=True)
        await elem.click(timeout=10000)
        
        # -> Open the submissions list by clicking the 'Editor queue' tile on the Dashboard so the submission can be opened and its 'Under review' status verified on the detail page.
        # Editor queue Evaluate incoming submissions... link
        elem = page.get_by_role('link', name='Editor queue Evaluate incoming submissions, assign peer reviewers, and record editorial decisions.', exact=True)
        await elem.click(timeout=10000)
        
        # -> Open the 'View' link for the submission '[Perf] Corpus similarity load' and verify the submission details page displays the 'Under review' status.
        # [Perf] Corpus similarity load Under review... link
        elem = page.get_by_role('link', name='[Perf] Corpus similarity load Under review Updated Jun 11, 2026, 10:17 AM View', exact=True)
        await elem.click(timeout=10000)
        
        # -> Confirm the 'Under review' text is shown on the submission details page, then navigate back to the submissions list and open the 'Editor queue' to verify the submission still shows 'Under review' in the queue.
        # ← Submissions link
        elem = page.get_by_role('link', name='← Submissions', exact=True)
        await elem.click(timeout=10000)
        
        # -> Confirm the 'Under review' text is shown on the submission details page, then navigate back to the submissions list and open the 'Editor queue' to verify the submission still shows 'Under review' in the queue.
        # Editor queue link
        elem = page.locator("xpath=/html/body/div[2]/main/header/nav/a[2]").nth(0)
        await elem.click(timeout=10000)
        
        # --> Assertions to verify final state
        
        # --> Verify the updated submission status is displayed
        # Assert: The submission '[Perf] Corpus similarity load' displays the status 'Under review'.
        await expect(page.locator("xpath=/html/body/div[2]/main/ul/li[3]/a").nth(0)).to_contain_text("Under review", timeout=15000), "The submission '[Perf] Corpus similarity load' displays the status 'Under review'."
        
        # --> Verify the submission remains visible in the editor workflow
        await page.locator("xpath=/html/body/div[2]/main/ul/li[3]/a").nth(0).scroll_into_view_if_needed()
        # Assert: The submission '[Perf] Corpus similarity load' is visible in the editor submissions list.
        await expect(page.locator("xpath=/html/body/div[2]/main/ul/li[3]/a").nth(0)).to_be_visible(timeout=15000), "The submission '[Perf] Corpus similarity load' is visible in the editor submissions list."
        await asyncio.sleep(5)

    finally:
        if context:
            await context.close()
        if browser:
            await browser.close()
        if pw:
            await pw.stop()

asyncio.run(run_test())
    