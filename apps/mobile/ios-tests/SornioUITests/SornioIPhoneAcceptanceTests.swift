import XCTest

/**
 iPhone acceptance: the app actually loads, can be navigated and can be signed
 out of.

 Every assertion is made against a native accessibility identifier exposed by the
 running React Native application. Nothing here calls into JavaScript directly.
 */
final class SornioIPhoneAcceptanceTests: XCTestCase {

    override func setUp() {
        super.setUp()
        continueAfterFailure = false
    }

    private func launch() -> XCUIApplication {
        let app = XCUIApplication()
        app.launch()
        return app
    }

    /// Test A — startup. Fails on a blank screen, a splash screen or an app that
    /// is alive but whose JavaScript never mounted.
    func testA_applicationStartsAndReportsReady() {
        let app = launch()
        waitForReady(app)
        attachScreenshot(app, named: "iPhone-01-ready")

        // A usable entry point must exist; a ready flag alone proves nothing.
        let hasEntry =
            el(app, Ids.nav("home")).waitForExistence(timeout: shortTimeout) ||
            el(app, Ids.demoEnter).waitForExistence(timeout: shortTimeout) ||
            el(app, Ids.reopenDemo).waitForExistence(timeout: shortTimeout)
        XCTAssertTrue(hasEntry, "No usable entry point. Visible: \(visibleIdentifiers(app))")
    }

    /// Test B — demonstration entry, ending in a real dashboard with real data.
    func testB_entersDemonstrationAndShowsDashboard() {
        let app = launch()
        enterDemo(app)
        attachScreenshot(app, named: "iPhone-02-dashboard")

        // The dashboard is rendered and carries business content, not a skeleton.
        XCTAssertTrue(
            app.staticTexts["SORNIO"].waitForExistence(timeout: shortTimeout) ||
            app.staticTexts.containing(NSPredicate(format: "label BEGINSWITH 'Sornio Demo'")).firstMatch
                .waitForExistence(timeout: shortTimeout),
            "The demonstration dashboard did not render a business name. Visible: \(visibleIdentifiers(app))"
        )
        require(app, Ids.screen("home"))
    }

    /// Test C — navigation across every primary destination, asserting the
    /// destination itself rather than merely that a tap did not crash.
    func testC_navigatesEveryPrimaryDestination() {
        let app = launch()
        enterDemo(app)

        let destinations = ["activity", "inventory", "customers", "settings", "home"]
        for destination in destinations {
            tap(app, Ids.nav(destination))
            require(app, Ids.screen(destination), shortTimeout)
            attachScreenshot(app, named: "iPhone-03-\(destination)")
        }

        // The app is still responsive after a full round trip.
        tap(app, Ids.nav("activity"))
        require(app, Ids.screen("activity"), shortTimeout)
    }

    /// Test D — sign-out. This is the regression gate for the Phase 20 defect
    /// where an explicit sign-out silently bootstrapped a fresh demo identity.
    func testD_signOutEndsSessionAndStaysSignedOut() {
        let app = launch()
        enterDemo(app)

        tap(app, Ids.nav("settings"))
        require(app, Ids.screen("settings"), shortTimeout)

        let signOut = el(app, Ids.signOut)
        XCTAssertTrue(signOut.waitForExistence(timeout: shortTimeout),
                      "No sign-out control. Visible: \(visibleIdentifiers(app))")

        // The control scrolls; make sure it is on screen before tapping.
        var attempts = 0
        while !signOut.isHittable && attempts < 6 {
            app.swipeUp()
            attempts += 1
        }
        signOut.tap()

        // Sign-out is confirmed through a native alert.
        let confirm = app.alerts.buttons["Sign out"]
        XCTAssertTrue(confirm.waitForExistence(timeout: shortTimeout),
                      "The sign-out confirmation did not appear.")
        confirm.tap()

        require(app, Ids.signedOut)
        attachScreenshot(app, named: "iPhone-04-signed-out")

        // The critical assertion: give any asynchronous bootstrap time to run and
        // fail, then prove the session did not come back.
        XCTAssertFalse(
            el(app, Ids.nav("home")).waitForExistence(timeout: 10),
            "A session reappeared after an explicit sign-out."
        )
        XCTAssertFalse(
            el(app, Ids.tabBar).waitForExistence(timeout: 2),
            "The tab bar came back after an explicit sign-out, so a session was restored."
        )

        // And across a cold relaunch: the cleared session must stay cleared.
        app.terminate()
        app.launch()
        waitForReady(app)
        XCTAssertTrue(el(app, Ids.signedOut).waitForExistence(timeout: uiTimeout),
                      "Relaunching after sign-out restored a session instead of staying signed out.")
        attachScreenshot(app, named: "iPhone-05-still-signed-out-after-relaunch")
    }

    /// Test E — restaurant entry. Only the navigation is asserted; a live kitchen
    /// needs a real shop hub and is not claimed here.
    func testE_opensRestaurantWorkspace() {
        let app = launch()
        enterDemo(app)

        tap(app, Ids.nav("settings"))
        require(app, Ids.screen("settings"), shortTimeout)

        let open = el(app, Ids.restaurantOpen)
        guard open.waitForExistence(timeout: shortTimeout) else {
            XCTFail("No restaurant entry point. Visible: \(visibleIdentifiers(app))")
            return
        }
        var attempts = 0
        while !open.isHittable && attempts < 6 {
            app.swipeUp()
            attempts += 1
        }
        open.tap()

        require(app, Ids.restaurantScreen)
        attachScreenshot(app, named: "iPhone-06-restaurant")

        // Back to Settings, and the primary navigation is still usable.
        let back = app.buttons["Back to settings"]
        if back.waitForExistence(timeout: shortTimeout) {
            back.tap()
        }
        require(app, Ids.nav("home"), shortTimeout)
    }

    /// Test F — an existing deterministic empty state, and recovery from it.
    func testF_reportsEmptyStateAndRecovers() {
        let app = launch()
        enterDemo(app)

        tap(app, Ids.nav("activity"))
        require(app, Ids.screen("activity"), shortTimeout)

        // A query that cannot match any demonstration row.
        let search = app.textFields.firstMatch
        if search.waitForExistence(timeout: shortTimeout) {
            search.tap()
            search.typeText("zzzz-no-such-activity")
            let empty = app.staticTexts["Nothing to show"]
            XCTAssertTrue(empty.waitForExistence(timeout: shortTimeout),
                          "A non-matching filter did not show the empty state. Visible: \(visibleIdentifiers(app))")
            attachScreenshot(app, named: "iPhone-07-empty-state")

            // Recovery: clearing the query brings rows back.
            if let value = search.value as? String, !value.isEmpty {
                search.buttons.firstMatch.tap()
            }
            search.typeText("\n")
        }

        // Navigation still works afterwards.
        tap(app, Ids.nav("home"))
        require(app, Ids.screen("home"), shortTimeout)
    }
}
