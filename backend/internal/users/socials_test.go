package users

import "testing"

func TestNormalizeSocial(t *testing.T) {
	cases := []struct {
		platform, in, want string
		wantErr            bool
	}{
		// plain handles
		{"instagram", "john.doe", "john.doe", false},
		{"instagram", "@john_doe", "john_doe", false},
		{"instagram", "  zoe  ", "zoe", false},
		{"instagram", "", "", false},
		{"instagram", "has space", "", true},
		{"instagram", "a-b", "", true},
		{"twitter", "elonmusk", "elonmusk", false},
		{"twitter", "waytoolongusername1", "", true},
		{"tiktok", "@some.one", "some.one", false},
		{"tiktok", "a", "", true},
		{"telegram", "go_devs_uz", "go_devs_uz", false},
		{"telegram", "abc", "", true},
		{"telegram", "1abcde", "", true},
		{"youtube", "@MrBeast", "MrBeast", false},
		{"youtube", "UCX6OQ3DkcsbYNE6H8uQQuVA", "UCX6OQ3DkcsbYNE6H8uQQuVA", false},
		{"youtube", "ab", "", true},

		// links
		{"instagram", "https://www.instagram.com/zoe/", "zoe", false},
		{"instagram", "instagram.com/zoe?igsh=abc", "zoe", false},
		{"instagram", "https://instagram.com/p/Cxyz123/", "", true},
		{"instagram", "https://example.com/zoe", "", true},
		{"instagram", "https://instagram.com.evil.com/zoe", "", true},
		{"twitter", "https://x.com/zoe_k", "zoe_k", false},
		{"twitter", "https://twitter.com/zoe_k/status/123", "zoe_k", false},
		{"twitter", "https://x.com/home", "", true},
		{"youtube", "https://www.youtube.com/@zoe", "zoe", false},
		{"youtube", "https://youtube.com/channel/UCX6OQ3DkcsbYNE6H8uQQuVA", "UCX6OQ3DkcsbYNE6H8uQQuVA", false},
		{"youtube", "https://youtube.com/watch?v=abc", "", true},
		{"youtube", "https://youtube.com/c/Name", "", true},
		{"tiktok", "https://www.tiktok.com/@some.one?lang=en", "some.one", false},
		{"tiktok", "https://www.tiktok.com/video/123", "", true},
		{"telegram", "https://t.me/go_devs_uz", "go_devs_uz", false},
		{"telegram", "t.me/s/go_devs_uz", "go_devs_uz", false},
		{"telegram", "https://t.me/+AbCdEfGh", "", true},
		{"telegram", "https://t.me/joinchat/AAAA", "", true},
		{"telegram", "https://t.me/addstickers/pack", "", true},
		{"facebook", "zoe", "", true},
	}
	for _, c := range cases {
		got, err := NormalizeSocial(c.platform, c.in)
		if (err != nil) != c.wantErr || got != c.want {
			t.Errorf("NormalizeSocial(%q, %q) = %q, %v; want %q, error=%v", c.platform, c.in, got, err, c.want, c.wantErr)
		}
	}
}

func TestNormalizeSocials(t *testing.T) {
	out, err := NormalizeSocials(map[string]string{"instagram": " @zoe ", "telegram": "", "tiktok": "https://tiktok.com/@zk"})
	if err != nil {
		t.Fatal(err)
	}
	if len(out) != 2 || out["instagram"] != "zoe" || out["tiktok"] != "zk" {
		t.Errorf("got %v", out)
	}
	if _, err := NormalizeSocials(map[string]string{"myspace": "tom"}); err == nil {
		t.Error("unknown platform should fail")
	}
	if _, err := NormalizeSocials(map[string]string{"twitter": "bad name"}); err == nil {
		t.Error("invalid handle should fail")
	}
}
