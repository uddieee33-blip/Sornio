# Sornio for Windows

> **This is not the Sornio product.**
>
> `desktop/windows` is an online-only WebView2 shell around the hosted web app at
> `https://dukaan-os-six.vercel.app`. It requires an internet connection and keeps no
> local business records.
>
> The product a shop installs is the offline Tauri application in `apps/desktop`
> (`com.sornio.localreview`, built by `.github/workflows/windows-local.yml`). See
> [docs/windows-product-entry-point.md](../../docs/windows-product-entry-point.md).
>
> Its binary is `SornioHostedPreview.exe` and its installer is
> `Sornio-Hosted-Preview-Setup-x64.exe`, so neither can be mistaken for the product.

This is a Windows desktop window for the production Sornio service at
`https://dukaan-os-six.vercel.app`. It uses Microsoft's WebView2, and keeps a
separate app profile under `%LOCALAPPDATA%\DukaanOS\WebView2`. Sign in with the
same account as the web app. The server remains responsible for authentication,
business access and synced data. No account details or messaging credentials
are compiled into the EXE.

## Build

From the repository root with the .NET 8 SDK:

```powershell
dotnet publish desktop/windows/DukaanOS.Windows.csproj -c Release -r win-x64 --self-contained true -p:PublishSingleFile=false -o dist/windows
```

Keep **all** files in `dist/windows` together and run `SornioHostedPreview.exe`. The EXE
does not work if copied out of that folder on its own. The repository's
"Windows desktop package" GitHub Action builds a ZIP on review branches and
can also be started manually. Download the ZIP from the workflow run's
Artifacts section, extract it, and run the EXE. This is an unsigned test
package. The workflow also creates `Sornio-Windows-Setup-x64`, containing an
unsigned `Sornio-Setup-x64.exe` preview installer. It installs all runtime files
per user, adds a Start menu entry, offers a desktop shortcut and registers an
uninstaller. CI checks silent install/uninstall and preservation of the owner's
WebView profile. This is not a signed production release or Store distribution.

To build the installer locally, publish the folder above and compile
`desktop/windows/setup.iss` with Inno Setup 6.3 or newer on Windows.

After reviewing and hosting a real installer on a public HTTPS URL ending in
`.exe`, set the server-side `SORNIO_WINDOWS_DOWNLOAD_URL` for the website. The
public `/install` page then offers the native setup separately from browser-app
installation. Leave the variable empty until the release exists. Private GitHub
Actions artifact URLs require an account and are not public customer downloads.

Microsoft Edge WebView2 Evergreen Runtime must be present. Windows 11 normally
includes it; if missing, the app displays a clear message. Install it from
[Microsoft's WebView2 page](https://developer.microsoft.com/microsoft-edge/webview2/)
or open the business in a browser. The app itself requires internet access for
sign-in and sync. The hosted site can update its UI without rebuilding this
window; changes to the native window require a new package.

## Acceptance on a Windows machine

1. Extract the full ZIP on Windows 10/11 x64 and run `SornioHostedPreview.exe`.
2. Check an account with completed setup and a new account through sign-up,
   confirmation, owner details, business details and optional payment setup.
3. Make a bill, collect a payment, print a receipt, scan with actual hardware
   and open a customer reminder in WhatsApp. Check downloaded files and links.
4. Disconnect and reconnect the network; the retry control must recover.
5. Sign out and sign in on a second machine; confirm that account-backed records
   follow the owner. Browser mode and local-device-only mode do not prove sync.

Keep production distribution gated on real device acceptance and code signing.
