package window

/*
#cgo CFLAGS: -x objective-c -fobjc-arc
#cgo LDFLAGS: -framework Cocoa -framework WebKit
#include <stdlib.h>

void BridgeWindowRun(const char *url, const char *title, int width, int height);
*/
import "C"

import "unsafe"

func run(opts Options) error {
	url := C.CString(opts.URL)
	defer C.free(unsafe.Pointer(url))

	title := C.CString(opts.Title)
	defer C.free(unsafe.Pointer(title))

	C.BridgeWindowRun(url, title, C.int(opts.Width), C.int(opts.Height))
	return nil
}
