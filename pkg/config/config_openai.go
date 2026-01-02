package config

import (
	"os"
)

func applyOpenAIConfig(cfg *Config) {
	baseURL := os.Getenv("OPENAI_BASE_URL")
	apiKey := os.Getenv("OPENAI_API_KEY")
	model := os.Getenv("OPENAI_MODEL")

	if baseURL == "" && apiKey == "" {
		return
	}

	if baseURL == "" {
		baseURL = "https://api.openai.com/v1"

		if model == "" {
			model = "gpt-5.2"
		}
	}

	cfg.OpenAI = &OpenAIConfig{
		URL:   baseURL,
		Token: apiKey,
		Model: model,
	}
}
