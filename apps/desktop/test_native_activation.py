"""Contract tests for genuine UIA activation and safe keyboard fallback."""
import unittest

from native_activation import InvocationUnavailable, invoke_button


class FakePattern:
    def __init__(self, *, error=None):
        self.calls = 0
        self.error = error

    def Invoke(self):
        self.calls += 1
        if self.error:
            raise self.error


class FakeControl:
    def __init__(self, *, visible=True, enabled=True, pattern=None):
        self.visible = visible
        self.enabled = enabled
        self.iface_invoke = pattern

    def is_visible(self):
        return self.visible

    def is_enabled(self):
        return self.enabled


class NativeActivationContracts(unittest.TestCase):
    def test_visible_enabled_button_invokes_once(self):
        pattern = FakePattern()
        invoke_button(FakeControl(pattern=pattern))
        self.assertEqual(pattern.calls, 1)

    def test_hidden_button_is_not_invoked(self):
        pattern = FakePattern()
        with self.assertRaises(InvocationUnavailable):
            invoke_button(FakeControl(visible=False, pattern=pattern))
        self.assertEqual(pattern.calls, 0)

    def test_disabled_button_is_not_invoked(self):
        pattern = FakePattern()
        with self.assertRaises(InvocationUnavailable):
            invoke_button(FakeControl(enabled=False, pattern=pattern))
        self.assertEqual(pattern.calls, 0)

    def test_missing_invoke_pattern_fails_closed(self):
        with self.assertRaisesRegex(InvocationUnavailable, "absent"):
            invoke_button(FakeControl())

    def test_broken_invoke_pattern_reports_failure_for_keyboard_fallback(self):
        pattern = FakePattern(error=RuntimeError("COM failure"))
        with self.assertRaisesRegex(InvocationUnavailable, "RuntimeError"):
            invoke_button(FakeControl(pattern=pattern))
        self.assertEqual(pattern.calls, 1)


if __name__ == "__main__":
    unittest.main()
