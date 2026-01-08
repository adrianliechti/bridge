package ssh

import (
	"fmt"
	"net"
	"net/url"
	"os"
	"os/user"
	"path/filepath"

	"golang.org/x/crypto/ssh"
	"golang.org/x/crypto/ssh/agent"
	"golang.org/x/crypto/ssh/knownhosts"
)

func New(u *url.URL) (*ssh.Client, error) {
	host := u.Hostname()
	port := u.Port()

	if port == "" {
		port = "22"
	}

	username := u.User.Username()

	if username == "" {
		currentUser, err := user.Current()

		if err != nil {
			return nil, fmt.Errorf("failed to get current user: %w", err)
		}

		username = currentUser.Username
	}

	authMethods := []ssh.AuthMethod{}

	if sock := os.Getenv("SSH_AUTH_SOCK"); sock != "" {
		if agentConn, err := net.Dial("unix", sock); err == nil {
			defer agentConn.Close()

			agentClient := agent.NewClient(agentConn)

			if keys, err := agentClient.List(); err == nil && len(keys) > 0 {
				authMethods = append(authMethods, ssh.PublicKeysCallback(agentClient.Signers))
			}
		}
	}

	homeDir, err := os.UserHomeDir()

	if err == nil {
		keyFiles := []string{
			filepath.Join(homeDir, ".ssh", "id_ed25519"),
			filepath.Join(homeDir, ".ssh", "id_ecdsa"),
			filepath.Join(homeDir, ".ssh", "id_rsa"),
		}

		for _, keyFile := range keyFiles {
			if key, err := os.ReadFile(keyFile); err == nil {
				signer, err := ssh.ParsePrivateKey(key)

				if err != nil {
					if _, ok := err.(*ssh.PassphraseMissingError); ok {
						continue
					}

					continue
				}

				authMethods = append(authMethods, ssh.PublicKeys(signer))
			}
		}
	}

	if len(authMethods) == 0 {
		return nil, fmt.Errorf("no SSH authentication methods available: ensure ssh-agent is running with keys loaded (ssh-add) or that you have unencrypted SSH keys in ~/.ssh/")
	}

	var hostKeyCallback ssh.HostKeyCallback

	if homeDir != "" {
		knownHostsFile := filepath.Join(homeDir, ".ssh", "known_hosts")

		if callback, err := knownhosts.New(knownHostsFile); err == nil {
			hostKeyCallback = callback
		}
	}

	if hostKeyCallback == nil {
		hostKeyCallback = ssh.InsecureIgnoreHostKey()
	}

	config := &ssh.ClientConfig{
		User: username,
		Auth: authMethods,

		HostKeyCallback: hostKeyCallback,
	}

	client, err := ssh.Dial("tcp", net.JoinHostPort(host, port), config)

	if err != nil {
		return nil, err
	}

	return client, nil
}
