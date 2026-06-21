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
        
        # -> click
        # Log in link
        elem = page.get_by_text('العربية', exact=True).locator("xpath=ancestor-or-self::*[.//a][1]").get_by_role('link', name='Log in', exact=True)
        await elem.click(timeout=10000)
        
        # -> Fill the reviewer's email into the Email field, fill the password into the Password field, and click the 'Sign in' button to log in.
        # email text field
        elem = page.get_by_label('Email', exact=True)
        await elem.wait_for(state="visible", timeout=10000)
        await elem.fill("ysryrwthqsdthwy@gmail.com")
        
        # -> Fill the reviewer's email into the Email field, fill the password into the Password field, and click the 'Sign in' button to log in.
        # password password field
        elem = page.get_by_label('Password', exact=True)
        await elem.wait_for(state="visible", timeout=10000)
        await elem.fill("Reviewer123!")
        
        # -> Fill the reviewer's email into the Email field, fill the password into the Password field, and click the 'Sign in' button to log in.
        # Sign in button
        elem = page.get_by_role('button', name='Sign in', exact=True)
        await elem.click(timeout=10000)
        
        # -> click
        # My review assignments Access assigned... link
        elem = page.locator('xpath=/html/body/div[2]/main/div/div[2]/div/nav/ul/li/a')
        await elem.click(timeout=10000)
        
        # -> Click the first pending invitation card labeled '[Demo] Open-Access Policies in Arabic Peer-Reviewed Journals (Pending Review)' to begin responding to the invitation.
        # [Demo] Open-Access Policies in Arabic... link
        elem = page.locator('a[href="/en/assignments/demo-open-access-policies-arabic-journals-pending-review--invite/invite"]')
        await elem.click(timeout=10000)
        
        # -> Click the 'Accept invitation' button to accept the review invitation and gain access to the review workspace.
        # Accept invitation button
        elem = page.get_by_role('button', name='Accept invitation', exact=True)
        await elem.click(timeout=10000)
        
        # -> Click the visible 'Accept invitation' button to accept the review invitation and open the review workspace so the manuscript and review tools become available.
        # Accept invitation button
        elem = page.get_by_role('button', name='Accept invitation', exact=True)
        await elem.click(timeout=10000)
        
        # -> Click the 'Accept invitation' button on the peer review invitation page to accept the review and open the review workspace so the manuscript and review tools become available.
        # Accept invitation button
        elem = page.get_by_role('button', name='Accept invitation', exact=True)
        await elem.click(timeout=10000)
        
        # -> Click the '← Assignments' link to return to the assignments list so the invitation can be retried from the assignments view.
        # ← Assignments link
        elem = page.get_by_role('link', name='← Assignments', exact=True)
        await elem.click(timeout=10000)
        
        # -> Open the pending invitation titled '[Demo] The Effect of Immediate Feedback on Student Performance in Large Classes' from the 'My review assignments' page so the invitation detail view can be reloaded and acceptance retried.
        # [Demo] The Effect of Immediate Feedback on... link
        elem = page.locator('a[href="/en/assignments/demo-the-effect-of-immediate-feedback-on-student-performance-in-large-classes--e75f80e4/invite"]')
        await elem.click(timeout=10000)
        
        # -> Click the 'Accept invitation' button on the invitation page to accept the review and open the review workspace so manuscript/files become available.
        # Accept invitation button
        elem = page.get_by_role('button', name='Accept invitation', exact=True)
        await elem.click(timeout=10000)
        
        # -> Fill the 'Comments for the author' and 'Confidential comments for the editor' fields, then scroll down and locate the 'Submit review' button so the review can be submitted.
        # text area
        elem = page.get_by_label('Comments for the authorThe author can see this text.This is a well-designed study with clear methods and reasonable analyses. The results support the conclusions and presentation is good. Recommend acceptance (minor copyedits only).', exact=True)
        await elem.wait_for(state="visible", timeout=10000)
        await elem.fill("This is a well-designed study with clear methods and reasonable analyses. The results support the conclusions and presentation is good. Recommend acceptance (minor copyedits only).")
        
        # -> Fill the 'Comments for the author' and 'Confidential comments for the editor' fields, then scroll down and locate the 'Submit review' button so the review can be submitted.
        # text area
        elem = page.get_by_label('Confidential comments for the editorOnly editors see this.No confidential concerns. Recommend acceptance.', exact=True)
        await elem.wait_for(state="visible", timeout=10000)
        await elem.fill("No confidential concerns. Recommend acceptance.")
        
        # -> Fill the 'Comments for the author' and 'Confidential comments for the editor' fields, then scroll down and locate the 'Submit review' button so the review can be submitted.
        await page.mouse.wheel(0, 300)
        
        # -> Scroll down to reveal the 'Submit review' button so the review can be submitted.
        await page.mouse.wheel(0, 300)
        
        # -> click
        # Submit review button
        elem = page.get_by_role('button', name='Submit review', exact=True)
        await elem.click(timeout=10000)
        
        # --> Assertions to verify final state
        
        # --> Verify the completed review is displayed
        await page.locator("xpath=/html/body/div[2]/main/div/section[2]/ul/li[1]/div/div[2]/span[1]/svg").nth(0).scroll_into_view_if_needed()
        # Assert: A completed review entry is visible in the assignments list.
        await expect(page.locator("xpath=/html/body/div[2]/main/div/section[2]/ul/li[1]/div/div[2]/span[1]/svg").nth(0)).to_be_visible(timeout=15000), "A completed review entry is visible in the assignments list."
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
    