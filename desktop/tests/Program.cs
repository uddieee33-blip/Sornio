using DukaanOS.Windows;

foreach (var raw in new[] { NavigationPolicy.Home.AbsoluteUri, "https://DUKAAN-OS-SIX.VERCEL.APP:443/auth?next=%2Fhome" })
    if (!NavigationPolicy.IsAppOrigin(raw)) throw new Exception($"Valid app URL rejected: {raw}");
foreach (var raw in new[] { "http://dukaan-os-six.vercel.app", "https://dukaan-os-six.vercel.app.evil.test", "https://user@dukaan-os-six.vercel.app", "https://dukaan-os-six.vercel.app:444", "file:///etc/passwd", "javascript:alert(1)", "https://dukaan-os-six.vercel.app./home", "not a URL" })
    if (NavigationPolicy.IsAppOrigin(raw)) throw new Exception($"Unsafe app URL allowed: {raw}");
foreach (var raw in new[] { "https://example.com", "tel:123", "sms:123", "mailto:test@example.com", "upi://pay?pa=test@bank" })
    if (!NavigationPolicy.CanOpenOutside(new Uri(raw))) throw new Exception($"External URL rejected: {raw}");
foreach (var raw in new[] { "file:///etc/passwd", "javascript:alert(1)", "http://example.com", "https://user:password@example.com", "data:text/html,test" })
    if (NavigationPolicy.CanOpenOutside(new Uri(raw))) throw new Exception($"Unsafe external URL allowed: {raw}");
Console.WriteLine("Windows navigation: 20 allowed/hostile URL scenarios passed");
