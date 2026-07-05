package main

/*
#cgo CFLAGS: -x objective-c -fobjc-arc
#cgo LDFLAGS: -framework Cocoa -framework WebKit
#include <stdlib.h>

void RunWindow(const char *url, const char *title, int width, int height);
*/
import "C"

import "unsafe"

func runWindow(opts windowOptions) {
	url := C.CString(opts.URL)
	defer C.free(unsafe.Pointer(url))

	title := C.CString(opts.Title)
	defer C.free(unsafe.Pointer(title))

	C.RunWindow(url, title, C.int(opts.Width), C.int(opts.Height))
}
