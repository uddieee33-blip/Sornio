package com.sornio.app;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.net.http.SslError;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.view.WindowInsets;
import android.webkit.CookieManager;
import android.webkit.SslErrorHandler;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

/** Connected companion. No native JavaScript bridge, server secret or offline claim. */
public final class MainActivity extends Activity {
    private static final int PICK_FILE = 10;
    private WebView web;
    private LinearLayout recovery;
    private ValueCallback<Uri[]> fileResult;
    private boolean failed;
    private String retryUrl = NavigationPolicy.HOME;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.rgb(246, 245, 241));
        // API 35 edge-to-edge: keep controls above system bars and the keyboard.
        root.setOnApplyWindowInsetsListener((v, insets) -> {
            if (android.os.Build.VERSION.SDK_INT >= 30) {
                android.graphics.Insets edges = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.ime());
                v.setPadding(edges.left, edges.top, edges.right, edges.bottom);
            } else {
                v.setPadding(insets.getSystemWindowInsetLeft(), insets.getSystemWindowInsetTop(),
                    insets.getSystemWindowInsetRight(), insets.getSystemWindowInsetBottom());
            }
            return insets;
        });
        web = new WebView(this);
        WebView.setWebContentsDebuggingEnabled(false);
        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setSupportMultipleWindows(false);
        settings.setSafeBrowsingEnabled(true);
        settings.setBuiltInZoomControls(true);
        settings.setDisplayZoomControls(false);
        CookieManager.getInstance().setAcceptThirdPartyCookies(web, false);
        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                String url = request.getUrl().toString();
                if (NavigationPolicy.isApp(url)) return false;
                if (request.isForMainFrame() && request.hasGesture()) openOutside(url);
                return true;
            }
            @Override public void onPageStarted(WebView view, String url, android.graphics.Bitmap icon) {
                if (!NavigationPolicy.isApp(url)) { view.stopLoading(); showRecovery(); return; }
                failed = false;
                retryUrl = url;
            }
            @Override public void onPageFinished(WebView view, String url) {
                if (!failed && NavigationPolicy.isApp(url)) {
                    recovery.setVisibility(View.GONE);
                    web.setVisibility(View.VISIBLE);
                }
            }
            @Override public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) showRecovery();
            }
            @Override public void onReceivedHttpError(WebView view, WebResourceRequest request, WebResourceResponse response) {
                if (request.isForMainFrame() && response.getStatusCode() >= 500) showRecovery();
            }
            @Override public void onReceivedSslError(WebView view, SslErrorHandler handler, SslError error) {
                handler.cancel();
                showRecovery();
            }
            @Override public boolean onRenderProcessGone(WebView view, android.webkit.RenderProcessGoneDetail detail) {
                // A killed renderer must be recreated; never reuse the dead WebView.
                ((android.view.ViewGroup) view.getParent()).removeView(view);
                view.destroy();
                web = null;
                showRecovery();
                return true;
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override public void onPermissionRequest(android.webkit.PermissionRequest request) {
                request.deny();
                if (!NavigationPolicy.isApp(request.getOrigin().toString())) return;
                new AlertDialog.Builder(MainActivity.this)
                    .setMessage("Use the browser for camera scanning on this review build.")
                    .setPositiveButton("Open in browser", (dialog, which) -> openOutside(retryUrl))
                    .setNegativeButton("Cancel", null).show();
            }
            @Override public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (!NavigationPolicy.isApp(view.getUrl())) { callback.onReceiveValue(null); return true; }
                if (fileResult != null) fileResult.onReceiveValue(null);
                fileResult = callback;
                Intent pick = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                pick.addCategory(Intent.CATEGORY_OPENABLE);
                pick.setType("*/*");
                pick.putExtra(Intent.EXTRA_MIME_TYPES, new String[]{"text/csv", "text/plain", "application/json", "application/octet-stream"});
                try { startActivityForResult(pick, PICK_FILE); }
                catch (ActivityNotFoundException exception) { callback.onReceiveValue(null); fileResult = null; }
                return true;
            }
        });
        web.setDownloadListener((url, agent, disposition, mime, length) ->
            new AlertDialog.Builder(this)
                .setMessage("Open Sornio in your browser to download or print this record. You may need to sign in there.")
                .setPositiveButton("Open in browser", (dialog, which) -> openOutside(retryUrl))
                .setNegativeButton("Cancel", null).show());

        recovery = new LinearLayout(this);
        recovery.setOrientation(LinearLayout.VERTICAL);
        recovery.setGravity(Gravity.CENTER);
        recovery.setPadding(32, 32, 32, 32);
        recovery.setBackgroundColor(Color.rgb(246, 245, 241));
        TextView message = new TextView(this);
        message.setText("Sornio needs a connection to open your business. Reconnect, then try again.");
        message.setTextColor(Color.rgb(31, 37, 53));
        message.setTextSize(18);
        message.setGravity(Gravity.CENTER);
        Button retry = new Button(this);
        retry.setText("Try again");
        retry.setOnClickListener(v -> { if (web == null) recreate(); else web.loadUrl(retryUrl); });
        Button browser = new Button(this);
        browser.setText("Open in browser");
        browser.setOnClickListener(v -> openOutside(retryUrl));
        recovery.addView(message);
        recovery.addView(retry);
        recovery.addView(browser);
        recovery.setVisibility(View.GONE);
        root.addView(web, new FrameLayout.LayoutParams(-1, -1));
        root.addView(recovery, new FrameLayout.LayoutParams(-1, -1));
        setContentView(root);
        // Do not persist page history/form data in an Activity state bundle.
        web.loadUrl(NavigationPolicy.HOME);
    }

    private void showRecovery() {
        failed = true;
        if (web != null) web.setVisibility(View.INVISIBLE);
        recovery.setVisibility(View.VISIBLE);
    }

    private void openOutside(String url) {
        if (!NavigationPolicy.canOpenOutside(url)) return;
        try { startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)).addCategory(Intent.CATEGORY_BROWSABLE)); }
        catch (ActivityNotFoundException exception) {
            Toast.makeText(this, "No app is available to open this link.", Toast.LENGTH_LONG).show();
        }
    }

    @Override protected void onActivityResult(int request, int result, Intent data) {
        super.onActivityResult(request, result, data);
        if (request != PICK_FILE || fileResult == null) return;
        Uri selected = result == RESULT_OK && data != null ? data.getData() : null;
        // Only a document provider grant; never accept a file:// path.
        fileResult.onReceiveValue(selected != null && "content".equals(selected.getScheme()) ? new Uri[]{selected} : null);
        fileResult = null;
    }
    @Override public void onBackPressed() {
        if (web != null && web.canGoBack()) web.goBack(); else super.onBackPressed();
    }
    @Override protected void onPause() {
        if (web != null) web.onPause();
        CookieManager.getInstance().flush();
        super.onPause();
    }
    @Override protected void onResume() { super.onResume(); if (web != null) web.onResume(); }
    @Override protected void onDestroy() {
        if (fileResult != null) { fileResult.onReceiveValue(null); fileResult = null; }
        if (web != null) { ((android.view.ViewGroup) web.getParent()).removeView(web); web.destroy(); }
        super.onDestroy();
    }
}
