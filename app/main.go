package main

import (
	"fmt"
	"log"
	"net"
	"net/http"

	"github.com/adrianliechti/bridge/pkg/config"
	"github.com/adrianliechti/bridge/pkg/server"
	"github.com/adrianliechti/bridge/pkg/window"
)

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
		log.Fatal(http.Serve(ln, srv))
	}()

	url := fmt.Sprintf("http://127.0.0.1:%d", ln.Addr().(*net.TCPAddr).Port)
	log.Printf("Bridge is running at %s", url)

	err = window.Run(window.Options{
		Title: "Bridge",
		URL:   url,

		Width:  1280,
		Height: 768,
	})

	if err != nil {
		log.Fatal(err)
	}
}
