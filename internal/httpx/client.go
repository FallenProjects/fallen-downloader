package httpx

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"time"
)

// Client holds configuration for API communication.
type Client struct {
	apiKey string
	apiURL string
	http   *http.Client
}

// New creates a new Client with the given API key and base URL.
func New(apiKey, apiURL string) *Client {
	return &Client{
		apiKey: apiKey,
		apiURL: apiURL,
		http: &http.Client{
			Timeout: 30 * time.Second,
		},
	}
}

// WithTimeout returns a new Client with a custom HTTP timeout.
func (c *Client) WithTimeout(d time.Duration) *Client {
	clone := *c
	clone.http = &http.Client{Timeout: d}
	return &clone
}

// get performs a GET request to the given path with the query param `url`.
func (c *Client) get(path, targetURL string, dest any) error {
	reqURL := fmt.Sprintf("%s%s?url=%s", c.apiURL, path, url.QueryEscape(targetURL))

	req, err := http.NewRequest(http.MethodGet, reqURL, nil)
	if err != nil {
		return fmt.Errorf("build request: %w", err)
	}
	req.Header.Set("X-API-Key", c.apiKey)

	resp, err := c.http.Do(req)
	if err != nil {
		return fmt.Errorf("do request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return c.decodeError(resp)
	}

	if err := json.NewDecoder(resp.Body).Decode(dest); err != nil {
		return fmt.Errorf("decode response: %w", err)
	}
	return nil
}

// decodeError reads an error response body and returns a formatted error.
func (c *Client) decodeError(resp *http.Response) error {
	var errResp struct {
		Message string `json:"message"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&errResp); err == nil && errResp.Message != "" {
		return fmt.Errorf("API error (%d): %s", resp.StatusCode, errResp.Message)
	}
	return fmt.Errorf("API error: status %d", resp.StatusCode)
}

// GetSnap fetches a snap result for the given URL.
func (c *Client) GetSnap(targetURL string) (*SnapResponse, error) {
	var result SnapResponse
	if err := c.get("/api/snap", targetURL, &result); err != nil {
		return nil, err
	}
	return &result, nil
}

// GetMusicInfo fetches music metadata for the given URL.
func (c *Client) GetMusicInfo(targetURL string) (*SearchResponse, error) {
	var result SearchResponse
	if err := c.get("/api/get_url", targetURL, &result); err != nil {
		return nil, err
	}
	return &result, nil
}

// DownloadTrack fetches track download info for the given URL.
func (c *Client) DownloadTrack(targetURL string) (*TrackResponse, error) {
	var result TrackResponse
	if err := c.get("/api/track", targetURL, &result); err != nil {
		return nil, err
	}
	return &result, nil
}
