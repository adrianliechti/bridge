package main

import (
	"net/http"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"

	"github.com/adrianliechti/bridge"
	"github.com/adrianliechti/bridge/pkg/config"
	"github.com/adrianliechti/bridge/pkg/server"
)

func main() {
	cfg, err := config.New()

	if err != nil {
		panic(err)
	}

	mux, err := server.New(cfg)

	if err != nil {
		panic(err)
	}

	options := &options.App{
		Title: "Bridge",

		Width:  1280,
		Height: 768,

		AssetServer: &assetserver.Options{
			Assets: bridge.DistFS,

			Handler: http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if r.URL.Path == "/api" {
					r.URL.Path = "/api/"
				}

				if r.URL.Path == "/apis" {
					r.URL.Path = "/apis/"
				}

				println("Request for:", r.URL.Path)

				mux.ServeHTTP(w, r)
			}),
		},
	}

	if err := wails.Run(options); err != nil {
		panic(err)
	}
}
