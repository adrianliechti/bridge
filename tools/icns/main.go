// Command icns renders an Apple .icns icon from a single square source PNG
// (ideally 1024x1024), replacing the sips/iconutil pipeline.
//
//	go tool icns -in appicon.png -out icon.icns
package main

import (
	"bytes"
	"encoding/binary"
	"flag"
	"image"
	"image/png"
	"log"
	"os"

	"golang.org/x/image/draw"
)

// The PNG-based entry types modern macOS reads, matching what iconutil
// emits for a full iconset (16..512 plus their @2x variants).
var entries = []struct {
	kind string
	size int
}{
	{"icp4", 16},   // 16x16
	{"icp5", 32},   // 32x32
	{"ic07", 128},  // 128x128
	{"ic08", 256},  // 256x256
	{"ic09", 512},  // 512x512
	{"ic10", 1024}, // 512x512@2x
	{"ic11", 32},   // 16x16@2x
	{"ic12", 64},   // 32x32@2x
	{"ic13", 256},  // 128x128@2x
	{"ic14", 512},  // 256x256@2x
}

func main() {
	in := flag.String("in", "", "source png")
	out := flag.String("out", "", "target icns")
	flag.Parse()

	if *in == "" || *out == "" {
		flag.Usage()
		os.Exit(2)
	}

	data, err := os.ReadFile(*in)

	if err != nil {
		log.Fatal(err)
	}

	src, err := png.Decode(bytes.NewReader(data))

	if err != nil {
		log.Fatal(err)
	}

	rendered := map[int][]byte{}

	var body bytes.Buffer

	for _, entry := range entries {
		img, ok := rendered[entry.size]

		if !ok {
			img = render(src, entry.size)
			rendered[entry.size] = img
		}

		body.WriteString(entry.kind)
		binary.Write(&body, binary.BigEndian, uint32(8+len(img)))
		body.Write(img)
	}

	var file bytes.Buffer
	file.WriteString("icns")
	binary.Write(&file, binary.BigEndian, uint32(8+body.Len()))
	body.WriteTo(&file)

	if err := os.WriteFile(*out, file.Bytes(), 0o644); err != nil {
		log.Fatal(err)
	}
}

func render(src image.Image, size int) []byte {
	dst := image.NewRGBA(image.Rect(0, 0, size, size))
	draw.CatmullRom.Scale(dst, dst.Bounds(), src, src.Bounds(), draw.Src, nil)

	var buf bytes.Buffer

	if err := png.Encode(&buf, dst); err != nil {
		log.Fatal(err)
	}

	return buf.Bytes()
}
