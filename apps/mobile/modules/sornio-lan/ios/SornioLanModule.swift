import ExpoModulesCore
import Foundation

public final class SornioLanModule: Module, NetServiceBrowserDelegate, NetServiceDelegate {
  private var browser: NetServiceBrowser?
  private var services: [String: NetService] = [:]
  public func definition() -> ModuleDefinition {
    Name("SornioLan")
    Events("onService", "onDiscoveryStatus")
    AsyncFunction("probe") { (origin: String) async throws -> [String: Any] in try await ShopHttps.perform(origin: origin, path: "/v1/identity", body: "{\"version\":1}", bearer: "", pin: nil, probe: true) }
    AsyncFunction("request") { (origin: String, path: String, body: String, bearer: String, pin: String) async throws -> [String: Any] in try await ShopHttps.perform(origin: origin, path: path, body: body, bearer: bearer, pin: pin, probe: false) }
    AsyncFunction("startDiscovery") { self.start() }.runOnQueue(.main)
    AsyncFunction("stopDiscovery") { self.stop() }.runOnQueue(.main)
    OnDestroy { DispatchQueue.main.async { self.stop(emit: false) } }
  }
  private func stop(emit: Bool = true) {
    browser?.delegate = nil; browser?.stop(); browser = nil
    for service in services.values { service.delegate = nil; service.stop() }
    services.removeAll()
    if emit { sendEvent("onDiscoveryStatus", ["state": "stopped"]) }
  }
  private func start() {
    stop()
    let next = NetServiceBrowser(); next.delegate = self; browser = next
    next.searchForServices(ofType: "_sornio._tcp.", inDomain: "local.")
    sendEvent("onDiscoveryStatus", ["state": "searching"])
  }
  public func netServiceBrowser(_ browser: NetServiceBrowser, didFind service: NetService, moreComing: Bool) {
    guard browser === self.browser, services.count < 50, services[service.name] == nil else { return }
    services[service.name] = service; service.delegate = self; service.resolve(withTimeout: 5)
  }
  public func netServiceBrowser(_ browser: NetServiceBrowser, didRemove service: NetService, moreComing: Bool) {
    guard browser === self.browser else { return }
    services.removeValue(forKey: service.name)?.stop()
    sendEvent("onService", ["kind": "removed", "key": service.name])
  }
  public func netServiceBrowser(_ browser: NetServiceBrowser, didNotSearch errorDict: [String: NSNumber]) {
    guard browser === self.browser else { return }; sendEvent("onDiscoveryStatus", ["state": "permission_or_network"])
  }
  public func netServiceDidResolveAddress(_ sender: NetService) {
    guard services[sender.name] === sender else { return }
    let data = sender.txtRecordData().map { NetService.dictionary(fromTXTRecord: $0) } ?? [:]
    var txt: [String: String] = [:]
    for key in ["v", "hub", "biz", "name", "origin", "cert"] { if let bytes = data[key], bytes.count <= 250, let value = String(data: bytes, encoding: .utf8) { txt[key] = value } }
    sendEvent("onService", ["kind": "resolved", "key": sender.name, "host": sender.hostName ?? "", "port": sender.port, "txt": txt])
  }
  public func netService(_ sender: NetService, didNotResolve errorDict: [String: NSNumber]) { if services[sender.name] === sender { services.removeValue(forKey: sender.name) } }
}
