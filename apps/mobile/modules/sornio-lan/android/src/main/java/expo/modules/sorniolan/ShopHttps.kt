package expo.modules.sorniolan

import expo.modules.kotlin.exception.CodedException
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody
import java.net.URI
import java.security.MessageDigest
import java.security.cert.CertificateExpiredException
import java.security.cert.CertificateNotYetValidException
import java.util.concurrent.TimeUnit
import javax.net.ssl.SSLException
import javax.net.ssl.SSLPeerUnverifiedException
import java.io.IOException

internal object ShopHttps {
  private val routes = setOf("/v1/identity", "/v1/enrol", "/v1/session", "/v1/workspace", "/v1/submit", "/v1/operation")
  private fun digest(bytes: ByteArray) = MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it.toInt() and 255) }
  private fun failure(code: String): CodedException = CodedException(code, "Sornio secure connection could not be confirmed.", null)
  private class ChangedCertificate : IOException()
  fun request(origin: String, path: String, body: String, bearer: String, pin: String, probe: Boolean): Map<String, Any> {
    val u = try { URI(origin) } catch (_: Exception) { throw failure("invalid_request") }
    if (u.scheme != "https" || u.host.isNullOrEmpty() || u.rawUserInfo != null || !u.rawPath.isNullOrEmpty() && u.rawPath != "/" || u.rawQuery != null || u.rawFragment != null || !routes.contains(path) || body.toByteArray().size > 32768 || bearer.length > 128 || (!probe && !Regex("[a-f0-9]{64}").matches(pin)) || (probe && (path != "/v1/identity" || bearer.isNotEmpty()))) throw failure("invalid_request")
    var fingerprint: String? = null
    val client = OkHttpClient.Builder().followRedirects(false).followSslRedirects(false).retryOnConnectionFailure(false)
      .connectTimeout(8, TimeUnit.SECONDS).readTimeout(12, TimeUnit.SECONDS).callTimeout(15, TimeUnit.SECONDS)
      // Default chain and hostname validation runs first. This interceptor runs
      // after ConnectInterceptor and BEFORE CallServerInterceptor sends headers/body.
      .addNetworkInterceptor { chain ->
        val cert = chain.connection()?.handshake()?.peerCertificates?.firstOrNull() ?: throw SSLPeerUnverifiedException("TLS certificate required")
        fingerprint = digest(cert.encoded)
        if (!probe && fingerprint != pin) throw ChangedCertificate()
        chain.proceed(chain.request())
      }.build()
    try {
      val builder = Request.Builder().url(origin.trimEnd('/') + path).post(body.toRequestBody("application/json".toMediaType())).header("Cache-Control", "no-store")
      if (bearer.isNotEmpty()) builder.header("Authorization", "Bearer $bearer")
      client.newCall(builder.build()).execute().use { response ->
        if (response.code in 300..399) throw failure("redirect_refused")
        val source = response.body?.source() ?: throw failure("outcome_unknown")
        // Requesting at most limit+1 detects oversized replies without unbounded allocation.
        source.request(262145)
        if (source.buffer.size > 262144) throw failure("response_too_large")
        val text = source.readUtf8()
        return mapOf("status" to response.code, "body" to text, "certificateSha256" to (fingerprint ?: throw failure("certificate_untrusted")))
      }
    } catch (e: CodedException) { throw e }
    catch (e: Exception) {
      var cause: Throwable? = e
      while (cause != null) { if (cause is ChangedCertificate) throw failure("certificate_changed"); if (cause is CertificateExpiredException || cause is CertificateNotYetValidException) throw failure("certificate_expired"); cause = cause.cause }
      if (e is SSLException) throw failure("certificate_untrusted")
      throw failure("network_unavailable")
    } finally { client.dispatcher.executorService.shutdown(); client.connectionPool.evictAll() }
  }
}
