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
        
        # -> Click the 'Log in' link in the site header to open the login page.
        # Log in link
        elem = page.get_by_text('العربية', exact=True).locator("xpath=ancestor-or-self::*[.//a][1]").get_by_role('link', name='Log in', exact=True)
        await elem.click(timeout=10000)
        
        # -> Fill the Email field with the author address and the Password field with the author's password, then click the 'Sign in' button.
        # email text field
        elem = page.get_by_label('Email', exact=True)
        await elem.wait_for(state="visible", timeout=10000)
        await elem.fill("o65834757@gmail.com")
        
        # -> Fill the Email field with the author address and the Password field with the author's password, then click the 'Sign in' button.
        # password password field
        elem = page.get_by_label('Password', exact=True)
        await elem.wait_for(state="visible", timeout=10000)
        await elem.fill("Author123!")
        
        # -> Fill the Email field with the author address and the Password field with the author's password, then click the 'Sign in' button.
        # Sign in button
        elem = page.get_by_role('button', name='Sign in', exact=True)
        await elem.click(timeout=10000)
        
        # -> Click the 'Submissions' link in the header to open the submissions area.
        # Submissions link
        elem = page.get_by_role('link', name='Submissions', exact=True)
        await elem.click(timeout=10000)
        
        # -> Open the draft titled '[Demo] Measuring Digital Learning Competencies Among University Students' by clicking its 'View' / item entry to load the submission detail page.
        # [Demo] Measuring Digital Learning Competencies... link
        elem = page.locator('a[href="/en/submissions/demo-measuring-digital-learning-competencies-among-university-students"]')
        await elem.click(timeout=10000)
        
        # -> Click the 'Submit for review' button on the submission detail page to submit the manuscript for editorial review.
        # Submit for review button
        elem = page.get_by_role('button', name='Submit for review', exact=True)
        await elem.click(timeout=10000)
        
        # --> Assertions to verify final state
        
        # --> Verify the submission detail reflects a submitted state
        # Assert: The workflow shows the 'Manuscript Submitted' step is completed (check mark present).
        await expect(page.locator("xpath=/html/body/div[2]/main/div/div[2]/div/div/div[1]/span").nth(0)).to_have_text("\u2713", timeout=15000), "The workflow shows the 'Manuscript Submitted' step is completed (check mark present)."
        # Assert: The workflow indicates files were archived (count shows 2).
        await expect(page.locator("xpath=/html/body/div[2]/main/div/div[2]/div/div/div[2]/span").nth(0)).to_have_text("2", timeout=15000), "The workflow indicates files were archived (count shows 2)."
        
        # --> Verify the submission is no longer a draft
        # Assert: The workflow shows the manuscript as submitted (a check mark is visible).
        await expect(page.locator("xpath=/html/body/div[2]/main/div/div[2]/div/div/div[1]/span").nth(0)).to_have_text("\u2713", timeout=15000), "The workflow shows the manuscript as submitted (a check mark is visible)."
        await asyncio.sleep(5)

    finally:
        if context:
            await context.close()
        if browser:
            await browser.close()
        if pw:
            await pw.stop()

asyncio.run(run_test())
    