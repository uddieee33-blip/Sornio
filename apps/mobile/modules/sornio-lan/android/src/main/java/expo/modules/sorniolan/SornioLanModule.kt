package expo.modules.sorniolan

import android.content.Context
import android.net.nsd.NsdManager
import android.net.nsd.NsdServiceInfo
import android.os.Handler
import android.os.Looper
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class SornioLanModule : Module() {
  private val main = Handler(Looper.getMainLooper())
  private var manager: NsdManager? = null
  private var browser: NsdManager.DiscoveryListener? = null
  private var epoch = 0
  private var resolving = false
  private val pending = ArrayDeque<NsdServiceInfo>()
  private val present = mutableSetOf<String>()
  override fun definition() = ModuleDefinition {
    Name("SornioLan")
    Events("onService", "onDiscoveryStatus")
    AsyncFunction("startDiscovery") { main.post { start() }; Unit }
    AsyncFunction("stopDiscovery") { main.post { stop() }; Unit }
    OnDestroy { main.post { stop() } }
  }
  private fun stop() {
    epoch++; pending.clear(); present.clear(); resolving = false
    val old = browser; browser = null
    if (old != null) try { manager?.stopServiceDiscovery(old) } catch (_: Exception) {}
    sendEvent("onDiscoveryStatus", mapOf("state" to "stopped"))
  }
  private fun start() {
    stop(); val token = epoch
    val context = appContext.reactContext ?: return
    val nsd = context.getSystemService(Context.NSD_SERVICE) as NsdManager; manager = nsd
    val listener = object : NsdManager.DiscoveryListener {
      override fun onDiscoveryStarted(type: String) { main.post { if (token == epoch) sendEvent("onDiscoveryStatus", mapOf("state" to "searching")) } }
      override fun onDiscoveryStopped(type: String) {}
      override fun onStartDiscoveryFailed(type: String, code: Int) { main.post { if (token == epoch) { stop(); sendEvent("onDiscoveryStatus", mapOf("state" to "unavailable")) } } }
      override fun onStopDiscoveryFailed(type: String, code: Int) {}
      override fun onServiceLost(info: NsdServiceInfo) { main.post { if (token == epoch) { present.remove(info.serviceName); sendEvent("onService", mapOf("kind" to "removed", "key" to info.serviceName)) } } }
      override fun onServiceFound(info: NsdServiceInfo) { main.post {
        if (token == epoch && info.serviceType.trimEnd('.') == "_sornio._tcp" && present.size < 50 && present.add(info.serviceName)) { pending.add(info); resolveNext(token) }
      } }
    }
    browser = listener
    try { nsd.discoverServices("_sornio._tcp.", NsdManager.PROTOCOL_DNS_SD, listener) }
    catch (_: Exception) { browser = null; sendEvent("onDiscoveryStatus", mapOf("state" to "permission_or_network")) }
  }
  @Suppress("DEPRECATION")
  private fun resolveNext(token: Int) {
    if (token != epoch || resolving || pending.isEmpty()) return
    val info = pending.removeFirst(); resolving = true
    try { manager?.resolveService(info, object : NsdManager.ResolveListener {
      override fun onResolveFailed(service: NsdServiceInfo, code: Int) { main.post { if (token == epoch) { resolving = false; present.remove(service.serviceName); resolveNext(token) } } }
      override fun onServiceResolved(service: NsdServiceInfo) { main.post {
        if (token == epoch) {
          resolving = false
          if (present.contains(service.serviceName)) {
            val allowed = setOf("v", "hub", "biz", "name", "origin", "cert")
            val txt = service.attributes.filterKeys { allowed.contains(it) }.mapValues { String(it.value, Charsets.UTF_8).take(250) }
            sendEvent("onService", mapOf("kind" to "resolved", "key" to service.serviceName, "host" to (service.host?.hostName ?: ""), "port" to service.port, "txt" to txt))
          }
          resolveNext(token)
        }
      } }
    }) } catch (_: Exception) { resolving = false; resolveNext(token) }
  }
}
