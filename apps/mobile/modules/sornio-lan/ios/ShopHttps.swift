import Foundation
import Security
import CryptoKit
import ExpoModulesCore

/// Each request uses an ephemeral session. Normal OS chain and hostname policy is
/// evaluated before the extra leaf pin; no trust-all delegate or HTTP fallback.
final class ShopHttps: NSObject, URLSessionDataDelegate {
  private let pin: String?
  private var fingerprint: String?
  private var data = Data()
  private var response: HTTPURLResponse?
  private var failure: Error?
  private var continuation: CheckedContinuation<[String: Any], Error>?
  private var session: URLSession?
  init(pin: String?) { self.pin = pin }
  private func error(_ code: String) -> Exception { Exception(name: "ShopConnection", description: "Sornio secure connection could not be confirmed.", code: code) }
  static func perform(origin: String, path: String, body: String, bearer: String, pin: String?, probe: Bool) async throws -> [String: Any] {
    let routes = ["/v1/identity", "/v1/enrol", "/v1/session", "/v1/workspace", "/v1/submit", "/v1/operation"]
    let worker = ShopHttps(pin: pin)
    guard let parts = URLComponents(string: origin), parts.scheme == "https", parts.host != nil, parts.user == nil, parts.password == nil, parts.query == nil, parts.fragment == nil, parts.path.isEmpty || parts.path == "/", routes.contains(path), body.utf8.count <= 32768, bearer.count <= 128,
      probe ? (path == "/v1/identity" && bearer.isEmpty && pin == nil) : (pin?.range(of: "^[a-f0-9]{64}$", options: .regularExpression) != nil), let url = URL(string: origin.trimmingCharacters(in: CharacterSet(charactersIn: "/")) + path) else { throw worker.error("invalid_request") }
    return try await withCheckedThrowingContinuation { continuation in
      worker.continuation = continuation
      let config = URLSessionConfiguration.ephemeral
      config.timeoutIntervalForRequest = 12; config.timeoutIntervalForResource = 15
      config.httpCookieStorage = nil; config.urlCache = nil; config.urlCredentialStorage = nil
      let session = URLSession(configuration: config, delegate: worker, delegateQueue: nil); worker.session = session
      var request = URLRequest(url: url); request.httpMethod = "POST"; request.httpBody = Data(body.utf8)
      request.setValue("application/json", forHTTPHeaderField: "Content-Type"); request.setValue("no-store", forHTTPHeaderField: "Cache-Control")
      if !bearer.isEmpty { request.setValue("Bearer \(bearer)", forHTTPHeaderField: "Authorization") }
      session.dataTask(with: request).resume()
    }
  }
  func urlSession(_ session: URLSession, task: URLSessionTask, didReceive challenge: URLAuthenticationChallenge, completionHandler: @escaping (URLSession.AuthChallengeDisposition, URLCredential?) -> Void) {
    guard challenge.protectionSpace.authenticationMethod == NSURLAuthenticationMethodServerTrust, let trust = challenge.protectionSpace.serverTrust else { completionHandler(.performDefaultHandling, nil); return }
    guard task.currentRequest?.url?.host == challenge.protectionSpace.host else { failure = error("certificate_untrusted"); completionHandler(.cancelAuthenticationChallenge, nil); return }
    guard SecTrustSetPolicies(trust, SecPolicyCreateSSL(true, challenge.protectionSpace.host as CFString)) == errSecSuccess else { failure = error("certificate_untrusted"); completionHandler(.cancelAuthenticationChallenge, nil); return }
    var trustError: CFError?
    guard SecTrustEvaluateWithError(trust, &trustError), let certificate = SecTrustCopyCertificateChain(trust) as? [SecCertificate], let leaf = certificate.first else {
      failure = error("certificate_untrusted"); completionHandler(.cancelAuthenticationChallenge, nil); return
    }
    let digest = SHA256.hash(data: SecCertificateCopyData(leaf) as Data).map { String(format: "%02x", $0) }.joined()
    if let pin, pin != digest { failure = error("certificate_changed"); completionHandler(.cancelAuthenticationChallenge, nil); return }
    fingerprint = digest; completionHandler(.useCredential, URLCredential(trust: trust))
  }
  func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) { failure = error("redirect_refused"); completionHandler(nil) }
  func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive response: URLResponse, completionHandler: @escaping (URLSession.ResponseDisposition) -> Void) { self.response = response as? HTTPURLResponse; completionHandler(.allow) }
  func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive bytes: Data) { if data.count + bytes.count > 262144 { failure = error("response_too_large"); dataTask.cancel() } else { data.append(bytes) } }
  func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError networkError: Error?) {
    defer { continuation = nil; session.finishTasksAndInvalidate(); self.session = nil }
    if let failure { continuation?.resume(throwing: failure); return }
    if let networkError { let ns = networkError as NSError; let tlsCodes = [NSURLErrorServerCertificateUntrusted, NSURLErrorServerCertificateHasBadDate, NSURLErrorServerCertificateHasUnknownRoot, NSURLErrorServerCertificateNotYetValid, NSURLErrorSecureConnectionFailed]; continuation?.resume(throwing: error(ns.code == NSURLErrorServerCertificateHasBadDate || ns.code == NSURLErrorServerCertificateNotYetValid ? "certificate_expired" : tlsCodes.contains(ns.code) ? "certificate_untrusted" : "network_unavailable")); return }
    guard let response, let fingerprint, let text = String(data: data, encoding: .utf8) else { continuation?.resume(throwing: error("outcome_unknown")); return }
    continuation?.resume(returning: ["status": response.statusCode, "body": text, "certificateSha256": fingerprint])
  }
}
