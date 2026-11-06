package rooms

import (
	"testing"
	"time"
)

func TestTimerCycle(t *testing.T) {
	t0 := time.Date(2026, 11, 4, 10, 0, 0, 0, time.UTC)
	timer, err := DefaultTimer().Apply(TimerAction{Action: "start", FocusSeconds: 1500, BreakSeconds: 300}, t0)
	if err != nil {
		t.Fatal(err)
	}

	cases := []struct {
		after time.Duration
		phase string
		left  time.Duration
	}{
		{0, "focus", 25 * time.Minute},
		{10 * time.Minute, "focus", 15 * time.Minute},
		{25 * time.Minute, "break", 5 * time.Minute},
		{29 * time.Minute, "break", time.Minute},
		{30 * time.Minute, "focus", 25 * time.Minute}, // second round
		{56 * time.Minute, "break", 4 * time.Minute},
	}
	for _, c := range cases {
		phase, left := timer.Phase(t0.Add(c.after))
		if phase != c.phase || left != c.left {
			t.Errorf("+%v: %s %v, want %s %v", c.after, phase, left, c.phase, c.left)
		}
	}
}

func TestTimerPauseResumeSkip(t *testing.T) {
	t0 := time.Date(2026, 11, 4, 10, 0, 0, 0, time.UTC)
	timer, _ := DefaultTimer().Apply(TimerAction{Action: "start", FocusSeconds: 600, BreakSeconds: 120}, t0)

	// Pause 4 minutes in, wait an hour, resume: still 6 minutes of focus left.
	timer, err := timer.Apply(TimerAction{Action: "pause"}, t0.Add(4*time.Minute))
	if err != nil {
		t.Fatal(err)
	}
	if phase, left := timer.Phase(t0.Add(time.Hour)); phase != "focus" || left != 6*time.Minute {
		t.Fatalf("paused: %s %v", phase, left)
	}
	if _, err := timer.Apply(TimerAction{Action: "pause"}, t0); err == nil {
		t.Fatal("pausing a paused timer should fail")
	}
	resumeAt := t0.Add(time.Hour)
	timer, _ = timer.Apply(TimerAction{Action: "resume"}, resumeAt)
	if phase, left := timer.Phase(resumeAt.Add(time.Minute)); phase != "focus" || left != 5*time.Minute {
		t.Fatalf("resumed: %s %v", phase, left)
	}

	// Skip jumps straight to the break, with the full break ahead.
	skipAt := resumeAt.Add(2 * time.Minute)
	timer, _ = timer.Apply(TimerAction{Action: "skip"}, skipAt)
	if phase, left := timer.Phase(skipAt); phase != "break" || left != 2*time.Minute {
		t.Fatalf("after skip: %s %v", phase, left)
	}

	timer, _ = timer.Apply(TimerAction{Action: "reset"}, skipAt)
	if phase, _ := timer.Phase(skipAt); phase != "idle" || timer.FocusSeconds != 600 {
		t.Fatalf("after reset: %s %+v", phase, timer)
	}
	if _, err := timer.Apply(TimerAction{Action: "resume"}, skipAt); err == nil {
		t.Fatal("resuming an idle timer should fail")
	}
}

func TestTimerValidation(t *testing.T) {
	now := time.Now()
	for _, a := range []TimerAction{
		{Action: "start", FocusSeconds: 30, BreakSeconds: 300},
		{Action: "start", FocusSeconds: 1500, BreakSeconds: 4000},
		{Action: "explode"},
	} {
		if _, err := DefaultTimer().Apply(a, now); err == nil {
			t.Errorf("%+v: expected error", a)
		}
	}
}
