using System.Diagnostics;
using System.Drawing;
using static DukaanOS.Windows.NavigationPolicy;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace DukaanOS.Windows;

/// <summary>
/// A Windows window for the hosted app. The server still owns authentication,
/// business access and all data. The embedded page has no privileged bridge.
/// </summary>
public sealed class ShopWindow : Form
{
    private readonly WebView2 view = new() { Dock = DockStyle.Fill };
    private readonly Label status = new()
    {
        AutoSize = false,
        Dock = DockStyle.Fill,
        TextAlign = ContentAlignment.MiddleLeft,
        Text = "Connecting to your business…"
    };
    private readonly Button retry = new() { Text = "Try again", AutoSize = true };
    private readonly Button browser = new() { Text = "Open in browser", AutoSize = true };
    private readonly FlowLayoutPanel empty = new()
    {
        Dock = DockStyle.Fill,
        Padding = new Padding(24),
        FlowDirection = FlowDirection.TopDown,
        WrapContents = false
    };
    private bool ready;
    private bool connecting;
    private Uri lastAppUri = Home;

    public ShopWindow()
    {
        Text = "Sornio";
        AutoScaleMode = AutoScaleMode.Dpi;
        Font = new Font("Segoe UI", 10);
        BackColor = Color.FromArgb(246, 245, 241);
        MinimumSize = new Size(800, 580);
        Size = new Size(1200, 800);
        StartPosition = FormStartPosition.CenterScreen;

        var toolbar = new FlowLayoutPanel
        {
            Dock = DockStyle.Top,
            Height = 56,
            BackColor = Color.FromArgb(246, 245, 241),
            Padding = new Padding(10, 6, 10, 4),
            WrapContents = false,
            AutoScroll = true
        };
        var home = new Button { Text = "Home", AutoSize = true };
        var back = new Button { Text = "Back", AutoSize = true };
        var reload = new Button { Text = "Refresh", AutoSize = true };
        home.Click += (_, _) => Navigate(Home);
        back.Click += (_, _) => { if (ready && view.CanGoBack) view.GoBack(); };
        reload.Click += (_, _) => _ = ConnectAsync();
        browser.Click += (_, _) => OpenOutside(ready && IsAppOrigin(view.Source) ? view.Source : Home);
        foreach (var button in new[] { home, back, reload, browser, retry })
        {
            button.FlatStyle = FlatStyle.Flat;
            button.FlatAppearance.BorderSize = 0;
            button.BackColor = Color.FromArgb(235, 237, 241);
            button.ForeColor = Color.FromArgb(31, 37, 53);
            button.Padding = new Padding(10, 4, 10, 4);
            button.Margin = new Padding(0, 0, 8, 0);
        }
        toolbar.Controls.AddRange([home, back, reload, browser]);

        status.Width = 650;
        status.Height = 80;
        retry.Click += (_, _) => _ = ConnectAsync();
        empty.Controls.AddRange([status, retry]);

        var content = new Panel { Dock = DockStyle.Fill };
        content.Controls.Add(view);
        content.Controls.Add(empty);
        view.Visible = false;
        Controls.Add(content);
        Controls.Add(toolbar);

        Shown += async (_, _) => await ConnectAsync();
    }

    private async Task ConnectAsync()
    {
        if (connecting || IsDisposed) return;
        if (ready)
        {
            Navigate(lastAppUri);
            return;
        }

        connecting = true;
        retry.Enabled = false;
        status.Text = "Connecting to your business…";
        try
        {
            // Evergreen is installed on most recent Windows devices; this
            // reports a useful action on machines where it is absent.
            CoreWebView2Environment.GetAvailableBrowserVersionString();
            var profile = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "DukaanOS", "WebView2");
            var environment = await CoreWebView2Environment.CreateAsync(userDataFolder: profile);
            await view.EnsureCoreWebView2Async(environment);

            var core = view.CoreWebView2;
            core.Settings.AreDevToolsEnabled = false;
            core.Settings.IsWebMessageEnabled = false;
            core.NavigationStarting += (_, args) =>
            {
                if (IsAppOrigin(args.Uri))
                {
                    lastAppUri = new Uri(args.Uri);
                    status.Text = "Connecting to your business…";
                    return;
                }
                args.Cancel = true;
                OpenOutside(args.Uri);
            };
            core.NewWindowRequested += (_, args) =>
            {
                args.Handled = true;
                if (IsAppOrigin(args.Uri)) Navigate(new Uri(args.Uri));
                else OpenOutside(args.Uri);
            };
            core.NavigationCompleted += (_, args) =>
            {
                if (args.IsSuccess)
                {
                    empty.Visible = false;
                    view.Visible = true;
                    return;
                }
                view.Visible = false;
                empty.Visible = true;
                status.Text = "Cannot reach your business. Check your internet connection and try again.";
            };
            ready = true;
            Navigate(Home);
        }
        catch (WebView2RuntimeNotFoundException)
        {
            status.Text = "Microsoft Edge WebView2 Runtime is needed. Install it from Microsoft, then try again. You can use Open in browser now.";
        }
        catch (Exception)
        {
            status.Text = "The app could not open. Check your connection and try again, or use Open in browser.";
        }
        finally
        {
            connecting = false;
            if (!IsDisposed) retry.Enabled = true;
        }
    }

    private void Navigate(Uri destination)
    {
        if (ready && IsAppOrigin(destination)) view.Source = destination;
    }

    private static void OpenOutside(string? raw)
    {
        if (Uri.TryCreate(raw, UriKind.Absolute, out var uri)) OpenOutside(uri);
    }

    private static void OpenOutside(Uri? uri)
    {
        if (!CanOpenOutside(uri)) return;
        try
        {
            Process.Start(new ProcessStartInfo(uri!.AbsoluteUri) { UseShellExecute = true });
        }
        catch (Exception)
        {
            MessageBox.Show("Windows could not open this link. Please try it in your browser.",
                "Sornio", MessageBoxButtons.OK, MessageBoxIcon.Information);
        }
    }
}
