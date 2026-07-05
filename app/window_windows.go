package main

import (
	"log"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"

	webview2 "github.com/jchv/go-webview2"
)

func runWindow(opts windowOptions) {
	dataPath := ""

	// Keep the WebView2 profile out of the install directory.
	if dir, err := os.UserCacheDir(); err == nil {
		dataPath = filepath.Join(dir, "Bridge")
	}

	w := webview2.NewWithOptions(webview2.WebViewOptions{
		Debug:     true,
		DataPath:  dataPath,
		AutoFocus: true,

		WindowOptions: webview2.WindowOptions{
			Title:  opts.Title,
			Width:  uint(opts.Width),
			Height: uint(opts.Height),
			IconId: 1, // RT_GROUP_ICON "#1" in winres/winres.json
			Center: true,
		},
	})

	if w == nil {
		log.Fatal("failed to create a WebView2 window (is the WebView2 runtime installed?)")
	}

	defer w.Destroy()

	// WebView2 opens target="_blank" links in a bare popup window by default;
	// route them to the default browser instead.
	w.Bind("__bridgeOpenExternal", openBrowser)
	w.Init(`document.addEventListener('click', (e) => {
		const anchor = e.target.closest('a[target="_blank"]');
		if (anchor && anchor.href) {
			e.preventDefault();
			__bridgeOpenExternal(anchor.href);
		}
	}, true);`)

	w.Navigate(opts.URL)
	w.Run()
}

func openBrowser(rawURL string) {
	u, err := url.Parse(rawURL)

	if err != nil || (u.Scheme != "http" && u.Scheme != "https") {
		return
	}

	exec.Command("rundll32", "url.dll,FileProtocolHandler", u.String()).Start()
}
