package com.sornio.app;

import java.net.URI;
import java.util.Locale;
import java.util.List;
import java.util.Arrays;

/** Keep untrusted pages and privileged URL schemes outside the business view. */
public final class NavigationPolicy {
    public static final String HOME = "https://dukaan-os-six.vercel.app/home";
    private static final String HOST = "dukaan-os-six.vercel.app";
    private static final List<String> EXTERNAL = Arrays.asList("https", "mailto", "tel", "sms", "upi");
    private NavigationPolicy() {}

    public static boolean isApp(String raw) {
        try {
            URI uri = new URI(raw);
            return "https".equalsIgnoreCase(uri.getScheme())
                && HOST.equalsIgnoreCase(uri.getHost()) && uri.getRawUserInfo() == null
                && (uri.getPort() == -1 || uri.getPort() == 443);
        } catch (Exception ignored) { return false; }
    }

    public static boolean canOpenOutside(String raw) {
        try {
            URI uri = new URI(raw);
            String scheme = uri.getScheme();
            if (scheme == null || !EXTERNAL.contains(scheme.toLowerCase(Locale.ROOT))) return false;
            if (uri.getRawUserInfo() != null) return false;
            if ("https".equalsIgnoreCase(scheme)) return uri.getHost() != null;
            return !uri.getRawSchemeSpecificPart().trim().isEmpty();
        } catch (Exception ignored) { return false; }
    }
}
