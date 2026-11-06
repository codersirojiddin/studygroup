package rooms

import "testing"

func TestCanRemove(t *testing.T) {
	cases := []struct {
		actor, target string
		self, want    bool
	}{
		{RoleOwner, RoleModerator, false, true},
		{RoleOwner, RoleMember, false, true},
		{RoleOwner, RoleOwner, true, false},
		{RoleModerator, RoleMember, false, true},
		{RoleModerator, RoleModerator, false, false},
		{RoleModerator, RoleOwner, false, false},
		{RoleMember, RoleMember, false, false},
	}
	for _, c := range cases {
		if got := CanRemove(c.actor, c.target, c.self); got != c.want {
			t.Errorf("CanRemove(%s, %s, self=%v) = %v", c.actor, c.target, c.self, got)
		}
	}
}

func TestCanSetRole(t *testing.T) {
	if !CanSetRole(RoleOwner, RoleMember, RoleModerator, false) {
		t.Error("owner should promote a member")
	}
	if CanSetRole(RoleOwner, RoleMember, RoleOwner, false) {
		t.Error("ownership must not be assignable")
	}
	if CanSetRole(RoleModerator, RoleMember, RoleModerator, false) {
		t.Error("moderators must not assign roles")
	}
	if CanSetRole(RoleOwner, RoleOwner, RoleMember, true) {
		t.Error("owner must not demote themselves")
	}
}
