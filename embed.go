package bridge

import (
	"embed"
	"io/fs"
)

var (
	//go:embed all:dist
	distFS embed.FS

	DistFS, _ = fs.Sub(distFS, "dist")
)
