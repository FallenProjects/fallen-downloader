package httpx

import (
	"dl/internal/platform"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

type Client struct {
	apiKey, apiURL string
	http           *http.Client
}
type UpstreamError struct{ Status int }

func (e *UpstreamError) Error() string { return fmt.Sprintf("OneGrab returned status %d", e.Status) }

func New(apiKey, apiURL string) *Client {
	return &Client{apiKey: apiKey, apiURL: strings.TrimRight(apiURL, "/"), http: &http.Client{Timeout: 25 * time.Second, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}}
}

func (c *Client) request(path string, params url.Values) (json.RawMessage, error) {
	endpoint, err := url.Parse(c.apiURL + path)
	if err != nil {
		return nil, err
	}
	endpoint.RawQuery = params.Encode()
	req, err := http.NewRequest(http.MethodGet, endpoint.String(), nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("X-API-Key", c.apiKey)
	req.Header.Set("Accept", "application/json")
	resp, err := c.http.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, &UpstreamError{Status: resp.StatusCode}
	}
	body, err := io.ReadAll(io.LimitReader(resp.Body, (2<<20)+1))
	if err != nil {
		return nil, err
	}
	if len(body) > 2<<20 {
		return nil, errors.New("response too large")
	}
	if !json.Valid(body) {
		return nil, errors.New("invalid upstream JSON")
	}
	return body, nil
}

func (c *Client) Snap(target string) (json.RawMessage, error) {
	if _, err := platform.Classify(target); err != nil {
		return nil, err
	}
	return c.request("/api/snap", url.Values{"url": {target}})
}
func (c *Client) Info(target string) (json.RawMessage, error) {
	if _, err := platform.Classify(target); err != nil {
		return nil, err
	}
	return c.request("/api/get_url", url.Values{"url": {target}})
}
func (c *Client) Track(target string) (json.RawMessage, error) {
	if _, err := platform.Classify(target); err != nil {
		return nil, err
	}
	return c.request("/api/track", url.Values{"url": {target}})
}
func (c *Client) Search(query, musicPlatform string) (json.RawMessage, error) {
	if !platform.SearchPlatformAllowed(musicPlatform) {
		return nil, errors.New("unsupported music search platform")
	}
	if platform.ContainsYouTubeLink(query) {
		return nil, platform.ErrYouTube
	}
	return c.request("/api/search", url.Values{"query": {query}, "platform": {musicPlatform}, "limit": {"12"}})
}
