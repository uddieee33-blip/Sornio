import ExpoModulesCore
import Foundation

// `SornioLanModule` is an `ExpoModulesCore.Module`, which already inherits
// `NSObject` through `BaseModule`. That is why it cannot declare
// `NetServiceBrowserDelegate`/`NetServiceDelegate` itself: those are `@objc`
// protocols that require an `NSObject` base, and adding one produces
//
//   error: multiple inheritance from classes 'NSObject' and 'BaseModule'
//   error: type 'SornioLanModule' does not conform to protocol 'AnyModule'
//
// — the first attempt at this fix. The conformance therefore lives on
// `LanDiscovery`, a plain `NSObject` helper that owns the browser and the
// service table and reports back through a closure. The module keeps its
// Expo definition, its events and its lifetime; it owns a discovery helper
// instead of *being* one.
//
// This file had never been compiled: the stacked Phase 18 PRs received no iOS
// result at all, and the failure blocked the whole Pods target.
private final class LanDiscovery: NSObject, NetServiceBrowserDelegate, NetServiceDelegate {
  private let onResolved: ([String: Any]) -> Void
  private let onRemoved: (String) -> Void
  private let onStatus: (String) -> Void
  private var browser: NetServiceBrowser?
  private var services: [String: NetService] = [:]

  init(
    onResolved: @escaping ([String: Any]) -> Void,
    onRemoved: @escaping (String) -> Void,
    onStatus: @escaping (String) -> Void
  ) {
    self.onResolved = onResolved
    self.onRemoved = onRemoved
    self.onStatus = onStatus
    super.init()
  }

  func start() {
    stop()
    let next = NetServiceBrowser()
    next.delegate = self
    browser = next
    next.searchForServices(ofType: "_sornio._tcp.", inDomain: "local.")
    onStatus("searching")
  }

  func stop(emit: Bool = true) {
    browser?.delegate = nil
    browser?.stop()
    browser = nil
    for service in services.values {
      service.delegate = nil
      service.stop()
    }
    services.removeAll()
    if emit { onStatus("stopped") }
  }

  func netServiceBrowser(_ browser: NetServiceBrowser, didFind service: NetService, moreComing: Bool) {
    guard browser === self.browser, services.count < 50, services[service.name] == nil else { return }
    services[service.name] = service
    service.delegate = self
    service.resolve(withTimeout: 5)
  }

  func netServiceBrowser(_ browser: NetServiceBrowser, didRemove service: NetService, moreComing: Bool) {
    guard browser === self.browser else { return }
    services.removeValue(forKey: service.name)?.stop()
    onRemoved(service.name)
  }

  func netServiceBrowser(_ browser: NetServiceBrowser, didNotSearch errorDict: [String: NSNumber]) {
    guard browser === self.browser else { return }
    onStatus("permission_or_network")
  }

  func netServiceDidResolveAddress(_ sender: NetService) {
    guard services[sender.name] === sender else { return }
    let data = sender.txtRecordData().map { NetService.dictionary(fromTXTRecord: $0) } ?? [:]
    var txt: [String: String] = [:]
    for key in ["v", "hub", "biz", "name", "origin", "cert"] {
      if let bytes = data[key], bytes.count <= 250, let value = String(data: bytes, encoding: .utf8) {
        txt[key] = value
      }
    }
    onResolved([
      "kind": "resolved",
      "key": sender.name,
      "host": sender.hostName ?? "",
      "port": sender.port,
      "txt": txt,
    ])
  }

  func netService(_ sender: NetService, didNotResolve errorDict: [String: NSNumber]) {
    if services[sender.name] === sender { services.removeValue(forKey: sender.name) }
  }
}

public final class SornioLanModule: Module {
  private lazy var discovery = LanDiscovery(
    onResolved: { [weak self] payload in self?.sendEvent("onService", payload) },
    onRemoved: { [weak self] key in self?.sendEvent("onService", ["kind": "removed", "key": key]) },
    onStatus: { [weak self] state in self?.sendEvent("onDiscoveryStatus", ["state": state]) }
  )

  public func definition() -> ModuleDefinition {
    Name("SornioLan")
    Events("onService", "onDiscoveryStatus")
    AsyncFunction("probe") { (origin: String) async throws -> [String: Any] in try await ShopHttps.perform(origin: origin, path: "/v1/identity", body: "{\"version\":1}", bearer: "", pin: nil, probe: true) }
    AsyncFunction("request") { (origin: String, path: String, body: String, bearer: String, pin: String) async throws -> [String: Any] in try await ShopHttps.perform(origin: origin, path: path, body: body, bearer: bearer, pin: pin, probe: false) }
    AsyncFunction("startDiscovery") { self.discovery.start() }.runOnQueue(.main)
    AsyncFunction("stopDiscovery") { self.discovery.stop() }.runOnQueue(.main)
    OnDestroy { DispatchQueue.main.async { self.discovery.stop(emit: false) } }
  }
}
