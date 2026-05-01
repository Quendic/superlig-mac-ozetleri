package com.quendic.macozetleri;

import android.app.Activity;
import android.os.Bundle;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.graphics.Color;
import android.widget.FrameLayout;

public class MainActivity extends Activity {

    private WebView webView;
    private FrameLayout fullscreenContainer;
    private View customView;
    private WebChromeClient.CustomViewCallback customViewCallback;
    private static final String APP_URL = "https://superlig-mac-ozetleri.vercel.app";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Hardware Acceleration - Video için kritik
        getWindow().setFlags(
                WindowManager.LayoutParams.FLAG_HARDWARE_ACCELERATED,
                WindowManager.LayoutParams.FLAG_HARDWARE_ACCELERATED);

        // Tam ekran ve Ekranı Açık Tut
        requestWindowFeature(Window.FEATURE_NO_TITLE);
        getWindow().setFlags(
                WindowManager.LayoutParams.FLAG_FULLSCREEN,
                WindowManager.LayoutParams.FLAG_FULLSCREEN);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        // Ana layout: WebView + fullscreen container
        FrameLayout rootLayout = new FrameLayout(this);
        rootLayout.setBackgroundColor(Color.BLACK);

        webView = new WebView(this);
        webView.setBackgroundColor(Color.BLACK);
        rootLayout.addView(webView, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT));

        // Video tam ekran için ayrı container
        fullscreenContainer = new FrameLayout(this);
        fullscreenContainer.setBackgroundColor(Color.BLACK);
        fullscreenContainer.setVisibility(View.GONE);
        rootLayout.addView(fullscreenContainer, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT));

        setContentView(rootLayout);

        // WebView ayarları
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        settings.setAllowFileAccess(true);
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);

        // User-Agent'a TV ekle
        String ua = settings.getUserAgentString();
        settings.setUserAgentString(ua + " AndroidTV MacOzetleri/1.0");

        // Linkleri WebView içinde aç
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                view.loadUrl(url);
                return true;
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                webView.requestFocus();
                // TV'de elementlerin odaklanabilir olmasını zorla
                webView.evaluateJavascript(
                        "(function() {" +
                                "  function makeFocusable() {" +
                                "    const selectors = ['video', 'button', 'a', '[role=\"button\"]', '.video-container', '.match-card'];"
                                +
                                "    selectors.forEach(sel => {" +
                                "      document.querySelectorAll(sel).forEach(el => {" +
                                "        if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '0');" +
                                "      });" +
                                "    });" +
                                "  }" +
                                "  makeFocusable();" +
                                "  setInterval(makeFocusable, 3000);" +
                                "})()",
                        null);
            }
        });

        // Tam ekran video desteği
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onShowCustomView(View view, CustomViewCallback callback) {
                if (customView != null) {
                    callback.onCustomViewHidden();
                    return;
                }

                customView = view;
                customViewCallback = callback;

                webView.setVisibility(View.GONE);
                fullscreenContainer.setVisibility(View.VISIBLE);
                fullscreenContainer.addView(view, new FrameLayout.LayoutParams(
                        FrameLayout.LayoutParams.MATCH_PARENT,
                        FrameLayout.LayoutParams.MATCH_PARENT));

                hideSystemUI();
                view.requestFocus(); // Tam ekran görünümüne odağı ver
            }

            @Override
            public void onHideCustomView() {
                if (customView == null)
                    return;

                fullscreenContainer.removeView(customView);
                fullscreenContainer.setVisibility(View.GONE);
                customView = null;

                webView.setVisibility(View.VISIBLE);

                if (customViewCallback != null) {
                    customViewCallback.onCustomViewHidden();
                    customViewCallback = null;
                }

                hideSystemUI();
                webView.requestFocus();
            }
        });

        // TV Kumanda (D-pad) ayarları
        webView.setFocusable(true);
        webView.setFocusableInTouchMode(true);
        webView.setDescendantFocusability(ViewGroup.FOCUS_AFTER_DESCENDANTS);
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
            webView.setDefaultFocusHighlightEnabled(true);
        }

        // Sayfayı yükle
        webView.loadUrl(APP_URL);

        // Başlangıçta da sistem UI gizle
        hideSystemUI();
    }

    private void hideSystemUI() {
        getWindow().getDecorView().setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                        | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY);
    }

    private boolean isFullscreen() {
        return customView != null;
    }

    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        // BACK tuşu her zaman öncelikli (Tam ekrandan çıkış veya geri gelme)
        if (keyCode == KeyEvent.KEYCODE_BACK) {
            if (isFullscreen()) {
                if (customViewCallback != null) {
                    customViewCallback.onCustomViewHidden();
                }
                fullscreenContainer.removeAllViews();
                fullscreenContainer.setVisibility(View.GONE);
                webView.setVisibility(View.VISIBLE);
                customView = null;
                customViewCallback = null;
                hideSystemUI();
                return true;
            }
            if (webView.canGoBack()) {
                webView.goBack();
                return true;
            }
        }

        // Artık tuşları özel olarak işlemiyoruz.
        // Hepsini doğrudan WebView'e (dolayısıyla web sitesine) bırakıyoruz.
        // Web sitesi (page.js) kendi klavye dinleyicisi ile bunları karşılayacak.
        return super.onKeyDown(keyCode, event);
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) {
            hideSystemUI();
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (webView != null) {
            webView.onResume();
            webView.resumeTimers();
        }
        hideSystemUI();
    }

    @Override
    protected void onPause() {
        if (webView != null) {
            webView.onPause();
            webView.pauseTimers();
        }
        super.onPause();
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.loadUrl("about:blank");
            webView.destroy();
        }
        super.onDestroy();
    }
}
