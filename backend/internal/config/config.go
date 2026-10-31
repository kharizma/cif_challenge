// Package config reads the backend .env file and builds Postgres DSNs.
package config

import (
	"bufio"
	"fmt"
	"net"
	"net/url"
	"os"
	"strings"
)

// Config holds .env values with access to the process environment as fallback.
type Config struct {
	values map[string]string
}

// Load reads a .env file. Missing files are an error so scripts fail loudly.
func Load(path string) (*Config, error) {
	file, err := os.Open(path)
	if err != nil {
		return nil, fmt.Errorf("open env file %s: %w", path, err)
	}
	defer file.Close()

	values := map[string]string{}
	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		key, value, found := strings.Cut(line, "=")
		if !found {
			continue
		}
		values[strings.TrimSpace(key)] = strings.Trim(strings.TrimSpace(value), `"'`)
	}
	if err := scanner.Err(); err != nil {
		return nil, fmt.Errorf("read env file %s: %w", path, err)
	}
	return &Config{values: values}, nil
}

// Get returns the .env value, then the process env, then the fallback.
func (c *Config) Get(key, fallback string) string {
	if value, ok := c.values[key]; ok && value != "" {
		return value
	}
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}

// PostgresURL builds a postgres:// URL with escaped credentials.
func (c *Config) PostgresURL() string {
	u := url.URL{
		Scheme:   "postgres",
		User:     url.UserPassword(c.Get("DB_USER", "postgres"), c.Get("DB_PASSWORD", "")),
		Host:     net.JoinHostPort(c.Get("DB_HOST", "localhost"), c.Get("DB_PORT", "5432")),
		Path:     "/" + c.Get("DB_NAME", "postgres"),
		RawQuery: "sslmode=" + c.Get("DB_SSLMODE", "disable"),
	}
	return u.String()
}
