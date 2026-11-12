package expo.modules.sorniolan

import android.content.Context
import android.net.nsd.NsdManager
import android.net.nsd.NsdServiceInfo
import java.net.URI
import java.net.InetAddress
import java.net.Inet4Address
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

/** NSD address hints support Android versions whose system DNS cannot resolve
 * .local names. Hints NEVER replace TLS hostname/chain checks or the leaf pin. */
internal object ServiceAddresses {
  private data class Hint(val service: NsdServiceInfo, val address: InetAddress, val port: Int, @Volatile var seen: Long)
  private val hints = ConcurrentHashMap<String, Hint>()
  @Suppress("DEPRECATION")
  fun remember(service: NsdServiceInfo) {
    try {
      val raw = service.attributes["origin"] ?: return
      if (raw.size > 230) return
      val uri = URI(String(raw, Charsets.UTF_8)); val host = uri.host?.lowercase() ?: return
      val address = service.host ?: return
      if (uri.scheme != "https" || uri.rawUserInfo != null || uri.rawQuery != null || uri.rawFragment != null || (!uri.rawPath.isNullOrEmpty() && uri.rawPath != "/") || (if (uri.port < 0) 443 else uri.port) != service.port || address !is Inet4Address || !(address.isSiteLocalAddress || address.isLinkLocalAddress)) return
      if (hints.size < 50 || hints.containsKey(host)) hints[host] = Hint(service,address,service.port,System.currentTimeMillis())
    } catch (_: Exception) {}
  }
  fun invalidate(origin: String) { try { hints[URI(origin).host.lowercase()]?.seen = 0 } catch (_: Exception) {} }
  @Suppress("DEPRECATION")
  fun lookup(context: Context?, origin: String): InetAddress? {
    val uri = URI(origin); val host = uri.host.lowercase(); val hint = hints[host] ?: return null
    if (hint.port != (if (uri.port < 0) 443 else uri.port)) return null
    if (System.currentTimeMillis() - hint.seen < 30000) return hint.address
    if (context != null) {
      val latch = CountDownLatch(1)
      try { val manager=context.getSystemService(Context.NSD_SERVICE) as NsdManager
        manager.resolveService(hint.service,object:NsdManager.ResolveListener {
          override fun onResolveFailed(service:NsdServiceInfo,code:Int){latch.countDown()}
          override fun onServiceResolved(service:NsdServiceInfo){remember(service);latch.countDown()}
        });latch.await(3,TimeUnit.SECONDS)
      } catch (_: Exception) {}
    }
    val fresh=hints[host] ?: return null
    return if(System.currentTimeMillis()-fresh.seen<300000)fresh.address else null
  }
}
