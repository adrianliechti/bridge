package window

import (
	"errors"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"syscall"
	"unsafe"

	webview2 "github.com/jchv/go-webview2"
)

var (
	user32              = syscall.NewLazyDLL("user32.dll")
	procMessageBoxW     = user32.NewProc("MessageBoxW")
	procGetDpiForSystem = user32.NewProc("GetDpiForSystem")
)

const mbIconError = 0x10

var errNoWebView2 = errors.New("failed to create a WebView2 window (is the WebView2 runtime installed?)")

func run(opts Options) error {
	dataPath := ""

	// Keep the WebView2 profile out of the install directory.
	if dir, err := os.UserCacheDir(); err == nil {
		dataPath = filepath.Join(dir, opts.Title)
	}

	base, _ := url.Parse(opts.URL)

	w := webview2.NewWithOptions(webview2.WebViewOptions{
		Debug:     os.Getenv("BRIDGE_DEBUG") != "",
		DataPath:  dataPath,
		AutoFocus: true,

		WindowOptions: webview2.WindowOptions{
			Title:  opts.Title,
			Width:  uint(scaleForDPI(opts.Width)),
			Height: uint(scaleForDPI(opts.Height)),
			IconId: 1, // RT_GROUP_ICON "#1" in the host app's winres.json
			Center: true,
		},
	})

	if w == nil {
		fatalDialog(opts.Title, "Failed to create a WebView2 window.\n\nThe WebView2 Runtime may not be installed. Get it from:\nhttps://developer.microsoft.com/microsoft-edge/webview2/")
		return errNoWebView2
	}

	defer w.Destroy()

	// WebView2 opens target="_blank" links (and middle-clicks on them) in a
	// bare popup window by default; route them to the default browser
	// instead, unless they're same-origin, in which case just navigate here.
	w.Bind("__windowOpenExternal", func(rawURL string) { openLink(w, base, rawURL) })
	w.Init(`function bridgeLinkHandler(e) {
		const anchor = e.target.closest('a[target="_blank"]');
		if (anchor && anchor.href) {
			e.preventDefault();
			__windowOpenExternal(anchor.href);
		}
	}
	document.addEventListener('click', bridgeLinkHandler, true);
	document.addEventListener('auxclick', bridgeLinkHandler, true);`)

	w.Navigate(opts.URL)
	w.Run()

	return nil
}

func openLink(w webview2.WebView, base *url.URL, rawURL string) {
	u, err := url.Parse(rawURL)

	if err != nil {
		return
	}

	if base != nil && u.Scheme == base.Scheme && u.Host == base.Host {
		w.Navigate(rawURL)
		return
	}

	// Not restricted to http(s): mirrors the macOS shell's NSWorkspace
	// openURL, which hands any scheme (mailto:, etc.) to its registered
	// handler rather than silently dropping it.
	exec.Command("rundll32", "url.dll,FileProtocolHandler", rawURL).Start()
}

func scaleForDPI(v int) int {
	dpi, _, _ := procGetDpiForSystem.Call()

	if dpi == 0 {
		return v
	}

	return int(float64(v) * float64(dpi) / 96.0)
}

func fatalDialog(title, message string) {
	t, err := syscall.UTF16PtrFromString(title)

	if err != nil {
		return
	}

	m, err := syscall.UTF16PtrFromString(message)

	if err != nil {
		return
	}

	procMessageBoxW.Call(0, uintptr(unsafe.Pointer(m)), uintptr(unsafe.Pointer(t)), mbIconError)
}
