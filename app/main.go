package main

import (
	"fmt"
	"log"
	"net"
	"net/http"
	"runtime"

	"github.com/adrianliechti/bridge/pkg/config"
	"github.com/adrianliechti/bridge/pkg/server"
)

func init() {
	// The native window (Cocoa / Win32 message loop) must run on the main thread.
	runtime.LockOSThread()
}

type windowOptions struct {
	Title string
	URL   string

	Width  int
	Height int
}

func main() {
	cfg, err := config.New()

	if err != nil {
		log.Fatal(err)
	}

	srv, err := server.New(cfg)

	if err != nil {
		log.Fatal(err)
	}

	ln, err := net.Listen("tcp", "127.0.0.1:0")

	if err != nil {
		log.Fatal(err)
	}

	go func() {
		if err := http.Serve(ln, srv); err != nil {
			log.Fatal(err)
		}
	}()

	url := fmt.Sprintf("http://127.0.0.1:%d", ln.Addr().(*net.TCPAddr).Port)
	log.Printf("Bridge is running at %s", url)

	runWindow(windowOptions{
		Title: "Bridge",
		URL:   url,

		Width:  1280,
		Height: 768,
	})
}
