package users

import (
	"errors"
	"fmt"
	"net/url"
	"regexp"
	"strings"
)

// SocialPlatforms are the networks a profile can link to, in display order.
//
// Only a validated handle is stored; the link itself is built from it by the
// app, so a profile can never point anywhere except the platform's own site.
var SocialPlatforms = []string{"instagram", "twitter", "youtube", "tiktok", "telegram"}

type socialRule struct {
	label  string
	hosts  []string
	handle *regexp.Regexp
	// notHandles are first path segments that are pages, not profiles.
	notHandles map[string]bool
}

var socialRules = map[string]socialRule{
	"instagram": {
		label:      "Instagram",
		hosts:      []string{"instagram.com"},
		handle:     regexp.MustCompile(`^[A-Za-z0-9._]{1,30}$`),
		notHandles: set("p", "reel", "reels", "stories", "explore", "accounts", "tv", "direct"),
	},
	"twitter": {
		label:      "X (Twitter)",
		hosts:      []string{"x.com", "twitter.com"},
		handle:     regexp.MustCompile(`^[A-Za-z0-9_]{1,15}$`),
		notHandles: set("i", "home", "intent", "search", "share", "hashtag", "explore", "settings", "messages"),
	},
	"youtube": {
		label: "YouTube",
		hosts: []string{"youtube.com"},
		// An @handle (without the @) or a channel id (UC + 22 characters).
		handle: regexp.MustCompile(`^([A-Za-z0-9._-]{3,30}|UC[A-Za-z0-9_-]{22})$`),
	},
	"tiktok": {
		label:  "TikTok",
		hosts:  []string{"tiktok.com"},
		handle: regexp.MustCompile(`^[A-Za-z0-9._]{2,24}$`),
	},
	"telegram": {
		label:      "Telegram",
		hosts:      []string{"t.me", "telegram.me", "telegram.dog"},
		handle:     regexp.MustCompile(`^[A-Za-z][A-Za-z0-9_]{4,31}$`),
		notHandles: set("joinchat", "addstickers", "share", "proxy", "socks", "setlanguage"),
	},
}

func set(items ...string) map[string]bool {
	m := make(map[string]bool, len(items))
	for _, s := range items {
		m[s] = true
	}
	return m
}

// NormalizeSocial turns what a user typed (a username, an @username, or a
// link to their profile) into the bare handle to store. An empty input returns
// "" and means "remove this link".
func NormalizeSocial(platform, raw string) (string, error) {
	rule, ok := socialRules[platform]
	if !ok {
		return "", fmt.Errorf("unknown social platform %q", platform)
	}
	s := strings.TrimSpace(raw)
	if s == "" {
		return "", nil
	}
	bad := fmt.Errorf("%s: enter your username or the link to your profile", rule.label)

	handle := s
	if strings.Contains(s, "/") {
		h, err := handleFromURL(platform, rule, s)
		if err != nil {
			return "", err
		}
		handle = h
	}
	handle = strings.TrimPrefix(handle, "@")
	if rule.notHandles[strings.ToLower(handle)] || !rule.handle.MatchString(handle) {
		return "", bad
	}
	return handle, nil
}

func handleFromURL(platform string, rule socialRule, s string) (string, error) {
	bad := fmt.Errorf("%s: enter your username or the link to your profile", rule.label)
	if !strings.Contains(s, "://") {
		s = "https://" + s
	}
	u, err := url.Parse(s)
	if err != nil || u.Hostname() == "" {
		return "", bad
	}
	host := strings.ToLower(u.Hostname())
	for _, prefix := range []string{"www.", "m.", "mobile."} {
		host = strings.TrimPrefix(host, prefix)
	}
	onPlatform := false
	for _, h := range rule.hosts {
		if host == h {
			onPlatform = true
		}
	}
	if !onPlatform {
		return "", fmt.Errorf("%s: that isn't a %s link", rule.label, rule.label)
	}

	var parts []string
	for _, p := range strings.Split(u.Path, "/") {
		if p != "" {
			parts = append(parts, p)
		}
	}
	if len(parts) == 0 {
		return "", bad
	}

	switch platform {
	case "youtube":
		switch {
		case strings.HasPrefix(parts[0], "@"):
			return parts[0], nil
		case parts[0] == "channel" && len(parts) > 1:
			return parts[1], nil
		}
		return "", errors.New("YouTube: use your @handle, or a youtube.com/@handle or youtube.com/channel/... link")
	case "tiktok":
		if strings.HasPrefix(parts[0], "@") {
			return parts[0], nil
		}
		return "", bad
	case "telegram":
		if strings.HasPrefix(parts[0], "+") {
			return "", errors.New("Telegram: private invite links can't be shown; use a public username")
		}
		if parts[0] == "s" && len(parts) > 1 { // t.me/s/channel is the web preview
			return parts[1], nil
		}
	}
	return parts[0], nil
}

// NormalizeSocials validates a whole {platform: input} map and returns the
// handles to store, dropping empty ones.
func NormalizeSocials(in map[string]string) (map[string]string, error) {
	for platform := range in {
		if _, ok := socialRules[platform]; !ok {
			return nil, fmt.Errorf("unknown social platform %q", platform)
		}
	}
	out := make(map[string]string, len(in))
	for _, platform := range SocialPlatforms { // fixed order, so errors are predictable
		raw, ok := in[platform]
		if !ok {
			continue
		}
		h, err := NormalizeSocial(platform, raw)
		if err != nil {
			return nil, err
		}
		if h != "" {
			out[platform] = h
		}
	}
	return out, nil
}
