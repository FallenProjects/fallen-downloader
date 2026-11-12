package platform

import (
	"errors"
	"net"
	"net/url"
	"strings"
)

// YouTube remains a product restriction until the Telegram integration is ready.
const YouTubeUnavailable = "YouTube and YouTube Music are temporarily unavailable. Support will return through our Telegram integration in a future update."

var ErrYouTube = errors.New(YouTubeUnavailable)
var ErrInvalid = errors.New("Enter a valid public media link from a supported platform.")
var ErrUnsupported = errors.New("This platform is not supported yet. Try a link from the supported platforms below.")

type Platform struct {
	Name, Kind string
	Hosts      []string
}

func (p Platform) HostsCSV() string { return strings.Join(p.Hosts, ",") }
func (p Platform) SearchID() string { return strings.ReplaceAll(strings.ToLower(p.Name), " ", "_") }
func SearchPlatformAllowed(id string) bool {
	for _, p := range supported {
		if p.Kind == "music" && p.SearchID() == id {
			return true
		}
	}
	return false
}

var supported = []Platform{
	{"Instagram", "social", []string{"instagram.com", "instagr.am"}},
	{"TikTok", "social", []string{"tiktok.com"}},
	{"Facebook", "social", []string{"facebook.com", "fb.com", "fb.watch"}},
	{"X", "social", []string{"x.com", "twitter.com"}},
	{"Reddit", "social", []string{"reddit.com"}},
	{"Threads", "social", []string{"threads.com", "threads.net"}},
	{"LinkedIn", "social", []string{"linkedin.com"}},
	{"Tumblr", "social", []string{"tumblr.com"}},
	{"Bluesky", "social", []string{"bsky.app"}},
	{"Pinterest", "social", []string{"pinterest.com", "pin.it"}},
	{"Snapchat", "social", []string{"snapchat.com"}},
	{"Twitch", "social", []string{"twitch.tv"}},
	{"Kick", "social", []string{"kick.com"}},
	{"Bilibili", "social", []string{"bilibili.com", "b23.tv"}},
	{"MX Player", "social", []string{"mxplayer.in"}},
	{"IMDb", "social", []string{"imdb.com"}},
	{"Prime Video", "social", []string{"primevideo.com"}},
	{"Spotify", "music", []string{"spotify.com"}},
	{"SoundCloud", "music", []string{"soundcloud.com", "snd.sc"}},
	{"Apple Music", "music", []string{"music.apple.com", "podcasts.apple.com"}},
	{"JioSaavn", "music", []string{"jiosaavn.com"}},
	{"Gaana", "music", []string{"gaana.com"}},
	{"Deezer", "music", []string{"deezer.com"}},
	{"Tidal", "music", []string{"tidal.com"}},
}

func Supported() []Platform { return append([]Platform(nil), supported...) }

func hostMatches(host, domain string) bool {
	return host == domain || strings.HasSuffix(host, "."+domain)
}

var youtubeHosts = []string{"youtube.com", "youtu.be", "youtube-nocookie.com", "youtubemusic.com", "ytmusic.com"}

func YouTubeHostsCSV() string { return strings.Join(youtubeHosts, ",") }

func IsYouTubeHost(host string) bool {
	host = strings.ToLower(strings.TrimSuffix(host, "."))
	for _, d := range youtubeHosts {
		if hostMatches(host, d) {
			return true
		}
	}
	return false
}

func ContainsYouTubeLink(input string) bool {
	for _, token := range strings.Fields(input) {
		token = strings.Trim(token, "()[]<>,.;\"'")
		if _, err := Classify(token); errors.Is(err, ErrYouTube) {
			return true
		}
	}
	return false
}

func Classify(raw string) (Platform, error) {
	if len(raw) == 0 || len(raw) > 4096 {
		return Platform{}, ErrInvalid
	}
	raw = strings.TrimSpace(raw)
	probe := raw
	if !strings.Contains(raw, "://") && !strings.HasPrefix(raw, "//") {
		probe = "https://" + raw
	}
	if possible, err := url.Parse(probe); err == nil && IsYouTubeHost(possible.Hostname()) {
		return Platform{}, ErrYouTube
	}
	u, err := url.Parse(strings.TrimSpace(raw))
	if err != nil || (u.Scheme != "https" && u.Scheme != "http") || u.Host == "" || u.User != nil || u.Port() != "" || u.Fragment != "" {
		return Platform{}, ErrInvalid
	}
	host := strings.ToLower(strings.TrimSuffix(u.Hostname(), "."))
	if IsYouTubeHost(host) {
		return Platform{}, ErrYouTube
	}
	if host == "localhost" || net.ParseIP(host) != nil || !strings.Contains(host, ".") {
		return Platform{}, ErrInvalid
	}
	for _, p := range supported {
		for _, domain := range p.Hosts {
			if hostMatches(host, domain) {
				return p, nil
			}
		}
	}
	return Platform{}, ErrUnsupported
}
