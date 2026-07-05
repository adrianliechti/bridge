// Command appbundle compiles the desktop app and assembles the macOS bundle
// at app/build/bin/Bridge.app: Go binary, Info.plist with the version stamped
// in, the generated icon.icns, and an ad-hoc code signature (required on
// Apple Silicon; the app is not notarized — the Homebrew cask strips the
// quarantine attribute instead).
//
// Run from the repository root:
//
//	go tool appbundle -version 1.2.3
package main

import (
	"bytes"
	"flag"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
)

func main() {
	version := flag.String("version", "0.0.0", "bundle version")
	flag.Parse()

	if runtime.GOOS != "darwin" {
		log.Fatal("appbundle assembles a macOS bundle and must run on macOS")
	}

	app := filepath.Join("app", "build", "bin", "Bridge.app")
	contents := filepath.Join(app, "Contents")

	if err := os.RemoveAll(app); err != nil {
		log.Fatal(err)
	}

	for _, dir := range []string{"MacOS", "Resources"} {
		if err := os.MkdirAll(filepath.Join(contents, dir), 0o755); err != nil {
			log.Fatal(err)
		}
	}

	log.Printf("compiling Bridge %s", *version)

	// Pin the target OS/arch/deployment target explicitly: left to defaults,
	// the binary's minos silently becomes the build host's OS version, and
	// the arch silently becomes the build host's arch — either can drift from
	// what the release archive name and Homebrew cask (arm64-only) promise.
	buildEnv := []string{
		"CGO_ENABLED=1",
		"GOOS=darwin",
		"GOARCH=arm64",
		"MACOSX_DEPLOYMENT_TARGET=12.0", // keep in sync with app/Info.plist LSMinimumSystemVersion
	}
	runEnv(buildEnv, "go", "build", "-trimpath", "-ldflags=-s -w", "-o", filepath.Join(contents, "MacOS", "Bridge"), "./app")

	plist, err := os.ReadFile(filepath.Join("app", "Info.plist"))

	if err != nil {
		log.Fatal(err)
	}

	plist = bytes.ReplaceAll(plist, []byte("__VERSION__"), []byte(*version))

	if err := os.WriteFile(filepath.Join(contents, "Info.plist"), plist, 0o644); err != nil {
		log.Fatal(err)
	}

	icon, err := os.ReadFile(filepath.Join("app", "icon.icns"))

	if err != nil {
		log.Fatal(err)
	}

	if err := os.WriteFile(filepath.Join(contents, "Resources", "icon.icns"), icon, 0o644); err != nil {
		log.Fatal(err)
	}

	run("codesign", "--force", "--sign", "-", app)

	log.Printf("built %s", app)
}

func run(name string, args ...string) {
	runEnv(nil, name, args...)
}

func runEnv(env []string, name string, args ...string) {
	cmd := exec.Command(name, args...)
	cmd.Env = append(os.Environ(), env...)
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr

	if err := cmd.Run(); err != nil {
		log.Fatal(err)
	}
}
