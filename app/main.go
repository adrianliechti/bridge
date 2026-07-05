package main

import (
	"log"
	"os"

	"github.com/adrianliechti/bridge/pkg/config"
	"github.com/adrianliechti/bridge/pkg/server"

	shell "github.com/adrianliechti/go-shell"
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

	err = shell.Run(shell.Options{
		Title:   "Bridge",
		Handler: srv,

		Width:  1280,
		Height: 768,

		MinWidth:  640,
		MinHeight: 400,

		Debug: os.Getenv("BRIDGE_DEBUG") != "",
	})

	if err != nil {
		log.Fatal(err)
	}
}
