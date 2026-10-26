namespace DukaanOS.Windows;

internal static class NavigationPolicy
{
    internal static readonly Uri Home = new("https://dukaan-os-six.vercel.app/home");

    internal static bool IsAppOrigin(string? raw) =>
        Uri.TryCreate(raw, UriKind.Absolute, out var uri) && IsAppOrigin(uri);

    internal static bool IsAppOrigin(Uri? uri) =>
        uri is not null && uri.IsAbsoluteUri && uri.Scheme == Uri.UriSchemeHttps && uri.Port == 443 &&
        uri.UserInfo.Length == 0 && uri.Host.Equals(Home.Host, StringComparison.OrdinalIgnoreCase);

    internal static bool CanOpenOutside(Uri? uri) =>
        uri is not null && uri.IsAbsoluteUri &&
        (uri.Scheme != Uri.UriSchemeHttps || uri.UserInfo.Length == 0) &&
        new[] { "https", "mailto", "tel", "sms", "upi" }.Contains(uri.Scheme);
}
