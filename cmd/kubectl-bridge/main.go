package main

import (
	"context"
	"errors"
	"fmt"
	"net"
	"os"
	"os/exec"
	"runtime"

	"github.com/adrianliechti/bridge/pkg/server"
	"k8s.io/client-go/tools/clientcmd"
)

func main() {
	loadingRules := clientcmd.NewDefaultClientConfigLoadingRules()
	configOverrides := &clientcmd.ConfigOverrides{}

	kubeconfig := clientcmd.NewNonInteractiveDeferredLoadingClientConfig(loadingRules, configOverrides)

	config, err := kubeconfig.ClientConfig()

	if err != nil {
		panic(err)
	}

	port, err := getFreePort("localhost", 8888)

	if err != nil {
		panic(err)
	}

	options := &server.Options{}

	if cfg, err := kubeconfig.RawConfig(); err == nil {
		if cfg.CurrentContext != "" {
			options.DefaultContext = cfg.CurrentContext

			if c, ok := cfg.Contexts[cfg.CurrentContext]; ok {
				options.DefaultNamespace = c.Namespace
			}
		}
	}

	if val := os.Getenv("OPENAI_BASE_URL"); val != "" {
		options.OpenAIBaseURL = val
	}

	if val := os.Getenv("OPENAI_API_KEY"); val != "" {
		options.OpenAIKey = val

		if options.OpenAIBaseURL == "" {
			options.OpenAIModel = "gpt-5.2"
			options.OpenAIBaseURL = "https://api.openai.com/v1"
		}
	}

	if val := os.Getenv("OPENAI_MODEL"); val != "" {
		options.OpenAIModel = val
	}

	s, err := server.New(config, options)

	if err != nil {
		panic(err)
	}

	url := fmt.Sprintf("http://localhost:%d", port)
	addr := fmt.Sprintf("localhost:%d", port)

	if err := openBrowser(url); err != nil {
		fmt.Printf("Please open your browser and navigate to %s\n", url)
	}

	if err := s.ListenAndServe(context.Background(), addr); err != nil {
		panic(err)
	}
}

func getFreePort(host string, port int) (int, error) {
	if port > 0 {
		listener, err := net.Listen("tcp", fmt.Sprintf("%s:%d", host, port))

		if err == nil {
			listener.Close()
			return port, nil
		}
	}

	listener, err := net.Listen("tcp", ":0")

	if err != nil {
		return 0, fmt.Errorf("failed to find a free port: %w", err)
	}

	defer listener.Close()

	addr := listener.Addr().(*net.TCPAddr)
	return addr.Port, nil
}

func openBrowser(url string) error {
	switch runtime.GOOS {
	case "darwin":
		cmd := exec.Command("open", url)
		return cmd.Start()

	case "linux":
		cmd := exec.Command("xdg-open", url)
		return cmd.Start()

	case "windows":
		cmd := exec.Command("rundll32", "url.dll,FileProtocolHandler", url)
		return cmd.Start()
	}

	return errors.ErrUnsupported
}
