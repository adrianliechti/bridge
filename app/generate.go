package main

// The platform resources are generated and committed; rerun `go generate ./app`
// after changing appicon.png or winres/. Tool versions are pinned via the
// `tool` directives in go.mod.

// Windows: icon, DPI manifest and version info, linked in via the .syso files.
//go:generate go tool go-winres make --in winres/winres.json --out rsrc --arch amd64,arm64

// macOS: icon.icns, copied into the bundle by `go tool appbundle`.
//go:generate go tool icns -in appicon.png -out icon.icns
