//go:build !darwin && !windows

package window

import "errors"

func run(Options) error {
	return errors.ErrUnsupported
}
