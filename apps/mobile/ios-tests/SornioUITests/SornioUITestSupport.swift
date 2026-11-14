import XCTest

/**
 Shared helpers for the Sornio native acceptance suites.

 Two rules shape this file:

 1. Wait for the application, never for a clock. `app.ready` is published by the
    React tree only after it has committed, so it cannot be true while the app
    is still showing a splash screen or waiting for Metro.
 2. Recover to a known screen instead of assuming a clean install. A session
    legitimately survives a relaunch, so a suite that assumed "first run" would
    fail for the wrong reason. `enterDemo()` accepts whichever of the three
    start states the device is actually in.
 */
enum Ids {
    static let ready = "app.ready"
    static let chooser = "app.mode-chooser"
    static let demoEnter = "app.demo.enter"

    static func nav(_ screen: String) -> String { "nav.\(screen)" }
    static func screen(_ screen: String) -> String { "screen.\(screen)" }

    static let rail = "tablet.rail"
    static let tabBar = "phone.tabbar"
    static let list = "tablet.list"
    static let detail = "tablet.detail"

    static let restaurantOpen = "restaurant.open"
    static let restaurantKitchen = "restaurant.kitchen"
    static let restaurantScreen = "screen.restaurant"

    /// Phase markers, so a failure reports where the app actually was.
    static let phasePrefix = "app.phase."
    static let phaseBoot = "app.phase.boot"
    static let phaseDemo = "app.phase.demo"
    static let phaseSignedOut = "app.phase.signed-out"
    static let phaseError = "app.phase.error"

    static let signOut = "session.signout"
    static let signedOut = "session.signed-out"
    static let reopenDemo = "session.reopen-demo"
}

extension XCTestCase {
    /// Generous but bounded: a cold Release launch on a loaded runner is slow.
    var uiTimeout: TimeInterval { 90 }
    /// For an element the app has already shown it can render.
    var shortTimeout: TimeInterval { 20 }

    func el(_ app: XCUIApplication, _ identifier: String) -> XCUIElement {
        // testID maps to accessibilityIdentifier, which sits on the element
        // regardless of whether RN exposed it as a button, a tab or a plain view.
        app.descendants(matching: .any).matching(identifier: identifier).firstMatch
    }

    @discardableResult
    func waitFor(_ app: XCUIApplication, _ identifier: String, _ timeout: TimeInterval? = nil) -> Bool {
        el(app, identifier).waitForExistence(timeout: timeout ?? uiTimeout)
    }

    func require(_ app: XCUIApplication, _ identifier: String, _ timeout: TimeInterval? = nil,
                 file: StaticString = #filePath, line: UInt = #line) {
        XCTAssertTrue(
            waitFor(app, identifier, timeout),
            "Expected '\(identifier)' to appear while the app was in phase " +
            "'\(currentPhase(app) ?? "none")'. Visible identifiers: \(visibleIdentifiers(app))",
            file: file, line: line
        )
    }

    func tap(_ app: XCUIApplication, _ identifier: String, file: StaticString = #filePath, line: UInt = #line) {
        let element = el(app, identifier)
        guard element.waitForExistence(timeout: shortTimeout) else {
            XCTFail("Cannot tap '\(identifier)': it never appeared. Visible: \(visibleIdentifiers(app))",
                    file: file, line: line)
            return
        }
        if element.isHittable {
            element.tap()
        } else {
            // A cell inside a scrolling list can be present but not hittable.
            element.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()
        }
    }

    /// Waits for the React tree to be mounted and the start screen to be drawn.
    func waitForReady(_ app: XCUIApplication, file: StaticString = #filePath, line: UInt = #line) {
        XCTAssertTrue(
            app.wait(for: .runningForeground, timeout: uiTimeout),
            "The application never reached the foreground.",
            file: file, line: line
        )
        XCTAssertTrue(
            el(app, Ids.ready).waitForExistence(timeout: uiTimeout),
            """
            The React Native tree never reported '\(Ids.ready)' within \(Int(uiTimeout))s. \
            A live process without this identifier means the JavaScript has not mounted — \
            most often a Debug build with no Metro server attached.
            """,
            file: file, line: line
        )
    }

    /// The state the app settled into, or nil if it never got past mount.
    func currentPhase(_ app: XCUIApplication) -> String? {
        let all = app.descendants(matching: .any).allElementsBoundByIndex.prefix(400)
        for element in all {
            let id = element.identifier
            if id.hasPrefix(Ids.phasePrefix) {
                return String(id.dropFirst(Ids.phasePrefix.count))
            }
        }
        return nil
    }

    /**
     Waits for the demonstration workspace, failing with the phase the app
     actually reached.

     Without this the message is only "screen.home never appeared", which is true
     and useless: it does not distinguish "still booting" from "bootstrap failed"
     from "this device is signed out".
     */
    func waitForDemoPhase(_ app: XCUIApplication, _ timeout: TimeInterval = 60,
                          file: StaticString = #filePath, line: UInt = #line) -> Bool {
        let deadline = Date().addingTimeInterval(timeout)
        while Date() < deadline {
            if let phase = currentPhase(app), phase == "demo" { return true }
            if let phase = currentPhase(app), phase == "error" {
                XCTFail("The application reported a bootstrap error instead of opening the workspace. " +
                        "Visible: \(visibleIdentifiers(app))", file: file, line: line)
                return false
            }
            usleep(250_000)
        }
        XCTFail("The application settled into '\(currentPhase(app) ?? "no phase")' rather than the workspace " +
                "within \(Int(timeout))s. Visible: \(visibleIdentifiers(app))", file: file, line: line)
        return false
    }

    func visibleIdentifiers(_ app: XCUIApplication) -> String {
        let all = app.descendants(matching: .any).allElementsBoundByIndex
            .prefix(400)
            .compactMap { $0.identifier.isEmpty ? nil : $0.identifier }
        return Set(all).sorted().joined(separator: ", ")
    }

    /**
     Brings the app to the demonstration workspace from whatever state it is in.

     The three real start states are: the connection screen (first run), the mode
     chooser (after "Other Sornio modes"), and the signed-out screen (after an
     explicit sign-out). All three are valid, so this recovers rather than fails.
     */
    func enterDemo(_ app: XCUIApplication, file: StaticString = #filePath, line: UInt = #line) {
        waitForReady(app, file: file, line: line)

        if waitFor(app, Ids.nav("home"), shortTimeout) {
            _ = waitForDemoPhase(app)
            return
        }

        if el(app, Ids.reopenDemo).exists {
            tap(app, Ids.reopenDemo)
            require(app, Ids.nav("home"), uiTimeout, file: file, line: line)
            return
        }

        if el(app, Ids.demoEnter).exists {
            tap(app, Ids.demoEnter)
            require(app, Ids.nav("home"), uiTimeout, file: file, line: line)
            return
        }

        // The connection screen sits on top; step back to the mode chooser.
        let back = app.buttons["Other Sornio modes"]
        if back.waitForExistence(timeout: shortTimeout) {
            back.tap()
        }
        if el(app, Ids.demoEnter).waitForExistence(timeout: shortTimeout) {
            tap(app, Ids.demoEnter)
        }
        require(app, Ids.nav("home"), uiTimeout, file: file, line: line)
    }

    func attachScreenshot(_ app: XCUIApplication, named name: String) {
        let shot = XCTAttachment(screenshot: app.screenshot())
        shot.name = name
        shot.lifetime = .keepAlways
        add(shot)
    }
}
