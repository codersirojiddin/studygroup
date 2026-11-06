package rooms

// Roles, from most to least privileged.
const (
	RoleOwner     = "owner"
	RoleModerator = "moderator"
	RoleMember    = "member"
)

// CanEdit reports whether a role may change room settings and invite codes.
func CanEdit(role string) bool { return role == RoleOwner || role == RoleModerator }

// CanDelete reports whether a role may delete the room.
func CanDelete(role string) bool { return role == RoleOwner }

// CanRemove reports whether actor may remove target from the room.
// Owners remove anyone but themselves; moderators remove plain members only.
func CanRemove(actorRole, targetRole string, self bool) bool {
	if self {
		return false
	}
	switch actorRole {
	case RoleOwner:
		return true
	case RoleModerator:
		return targetRole == RoleMember
	}
	return false
}

// CanSetRole reports whether actor may give target the new role.
// Only the owner assigns roles, and ownership itself cannot be transferred this way.
func CanSetRole(actorRole, targetRole, newRole string, self bool) bool {
	return actorRole == RoleOwner && !self && targetRole != RoleOwner &&
		(newRole == RoleModerator || newRole == RoleMember)
}
