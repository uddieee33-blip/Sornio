import com.sornio.app.NavigationPolicy;

public final class NavigationPolicyTest {
    public static void main(String[] args) {
        String[] accepted = {NavigationPolicy.HOME, "https://dukaan-os-six.vercel.app:443/auth?next=%2Fhome", "https://DUKAAN-OS-SIX.VERCEL.APP/billing"};
        String[] blocked = {"http://dukaan-os-six.vercel.app", "https://dukaan-os-six.vercel.app.evil.test", "https://dukaan-os-six.vercel.app@evil.test", "https://user@dukaan-os-six.vercel.app", "https://dukaan-os-six.vercel.app:444", "javascript:alert(1)", "file:///data/data/com.sornio.app", "intent://scan", "https://dukaan-os-six.vercel.app\\@evil.test", "https://dukaan-os-six.vercel.app./home", "data:text/html,test", "not a URL", null};
        for (String url : accepted) if (!NavigationPolicy.isApp(url)) throw new AssertionError(url);
        for (String url : blocked) if (NavigationPolicy.isApp(url)) throw new AssertionError(url);
        for (String url : new String[]{"https://example.com", "tel:123", "sms:123", "mailto:test@example.com", "upi://pay?pa=example@bank"})
            if (!NavigationPolicy.canOpenOutside(url)) throw new AssertionError(url);
        for (String url : new String[]{"javascript:alert(1)", "intent://scan", "file:///etc/passwd", "content://private", "http://example.com", "https://user:password@example.com", "https:broken", null})
            if (NavigationPolicy.canOpenOutside(url)) throw new AssertionError(url);
        System.out.println("Android navigation: 29 allowed/hostile URL scenarios passed");
    }
}
