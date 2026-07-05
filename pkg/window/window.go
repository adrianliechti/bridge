// Package window opens a native desktop window hosting the platform web view
// (WKWebView on macOS, WebView2 on Windows 11) pointed at a URL.
//
// It is intentionally minimal: a single window and no JavaScript bridge — the
// hosted app is expected to talk to its backend over HTTP and WebSocket on
// the given URL. Links leaving the URL's origin open in the default browser.
package window

import "runtime"

func init() {
	// The Cocoa / Win32 event loop must run on the process' main thread.
	runtime.LockOSThread()
}

type Options struct {
	Title string
	URL   string

	Width  int
	Height int
}

// Run opens the window and blocks until it is closed. It must be called from
// the main goroutine. On macOS, quitting the app terminates the process
// before Run returns.
func Run(opts Options) error {
	return run(opts)
}
