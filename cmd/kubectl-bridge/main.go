package main

import (
	"context"
	"errors"
	"fmt"
	"net"
	"os"
	"os/exec"
	"runtime"

	"k8s.io/client-go/tools/clientcmd"

	"github.com/adrianliechti/bridge/pkg/server"
)

func main() {
	loadingRules := clientcmd.NewDefaultClientConfigLoadingRules()

	kubeconfig := clientcmd.NewNonInteractiveDeferredLoadingClientConfig(loadingRules, &clientcmd.ConfigOverrides{})

	rawConfig, err := kubeconfig.RawConfig()

	if err != nil {
		panic(err)
	}

	contexts := make([]server.BridgeContext, 0)

	for context := range rawConfig.Contexts {
		contextConfig := clientcmd.NewNonInteractiveClientConfig(rawConfig, context, &clientcmd.ConfigOverrides{}, loadingRules)

		restConfig, err := contextConfig.ClientConfig()

		if err != nil {
			fmt.Printf("Warning: failed to load context %q: %v\n", context, err)
			continue
		}

		contexts = append(contexts, server.BridgeContext{
			Name:   context,
			Config: restConfig,
		})
	}

	if len(contexts) == 0 {
		panic("no valid kubernetes contexts found in kubeconfig")
	}

	port, err := getFreePort("localhost", 8888)

	if err != nil {
		panic(err)
	}

	options := &server.BridgeOptions{
		DefaultContext: rawConfig.CurrentContext,
	}

	// Set default namespace from current context
	if c, ok := rawConfig.Contexts[rawConfig.CurrentContext]; ok && c.Namespace != "" {
		options.DefaultNamespace = c.Namespace
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

	s, err := server.New(contexts, options)

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
