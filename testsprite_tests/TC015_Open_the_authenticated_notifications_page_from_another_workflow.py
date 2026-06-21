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
        
        # -> Click the 'Log in' link on the homepage to open the login page so credentials can be entered.
        # Log in link
        elem = page.get_by_text('العربية', exact=True).locator("xpath=ancestor-or-self::*[.//a][1]").get_by_role('link', name='Log in', exact=True)
        await elem.click(timeout=10000)
        
        # -> Fill the Email field with the author email (o65834757@gmail.com), fill the Password field with Author123!, then click the 'Sign in' button to submit the login form.
        # email text field
        elem = page.get_by_label('Email', exact=True)
        await elem.wait_for(state="visible", timeout=10000)
        await elem.fill("o65834757@gmail.com")
        
        # -> Fill the Email field with the author email (o65834757@gmail.com), fill the Password field with Author123!, then click the 'Sign in' button to submit the login form.
        # password password field
        elem = page.get_by_label('Password', exact=True)
        await elem.wait_for(state="visible", timeout=10000)
        await elem.fill("Author123!")
        
        # -> Fill the Email field with the author email (o65834757@gmail.com), fill the Password field with Author123!, then click the 'Sign in' button to submit the login form.
        # Sign in button
        elem = page.get_by_role('button', name='Sign in', exact=True)
        await elem.click(timeout=10000)
        
        # -> Open the Notifications panel by clicking the 'Notifications' (bell) button in the header to view inbox items.
        # Notifications, more than 9 unread button
        elem = page.get_by_role('button', name='Notifications, more than 9 unread', exact=True)
        await elem.click(timeout=10000)
        
        # -> Click the 'Copyedit queries' notification in the Notifications panel to open the related workflow item page.
        # Copyedit queries New copyedit queries on [Demo]... button
        elem = page.locator('xpath=/html/body/header/div/nav/div[2]/div/ul/li/div/div[2]/button')
        await elem.click(timeout=10000)
        
        # -> Open the Notifications panel by clicking the 'Notifications' (bell) button in the header and verify the notification remains accessible (first verify the related workflow page is displayed by finding the submission title on the page).
        # Notifications, more than 9 unread button
        elem = page.get_by_role('button', name='Notifications, more than 9 unread', exact=True)
        await elem.click(timeout=10000)
        
        # -> Reopen the Notifications panel and confirm the 'Copyedit queries' notification for '[Demo] Improving Wireless Sensor Network Efficiency in Industrial Environments' is present in the inbox.
        # Notifications, more than 9 unread button
        elem = page.get_by_role('button', name='Notifications, more than 9 unread', exact=True)
        await elem.click(timeout=10000)
        
        # -> Open the Notifications panel by clicking the 'Notifications' (bell) button in the header and check that the 'Copyedit queries' notification for the submission is present in the inbox.
        # Notifications, more than 9 unread button
        elem = page.get_by_role('button', name='Notifications, more than 9 unread', exact=True)
        await elem.click(timeout=10000)
        
        # -> Click the 'Copyedit queries' notification in the Notifications panel to open the related workflow item and verify the submission page is displayed.
        # Copyedit queries New copyedit queries on [Demo]... button
        elem = page.locator('xpath=/html/body/header/div/nav/div[2]/div/ul/li[10]/div/div[2]/button')
        await elem.click(timeout=10000)
        
        # -> Open the Notifications panel by clicking the '9+' Notifications bell in the header to reveal the notification list.
        # Notifications, more than 9 unread button
        elem = page.get_by_role('button', name='Notifications, more than 9 unread', exact=True)
        await elem.click(timeout=10000)
        
        # -> Click the 'View notifications' link in the notifications dropdown to open the full notifications page so the specific 'Copyedit queries' notification can be located and clicked.
        # View notifications link
        elem = page.get_by_role('link', name='View notifications', exact=True)
        await elem.click(timeout=10000)
        
        # -> Click the 'Copyedit queries' notification that reads 'New copyedit queries on [Demo] Improving Wireless Sensor Network Efficiency in Industrial Environments' to open the related workflow/submission page.
        # Copyedit queries New copyedit queries on [Demo]... button
        elem = page.locator('xpath=/html/body/div[2]/main/div[4]/div/ul/li[3]/div/div[2]/button')
        await elem.click(timeout=10000)
        
        # -> Click the 'Notifications' (bell) button in the header to open the notifications dropdown so the inbox can be inspected and the 'Copyedit queries' notification re-located.
        # Notifications, more than 9 unread button
        elem = page.get_by_role('button', name='Notifications, more than 9 unread', exact=True)
        await elem.click(timeout=10000)
        
        # -> Click the 'Copyedit queries' notification in the open Notifications dropdown to open the related workflow/submission page and verify the submission title '[Demo] Improving Wireless Sensor Network Efficiency in Industrial Environments' is...
        # Copyedit queries New copyedit queries on [Demo]... button
        elem = page.locator('xpath=/html/body/header/div/nav/div[2]/div/ul/li[10]/div/div[2]/button')
        await elem.click(timeout=10000)
        
        # -> Open the Notifications dropdown by clicking the 'Notifications' (bell) button in the header so the notification items render and can be clicked.
        # Notifications, more than 9 unread button
        elem = page.get_by_role('button', name='Notifications, more than 9 unread', exact=True)
        await elem.click(timeout=10000)
        
        # --> Assertions to verify final state
        
        # --> Verify the related workflow page is displayed
        # Assert: The browser URL shows the related submission page for the workflow item.
        await expect(page).to_have_url(re.compile("/en/submissions/demo\\-improving\\-wireless\\-sensor\\-network\\-efficiency\\-in\\-industrial\\-environments"), timeout=15000), "The browser URL shows the related submission page for the workflow item."
        await page.locator("xpath=/html/body/div[2]/main/header/nav/a").nth(0).scroll_into_view_if_needed()
        # Assert: The submission page's back link '← Submissions' is visible, confirming the related workflow page is displayed.
        await expect(page.locator("xpath=/html/body/div[2]/main/header/nav/a").nth(0)).to_be_visible(timeout=15000), "The submission page's back link '\u2190 Submissions' is visible, confirming the related workflow page is displayed."
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
    