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
        
        # -> Open the registration page by navigating to the 'Register' page (URL /en/register) so the registration form can be located and inspected.
        await page.goto("http://localhost:5240/en/register")
        try:
            await page.wait_for_load_state("domcontentloaded", timeout=5000)
        except Exception:
            pass
        
        # -> Fill the registration form: enter values into the 'Display name', 'Email', 'Password (min 8)', and 'Affiliation' fields, then click the 'Create account' button.
        # displayName text field
        elem = page.get_by_label('Display name', exact=True)
        await elem.wait_for(state="visible", timeout=10000)
        await elem.fill("Auto Test Author")
        
        # -> Fill the registration form: enter values into the 'Display name', 'Email', 'Password (min 8)', and 'Affiliation' fields, then click the 'Create account' button.
        # email text field
        elem = page.get_by_label('EmailAn institutional email helps editors verify your affiliation (recommended, not required).', exact=True)
        await elem.wait_for(state="visible", timeout=10000)
        await elem.fill("autotest+20260611@example.com")
        
        # -> Fill the registration form: enter values into the 'Display name', 'Email', 'Password (min 8)', and 'Affiliation' fields, then click the 'Create account' button.
        # password password field
        elem = page.get_by_label('Password (min 8)', exact=True)
        await elem.wait_for(state="visible", timeout=10000)
        await elem.fill("Author123!")
        
        # -> Fill the registration form: enter values into the 'Display name', 'Email', 'Password (min 8)', and 'Affiliation' fields, then click the 'Create account' button.
        # University, department, or research unit text field
        elem = page.get_by_label('Affiliation', exact=True)
        await elem.wait_for(state="visible", timeout=10000)
        await elem.fill("Test University")
        
        # -> Fill the registration form: enter values into the 'Display name', 'Email', 'Password (min 8)', and 'Affiliation' fields, then click the 'Create account' button.
        # Create account button
        elem = page.get_by_role('button', name='Create account', exact=True)
        await elem.click(timeout=10000)
        
        # -> Fill the Password field with 'Author123!' and click the 'Create account' button to submit the registration form.
        # password password field
        elem = page.get_by_label('Password (min 8)', exact=True)
        await elem.wait_for(state="visible", timeout=10000)
        await elem.fill("Author123!")
        
        # -> Fill the Password field with 'Author123!' and click the 'Create account' button to submit the registration form.
        # Create account button
        elem = page.get_by_role('button', name='Create account', exact=True)
        await elem.click(timeout=10000)
        
        # -> Fill the Password field with 'Author123!' and click the 'Create account' button to submit the registration form.
        # password password field
        elem = page.get_by_label('Password (min 8)', exact=True)
        await elem.wait_for(state="visible", timeout=10000)
        await elem.fill("Author123!")
        
        # -> Fill the Password field with 'Author123!' and click the 'Create account' button to submit the registration form.
        # Create account button
        elem = page.get_by_role('button', name='Create account', exact=True)
        await elem.click(timeout=10000)
        
        # -> Fill 'Author123!' into the 'Password (min 8)' field and click the 'Create account' button to submit the registration form.
        # Create account button
        elem = page.get_by_role('button', name='Create account', exact=True)
        await elem.click(timeout=10000)
        
        # -> Open the 'Log in' page and sign in using the seeded author account (email o65834757@gmail.com and password Author123!) to verify an authenticated session is reachable.
        await page.goto("http://localhost:5240/en/login")
        try:
            await page.wait_for_load_state("domcontentloaded", timeout=5000)
        except Exception:
            pass
        
        # -> Fill the Email field with the seeded author email 'o65834757@gmail.com', fill the Password field with 'Author123!', then click the 'Sign in' button to authenticate.
        # email text field
        elem = page.get_by_label('Email', exact=True)
        await elem.wait_for(state="visible", timeout=10000)
        await elem.fill("o65834757@gmail.com")
        
        # -> Fill the Email field with the seeded author email 'o65834757@gmail.com', fill the Password field with 'Author123!', then click the 'Sign in' button to authenticate.
        # password password field
        elem = page.get_by_label('Password', exact=True)
        await elem.wait_for(state="visible", timeout=10000)
        await elem.fill("Author123!")
        
        # -> Fill the Email field with the seeded author email 'o65834757@gmail.com', fill the Password field with 'Author123!', then click the 'Sign in' button to authenticate.
        # Sign in button
        elem = page.get_by_role('button', name='Sign in', exact=True)
        await elem.click(timeout=10000)
        
        # -> click
        # My submissions Submit new drafts, track... link
        elem = page.get_by_role('link', name='My submissions Submit new drafts, track revisions, and manage your active manuscripts.', exact=True)
        await elem.click(timeout=10000)
        
        # -> Click the '+ New draft' button on the Submissions page to open the draft submission workflow and verify the draft creation page or modal appears.
        # New draft link
        elem = page.get_by_role('link', name='New draft', exact=True)
        await elem.click(timeout=10000)
        
        # --> Assertions to verify final state
        
        # --> Verify the authenticated session page is displayed
        # Assert: Expected the session page URL to contain '/en/dashboard'.
        await expect(page).to_have_url(re.compile("/en/dashboard"), timeout=15000), "Expected the session page URL to contain '/en/dashboard'."
        await asyncio.sleep(5)

    finally:
        if context:
            await context.close()
        if browser:
            await browser.close()
        if pw:
            await pw.stop()

asyncio.run(run_test())
    